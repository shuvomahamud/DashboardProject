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

export async function searchMessages(
  searchText: string,
  limit: number = 5000,
  mailboxUserId?: string
): Promise<MessagesResponse> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  // Determine if we're doing a text search or bulk import
  const isTextSearch = Boolean(searchText && searchText.trim().length > 0);
  const allMessages: Message[] = [];

  // Configure lookback window
  const defaultLookback = isTextSearch ? '1095' : '365'; // 3 years if searching, 1 year otherwise
  const lookbackDays = parseInt(process.env.MS_IMPORT_LOOKBACK_DAYS || defaultLookback, 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);
  const utcStart = startDate.toISOString();

  const selectFields = 'id,subject,hasAttachments,receivedDateTime,from,bodyPreview';

  // ---------- TEXT SEARCH MODE (Outlook-like full-text search across ALL folders) ----------
  if (isTextSearch) {
    console.log(`Starting full-text search across all folders for: "${searchText}"`);

    // Escape quotes in search phrase and encode for URL
    const phrase = searchText.replace(/"/g, '\\"').trim();
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

      console.log(`Page ${pageCount + 1}: Retrieved ${pageMessages.length} messages`);
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

    console.log(`Raw search results: ${allMessages.length} messages`);

    // Post-filter locally for attachments (set to true to match original behavior)
    const attachmentsOnly = true;
    let results = attachmentsOnly ? allMessages.filter(m => m.hasAttachments) : allMessages;
    console.log(`After attachment filter: ${results.length} messages`);

    // Apply lookback date filter
    results = results.filter(m => new Date(m.receivedDateTime) >= new Date(utcStart));
    console.log(`After date filter (${lookbackDays} days): ${results.length} messages`);

    // Sort by receivedDateTime desc (newest first)
    results.sort((a, b) => +new Date(b.receivedDateTime) - +new Date(a.receivedDateTime));

    // Log final results
    console.log(`========================================`);
    console.log(`📧 Email Search Results (Full-Text)`);
    console.log(`========================================`);
    console.log(`Search Text: "${searchText}"`);
    console.log(`Search Mode: Full-text across ALL folders`);
    console.log(`Emails Found: ${results.length}`);
    console.log(`Emails Returned: ${Math.min(results.length, limit)}`);
    console.log(`Pages Processed: ${pageCount}`);
    console.log(`Attachments Only: ${attachmentsOnly}`);
    console.log(`Lookback Days: ${lookbackDays}`);
    console.log(`========================================`);

    return {
      messages: results.slice(0, limit),
      next: undefined
    };
  }

  // ---------- BULK MODE (NO TEXT) — Inbox scan with filters ----------
  console.log('Starting bulk mode: Inbox scan with filters');

  const pageSize = 1000;
  let url = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages?$select=${selectFields}&$filter=receivedDateTime ge ${utcStart} and hasAttachments eq true&$orderby=receivedDateTime desc&$top=${pageSize}`;
  let nextUrl: string | undefined;
  let pageCount = 0;
  const maxPages = 5;

  while (allMessages.length < limit && pageCount < maxPages) {
    const response = await graphFetch(nextUrl || url);

    if (!response.ok) {
      const error = await response.text();

      // Fallback: Remove hasAttachments filter if we get InefficientFilter error
      if (response.status === 400 && error.includes('InefficientFilter')) {
        console.log('InefficientFilter detected, removing hasAttachments filter');
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

    if (!nextUrl || pageMessages.length === 0) {
      break;
    }

    pageCount++;
  }

  console.log(`========================================`);
  console.log(`📧 Email Search Results (Bulk Mode)`);
  console.log(`========================================`);
  console.log(`Search Mode: Inbox folder only`);
  console.log(`Emails Found: ${allMessages.length}`);
  console.log(`Emails Returned: ${Math.min(allMessages.length, limit)}`);
  console.log(`Pages Processed: ${pageCount}`);
  console.log(`Lookback Days: ${lookbackDays}`);
  console.log(`========================================`);

  return {
    messages: allMessages.slice(0, limit),
    next: undefined
  };
}

export async function listAttachments(messageId: string, mailboxUserId?: string): Promise<AttachmentsResponse> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  // Log the message ID we're trying to fetch
  console.log(`📎 Fetching attachments for message ID: ${messageId} (length: ${messageId.length})`);

  // Use /messages/ instead of /mailFolders/Inbox/messages/ to support messages from any folder
  // URL-encode messageId to handle special characters
  const url = `/v1.0/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$top=50`;
  console.log(`📎 Full URL: ${url.substring(0, 100)}...`);

  const response = await graphFetch(url);

  if (!response.ok) {
    const error = await response.text();
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