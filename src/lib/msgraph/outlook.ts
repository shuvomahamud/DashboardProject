import { graphFetch } from './client';

export interface Message {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  } | null;
  receivedDateTime: string;
  hasAttachments: boolean;
  bodyPreview?: string;
}

export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  '@odata.type': string;
  contentBytes?: string;
}

export interface MessagesResponse {
  messages: Message[];
  next?: string;
}

export interface AttachmentsResponse {
  attachments: Attachment[];
}

const GRAPH_DEBUG_ENABLED = process.env.MS_GRAPH_DEBUG === 'true';

const DEFAULT_MS_BULK_PAGE_SIZE = 1000;
const DEFAULT_MS_BULK_MAX_PAGES = 5;
const DEFAULT_MS_BULK_LOOKBACK_DAYS = 365;
const DEFAULT_MS_SEARCH_LOOKBACK_DAYS = 1095;
const GRAPH_MAX_PAGE_SIZE = 1000;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clampPageSize = (size: number) => Math.max(1, Math.min(GRAPH_MAX_PAGE_SIZE, size));

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ');

const subjectMatches = (subject: string | undefined, query: string) => {
  if (!query.trim()) {
    return true;
  }
  const normalizedSubject = normalizeWhitespace(subject || '').toLowerCase();
  const tokens = normalizeWhitespace(query).toLowerCase().split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  return tokens.every(token => normalizedSubject.includes(token));
};

const graphDebug = (message: string, context?: Record<string, unknown>) => {
  if (!GRAPH_DEBUG_ENABLED) {
    return;
  }
  if (context) {
    console.info(`[msgraph] ${message}`, context);
  } else {
    console.info(`[msgraph] ${message}`);
  }
};

export interface SearchMessagesOptions {
  mode?: 'bulk' | 'graph-search';
  lookbackDays?: number;
  pageSize?: number;
  maxPages?: number;
  subjectFilter?: string;
}

export async function searchMessages(
  searchText: string,
  limit: number = 5000,
  mailboxUserId?: string,
  options: SearchMessagesOptions = {}
): Promise<MessagesResponse> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  const trimmedSearch = searchText?.trim() ?? '';

  const requestedMode = options.mode ?? (trimmedSearch.length > 0 ? 'graph-search' : 'bulk');
  const mode: 'bulk' | 'graph-search' = requestedMode === 'bulk' ? 'bulk' : 'graph-search';
  const subjectFilter = options.subjectFilter ?? trimmedSearch;
  const normalizedSubjectFilter = subjectFilter.trim();

  const allMessages: Message[] = [];

  const lookbackDays = Math.max(
    1,
    options.lookbackDays ?? (
      mode === 'bulk'
        ? parsePositiveInt(process.env.MS_BULK_LOOKBACK_DAYS, DEFAULT_MS_BULK_LOOKBACK_DAYS)
        : parsePositiveInt(process.env.MS_IMPORT_LOOKBACK_DAYS, DEFAULT_MS_SEARCH_LOOKBACK_DAYS)
    )
  );
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);
  const utcStart = startDate.toISOString();

  const selectFields = 'id,subject,hasAttachments,receivedDateTime,from,bodyPreview';

  // ---------- TEXT SEARCH MODE (Outlook-like full-text search across ALL folders) ----------
  if (mode === 'graph-search') {
    graphDebug('MS Graph: searching', { searchText: trimmedSearch });

    // Escape quotes in search phrase and encode for URL
    const phrase = trimmedSearch.replace(/"/g, '\\"');
    const encodedPhrase = encodeURIComponent(`"${phrase}"`);
    let url = `/v1.0/users/${mailbox}/messages?$search=${encodedPhrase}&$select=${selectFields}&$top=25`;
    let pageCount = 0;
    const maxPages = 400; // Safety limit

    while (allMessages.length < limit && pageCount < maxPages) {
      const response = await graphFetch(url, {
        needsConsistencyLevel: true // This adds ConsistencyLevel: eventual header
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Graph $search failed: ${response.status} ${error}`);
      }

      const data = await response.json();
      const pageMessages = (data.value || []) as Message[];

      allMessages.push(...pageMessages);

      const nextLink = data['@odata.nextLink'];
      if (!nextLink || pageMessages.length === 0) {
        break;
      }

      url = nextLink;
      pageCount++;

      if (allMessages.length >= limit) {
        break;
      }
    }

    // Post-filter locally for attachments (set to true to match original behavior)
    const attachmentsOnly = true;
    let results = attachmentsOnly ? allMessages.filter(m => m.hasAttachments) : allMessages;

    // Apply lookback date filter
    results = results.filter(m => new Date(m.receivedDateTime) >= new Date(utcStart));

    if (normalizedSubjectFilter.length > 0) {
      results = results.filter(m => subjectMatches(m.subject, normalizedSubjectFilter));
    }

    // Sort by receivedDateTime desc (newest first)
    results.sort((a, b) => +new Date(b.receivedDateTime) - +new Date(a.receivedDateTime));

    graphDebug('MS Graph: search complete', {
      count: results.length,
      pages: pageCount,
      subjectFilterApplied: normalizedSubjectFilter.length > 0
    });

    return {
      messages: results.slice(0, limit),
      next: undefined
    };
  }

  // ---------- BULK MODE (NO TEXT) — Inbox scan with filters ----------
  const pageSize = clampPageSize(options.pageSize ?? parsePositiveInt(process.env.MS_BULK_PAGE_SIZE, DEFAULT_MS_BULK_PAGE_SIZE));
  const maxPages = Math.max(1, options.maxPages ?? parsePositiveInt(process.env.MS_BULK_MAX_PAGES, DEFAULT_MS_BULK_MAX_PAGES));

  graphDebug('MS Graph: bulk inbox scan starting', {
    mailbox,
    lookbackDays,
    limit,
    pageSize,
    maxPages,
    subjectFilterApplied: normalizedSubjectFilter.length > 0
  });

  let url = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages?$select=${selectFields}&$filter=receivedDateTime ge ${utcStart} and hasAttachments eq true&$orderby=receivedDateTime desc&$top=${pageSize}`;
  let nextUrl: string | undefined;
  let pagesFetched = 0;

  while (allMessages.length < limit && pagesFetched < maxPages) {
    const response = await graphFetch(nextUrl || url);

    if (!response.ok) {
      const error = await response.text();

      // Fallback: Remove hasAttachments filter if we get InefficientFilter error
      if (response.status === 400 && error.includes('InefficientFilter')) {
        graphDebug('MS Graph: InefficientFilter detected, removing hasAttachments filter');
        url = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages?$select=${selectFields}&$filter=receivedDateTime ge ${utcStart}&$top=${pageSize}`;
        nextUrl = undefined;
        continue;
      }

      throw new Error(`Inbox scan failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    const pageMessages = (data.value || []) as Message[];

    allMessages.push(...pageMessages);
    nextUrl = data['@odata.nextLink'];

    pagesFetched++;

    if (!nextUrl || pageMessages.length === 0) {
      break;
    }
  }

  let results = allMessages;

  // Always filter out messages without attachments to match legacy behaviour
  results = results.filter(m => m.hasAttachments);

  // Apply subject/title filter if provided
  if (normalizedSubjectFilter.length > 0) {
    results = results.filter(m => subjectMatches(m.subject, normalizedSubjectFilter));
  }

  // Enforce lookback again in case any messages slipped through when the filter was removed
  results = results.filter(m => new Date(m.receivedDateTime) >= new Date(utcStart));

  // Sort newest first
  results.sort((a, b) => +new Date(b.receivedDateTime) - +new Date(a.receivedDateTime));

  graphDebug('MS Graph: bulk inbox scan complete', {
    requested: allMessages.length,
    retained: results.length,
    pagesFetched,
    subjectFilterApplied: normalizedSubjectFilter.length > 0
  });

  return {
    messages: results.slice(0, limit),
    next: undefined
  };
}

export async function listAttachments(messageId: string, mailboxUserId?: string): Promise<AttachmentsResponse> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  // Use /messages/ instead of /mailFolders/Inbox/messages/ to support messages from any folder
  // URL-encode messageId to handle special characters
  const url = `/v1.0/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$top=50`;

  graphDebug('MS Graph: listAttachments request', {
    messageIdLength: messageId.length,
    messageIdPreview: `${messageId.substring(0, 30)}...`,
    urlPreview: `${url.substring(0, 120)}...`
  });

  const response = await graphFetch(url);

  if (!response.ok) {
    const error = await response.text();
    console.error('[msgraph] listAttachments failed', { status: response.status, error });
    throw new Error(`Failed to list attachments: ${response.status} ${error}`);
  }

  const data = await response.json();

  return {
    attachments: data.value || []
  };
}

export async function getFileAttachmentBytes(
  messageId: string,
  attachmentId: string,
  mailboxUserId?: string
): Promise<Uint8Array> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  // Use /messages/ instead of /mailFolders/Inbox/messages/ to support messages from any folder
  // URL-encode both messageId and attachmentId to handle special characters
  const url = `/v1.0/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const response = await graphFetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get attachment: ${response.status} ${error}`);
  }

  const attachment = await response.json();
  
  // Only handle file attachments, not item attachments
  if (attachment['@odata.type'] !== '#microsoft.graph.fileAttachment') {
    throw new Error('Only file attachments are supported');
  }

  if (!attachment.contentBytes) {
    throw new Error('No content bytes in attachment');
  }

  // Convert base64 to bytes
  const base64Data = attachment.contentBytes;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

// Attachment eligibility check policy
export function isAttachmentEligible(attachment: Attachment): boolean {
  const allowedExtensions = (process.env.IMPORT_ALLOWED_EXTS || 'pdf,docx').toLowerCase().split(',');
  const maxSizeMB = 10; // 10MB max
  
  // Check file extension
  const fileName = attachment.name.toLowerCase();
  const hasAllowedExtension = allowedExtensions.some(ext => fileName.endsWith(`.${ext.trim()}`));
  
  if (!hasAllowedExtension) {
    return false;
  }
  
  // Check file size (10MB limit)
  if (attachment.size > maxSizeMB * 1024 * 1024) {
    return false;
  }
  
  // Must be a file attachment (not calendar item, etc)
  if (attachment['@odata.type'] !== '#microsoft.graph.fileAttachment') {
    return false;
  }

  return true;
}

export async function checkEmailEligibility(
  messageId: string,
  mailboxUserId?: string
): Promise<{ eligible: boolean; eligibleAttachments: Attachment[]; totalAttachments: number }> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  try {
    // Use /messages/ instead of /mailFolders/Inbox/messages/ to support messages from any folder
    // URL-encode messageId to handle special characters
    const url = `/v1.0/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$top=50`;
    const response = await graphFetch(url);

    if (!response.ok) {
      // If we can't get attachments, assume not eligible
      return { eligible: false, eligibleAttachments: [], totalAttachments: 0 };
    }

    const data = await response.json();
    const attachments: Attachment[] = data.value || [];
    
    const eligibleAttachments = attachments.filter(isAttachmentEligible);
    
    return {
      eligible: eligibleAttachments.length > 0,
      eligibleAttachments,
      totalAttachments: attachments.length
    };
  } catch (error) {
    console.warn(`Failed to check eligibility for message ${messageId}:`, error);
    return { eligible: false, eligibleAttachments: [], totalAttachments: 0 };
  }
}
