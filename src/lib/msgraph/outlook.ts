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

export interface MessageDetail extends Message {
  body?: {
    contentType?: string;
    content?: string;
  };
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
  totalCount?: number;
}

export interface AttachmentsResponse {
  attachments: Attachment[];
}

interface MailFolder {
  id: string;
  displayName: string;
  parentFolderId?: string | null;
  childFolderCount?: number;
}

const GRAPH_DEBUG_ENABLED = process.env.MS_GRAPH_DEBUG === 'true';

const DEFAULT_MS_DEEP_SCAN_PAGE_SIZE = 200;
const DEFAULT_MS_DEEP_SCAN_FOLDER_PAGE_SIZE = 200;
const DEFAULT_MS_DEEP_SCAN_MAX_RESULTS = 100000;
const DEFAULT_MS_DEEP_SCAN_LOOKBACK_DAYS = 365;
const DEFAULT_MS_SEARCH_LOOKBACK_DAYS = 1095;
const GRAPH_MAX_PAGE_SIZE = 1000;
const MESSAGE_FIELDS = 'id,subject,hasAttachments,receivedDateTime,from,bodyPreview';

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
  mode?: 'deep-scan' | 'graph-search';
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

  const requestedMode = options.mode ?? (trimmedSearch.length > 0 ? 'graph-search' : 'deep-scan');
  const mode: 'graph-search' | 'deep-scan' = requestedMode === 'deep-scan' ? 'deep-scan' : 'graph-search';
  const subjectFilter = options.subjectFilter ?? trimmedSearch;
  const normalizedSubjectFilter = subjectFilter.trim();

  const allMessages: Message[] = [];
  const deepScanLookbackEnv = process.env.MS_DEEP_SCAN_LOOKBACK_DAYS || process.env.MS_BULK_LOOKBACK_DAYS;

  const lookbackDays = Math.max(
    1,
    options.lookbackDays ?? (
      mode === 'deep-scan'
        ? parsePositiveInt(deepScanLookbackEnv, DEFAULT_MS_DEEP_SCAN_LOOKBACK_DAYS)
        : parsePositiveInt(process.env.MS_IMPORT_LOOKBACK_DAYS, DEFAULT_MS_SEARCH_LOOKBACK_DAYS)
    )
  );
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);
  const utcStart = startDate.toISOString();

  const selectFields = MESSAGE_FIELDS;

  // ---------- TEXT SEARCH MODE (Outlook-like full-text search across ALL folders) ----------
  if (mode === 'graph-search') {
    graphDebug('MS Graph: searching', { searchText: trimmedSearch });

    // Escape quotes in search phrase and encode for URL
    const phrase = trimmedSearch.replace(/"/g, '\\"');
    const encodedPhrase = encodeURIComponent(`"${phrase}"`);
    let url = `/v1.0/users/${mailbox}/messages?$search=${encodedPhrase}&$select=${selectFields}&$top=25&$count=true`;
    let pageCount = 0;
    const maxPages = 400; // Safety limit

    let reportedCount: number | undefined;

    while (allMessages.length < limit && pageCount < maxPages) {
      const response = await graphFetch(url, {
        needsConsistencyLevel: true // This adds ConsistencyLevel: eventual header
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Graph $search failed: ${response.status} ${error}`);
      }

      const data = await response.json();
      if (reportedCount === undefined && typeof data['@odata.count'] === 'number') {
        reportedCount = data['@odata.count'];
      }
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
    if (results.length >= limit) {
      console.warn('[msgraph] Graph $search returned limit-sized result set. Consider deep scan for completeness.', {
        limit,
        fetched: results.length,
        searchText: trimmedSearch
      });
    }

    return {
      messages: results.slice(0, limit),
      next: undefined,
      totalCount: reportedCount
    };
  }

  const deepScanMessages = await deepScanMailbox({
    mailbox,
    normalizedSubjectFilter,
    lookbackDays,
    limit,
    utcStart
  });

  return {
    messages: deepScanMessages,
    next: undefined
  };
}

export async function getMessageDetail(
  messageId: string,
  mailboxUserId?: string
): Promise<MessageDetail> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  const url = `/v1.0/users/${mailbox}/messages/${encodeURIComponent(
    messageId
  )}?$select=id,subject,hasAttachments,receivedDateTime,from,bodyPreview,body`;

  const response = await graphFetch(url);
  if (!response.ok) {
    const error = await response.text();
    console.error('[msgraph] getMessageDetail failed', { status: response.status, error });
    throw new Error(`Failed to fetch message detail: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data as MessageDetail;
}

interface DeepScanOptions {
  mailbox: string;
  normalizedSubjectFilter: string;
  lookbackDays: number;
  limit?: number;
  utcStart: string;
}

async function deepScanMailbox(options: DeepScanOptions): Promise<Message[]> {
  const {
    mailbox,
    normalizedSubjectFilter,
    lookbackDays,
    limit,
    utcStart
  } = options;
  const pageSize = clampPageSize(parsePositiveInt(process.env.MS_DEEP_SCAN_PAGE_SIZE, DEFAULT_MS_DEEP_SCAN_PAGE_SIZE));
  const folderPageSize = Math.max(1, parsePositiveInt(process.env.MS_DEEP_SCAN_FOLDER_PAGE_SIZE, DEFAULT_MS_DEEP_SCAN_FOLDER_PAGE_SIZE));
  const maxResults = Math.max(1, Math.min(limit ?? DEFAULT_MS_DEEP_SCAN_MAX_RESULTS, DEFAULT_MS_DEEP_SCAN_MAX_RESULTS));
  const sinceDate = new Date(utcStart);

  graphDebug('MS Graph: deep scan starting', {
    mailbox,
    lookbackDays,
    pageSize,
    maxResults,
    subjectFilterApplied: normalizedSubjectFilter.length > 0
  });

  const folders = await fetchAllFolders(mailbox, folderPageSize);
  folders.sort((a, b) => folderPriorityValue(a.displayName) - folderPriorityValue(b.displayName));

  const results: Message[] = [];

  for (const folder of folders) {
    if (results.length >= maxResults) {
      break;
    }
    if (shouldSkipFolder(folder.displayName)) {
      graphDebug('MS Graph: deep scan skipping folder', { folder: folder.displayName });
      continue;
    }
    const remaining = maxResults - results.length;
    const folderMessages = await fetchFolderMessages({
      mailbox,
      folderId: folder.id,
      normalizedSubjectFilter,
      sinceDate,
      limit: remaining,
      pageSize
    });
    if (folderMessages.length > 0) {
      graphDebug('MS Graph: deep scan folder collected', {
        folder: folder.displayName,
        collected: folderMessages.length
      });
    }
    results.push(...folderMessages);
  }

  graphDebug('MS Graph: deep scan complete', {
    folders: folders.length,
    collected: results.length,
    subjectFilterApplied: normalizedSubjectFilter.length > 0
  });

  return results;
}

function folderPriorityValue(name?: string): number {
  const normalized = (name || '').toLowerCase();
  if (normalized === 'inbox') return 0;
  if (normalized === 'sent items') return 1;
  if (normalized === 'deleted items') return 2;
  return 3;
}

function shouldSkipFolder(name?: string): boolean {
  if (!name) {
    return false;
  }
  const normalized = name.toLowerCase().trim();
  return normalized === 'sent items';
}

async function fetchAllFolders(mailbox: string, pageSize: number): Promise<MailFolder[]> {
  const folders: MailFolder[] = [];
  const queue: (string | null)[] = [null];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const parentId = queue.shift() ?? null;
    const children = await fetchChildFolders(mailbox, parentId, pageSize);
    for (const child of children) {
      if (seen.has(child.id)) {
        continue;
      }
      seen.add(child.id);
      folders.push(child);
      if ((child.childFolderCount || 0) > 0) {
        queue.push(child.id);
      }
    }
  }

  return folders;
}

async function fetchChildFolders(mailbox: string, parentId: string | null, pageSize: number): Promise<MailFolder[]> {
  const base = parentId
    ? `/v1.0/users/${mailbox}/mailFolders/${encodeURIComponent(parentId)}/childFolders`
    : `/v1.0/users/${mailbox}/mailFolders`;
  let url = `${base}?$select=id,displayName,parentFolderId,childFolderCount&$top=${pageSize}`;
  const folders: MailFolder[] = [];

  while (url) {
    const response = await graphFetch(url);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list folders: ${response.status} ${error}`);
    }
    const data = await response.json();
    folders.push(...((data.value || []) as MailFolder[]));
    url = data['@odata.nextLink'] || '';
  }

  return folders;
}

interface FetchFolderMessagesOptions {
  mailbox: string;
  folderId: string;
  normalizedSubjectFilter: string;
  sinceDate: Date;
  limit: number;
  pageSize: number;
}

async function fetchFolderMessages(options: FetchFolderMessagesOptions): Promise<Message[]> {
  const {
    mailbox,
    folderId,
    normalizedSubjectFilter,
    sinceDate,
    limit,
    pageSize
  } = options;
  const collected: Message[] = [];
  const encodedFolder = encodeURIComponent(folderId);
  let url = `/v1.0/users/${mailbox}/mailFolders/${encodedFolder}/messages?$select=${MESSAGE_FIELDS}&$orderby=receivedDateTime desc&$top=${pageSize}&$filter=receivedDateTime ge ${sinceDate.toISOString()} and hasAttachments eq true`;

  while (url && collected.length < limit) {
    const response = await graphFetch(url);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Folder scan failed (${folderId}): ${response.status} ${error}`);
    }

    const data = await response.json();
    const pageMessages = (data.value || []) as Message[];
    let stopFolder = false;

    for (const message of pageMessages) {
      const receivedAt = new Date(message.receivedDateTime);
      if (receivedAt < sinceDate) {
        stopFolder = true;
        break;
      }

      if (normalizedSubjectFilter.length > 0 && !subjectMatches(message.subject, normalizedSubjectFilter)) {
        continue;
      }

      if (!message.hasAttachments) {
        continue;
      }

      collected.push(message);
      if (collected.length >= limit) {
        stopFolder = true;
        break;
      }
    }

    if (stopFolder) {
      break;
    }

    const nextLink = data['@odata.nextLink'];
    if (!nextLink) {
      break;
    }
    url = nextLink;
  }

  return collected;
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
