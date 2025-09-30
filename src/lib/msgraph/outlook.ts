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

  // Configure lookback window (default 365 days, configurable via env)
  // If we have a specific search text, use a longer lookback to find older emails
  const defaultLookback = searchText ? '1095' : '365'; // 3 years if searching, 1 year otherwise
  const lookbackDays = parseInt(process.env.MS_IMPORT_LOOKBACK_DAYS || defaultLookback);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);
  const utcStart = startDate.toISOString();

  const allMessages: Message[] = [];
  const pageSize = 1000;
  const maxPages = 5; // Limit to 5 pages = 5000 messages max
  let pageCount = 0;
  let nextUrl: string | undefined;

  // Use Inbox folder endpoint with proper $select for performance
  const selectFields = 'id,subject,hasAttachments,receivedDateTime,from,bodyPreview';

  // If searchText is provided, use Graph API's $search for full body search
  // Otherwise use $filter for date range and attachments
  let currentUrl: string;
  let useGraphSearch = false;

  if (searchText && searchText.trim()) {
    // Use Microsoft Graph search to find the ID in email subjects
    // $search with "subject:" prefix restricts search to subject line only
    const encodedSearch = encodeURIComponent(`subject:"${searchText.trim()}"`);
    currentUrl = `/v1.0/users/${mailbox}/messages?$search=${encodedSearch}&$select=${selectFields}&$filter=receivedDateTime ge ${utcStart} and hasAttachments eq true&$orderby=receivedDateTime desc&$top=${pageSize}`;
    useGraphSearch = true;
  } else {
    // Primary approach: date range + hasAttachments filter with orderby
    currentUrl = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages?$select=${selectFields}&$filter=receivedDateTime ge ${utcStart} and hasAttachments eq true&$orderby=receivedDateTime desc&$top=${pageSize}`;
  }

  let useAttachmentFallback = false;

  // Keep fetching pages until we have enough messages, hit page limit, or no more pages
  while (allMessages.length < limit && pageCount < maxPages) {
    try {
      const response = await graphFetch(nextUrl || currentUrl, { needsConsistencyLevel: useGraphSearch });

      if (!response.ok) {
        const error = await response.text();

        // If we get InefficientFilter error, try fallback approach
        if (response.status === 400 && error.includes('InefficientFilter')) {
          console.log('InefficientFilter detected, switching to fallback approach');
          useAttachmentFallback = true;
          useGraphSearch = false;
          // Fallback A: Remove hasAttachments from filter, keep date range + orderby
          currentUrl = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages?$select=${selectFields}&$filter=receivedDateTime ge ${utcStart}&$orderby=receivedDateTime desc&$top=${pageSize}`;
          nextUrl = undefined; // Reset for retry
          continue;
        }

        throw new Error(`Failed to search messages: ${response.status} ${error}`);
      }

      const data = await response.json();
      const pageMessages = data.value || [];

      // If using fallback, filter for hasAttachments locally
      let filteredMessages = pageMessages;
      if (useAttachmentFallback) {
        filteredMessages = pageMessages.filter((message: Message) => message.hasAttachments);
      }

      // When using Graph API search, results are already filtered by searchText
      // Only apply local filtering if NOT using Graph search and searchText is provided
      if (searchText && !useGraphSearch) {
        const cleanText = searchText.toLowerCase().trim();
        filteredMessages = filteredMessages.filter((message: Message) => {
          const subject = (message.subject || '').toLowerCase();
          const fromName = message.from?.emailAddress?.name?.toLowerCase() || '';
          const fromAddress = message.from?.emailAddress?.address?.toLowerCase() || '';
          const bodyPreview = (message.bodyPreview || '').toLowerCase();

          const matches = subject.includes(cleanText) ||
                         fromName.includes(cleanText) ||
                         fromAddress.includes(cleanText) ||
                         bodyPreview.includes(cleanText);

          return matches;
        });
      }

      allMessages.push(...filteredMessages);
      pageCount++;

      // Check if there's a next page
      nextUrl = data['@odata.nextLink'];
      if (!nextUrl || pageMessages.length === 0) {
        break; // No more pages or empty page
      }
    } catch (error) {
      // If we haven't tried the simplest fallback yet, try it
      if (!useAttachmentFallback && pageCount === 0) {
        console.log('Primary approach failed, trying simple fallback without orderby');
        // Fallback B: Remove orderby entirely, sort locally
        currentUrl = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages?$select=${selectFields}&$filter=receivedDateTime ge ${utcStart}&$top=${pageSize}`;
        useAttachmentFallback = true;
        nextUrl = undefined;
        continue;
      }
      throw error;
    }
  }
  
  // If we removed orderby in fallback, sort locally by receivedDateTime desc
  if (useAttachmentFallback) {
    allMessages.sort((a: Message, b: Message) => {
      const dateA = new Date(a.receivedDateTime);
      const dateB = new Date(b.receivedDateTime);
      return dateB.getTime() - dateA.getTime(); // desc order (newest first)
    });
  }
  
  // Trim to the requested limit
  const messages = allMessages.slice(0, limit);

  // Log email search results for visibility
  console.log(`========================================`);
  console.log(`📧 Email Search Results`);
  console.log(`========================================`);
  console.log(`Search Text: ${searchText || 'none'}`);
  console.log(`Emails Found: ${allMessages.length}`);
  console.log(`Emails Returned: ${messages.length}`);
  console.log(`Pages Processed: ${pageCount}`);
  console.log(`Used Graph Search: ${useGraphSearch}`);
  console.log(`Used Fallback: ${useAttachmentFallback}`);
  console.log(`Lookback Days: ${lookbackDays}`);
  console.log(`========================================`);

  return {
    messages,
    next: undefined // We've already handled pagination internally
  };
}

export async function listAttachments(messageId: string, mailboxUserId?: string): Promise<AttachmentsResponse> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  const url = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages/${messageId}/attachments?$top=50`;
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

  const url = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages/${messageId}/attachments/${attachmentId}`;
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
    const url = `/v1.0/users/${mailbox}/mailFolders/Inbox/messages/${messageId}/attachments?$top=50`;
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