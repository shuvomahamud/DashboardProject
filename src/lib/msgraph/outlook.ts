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
  aqs: string,
  top: number = 25,
  mailboxUserId?: string,
  next?: string
): Promise<MessagesResponse> {
  const mailbox = mailboxUserId || process.env.MS_MAILBOX_USER_ID;
  if (!mailbox) {
    throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
  }

  let url: string;
  if (next) {
    // Use the full next link provided by Microsoft Graph
    url = next;
  } else {
    url = `/v1.0/users/${mailbox}/messages?$search=${encodeURIComponent(aqs)}&$top=${top}`;
  }

  const response = await graphFetch(url, { needsConsistencyLevel: true });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to search messages: ${response.status} ${error}`);
  }

  const data = await response.json();
  
  // Sort messages by receivedDateTime desc since we can't use $orderby with $search
  const messages = (data.value || []).sort((a: Message, b: Message) => {
    const dateA = new Date(a.receivedDateTime);
    const dateB = new Date(b.receivedDateTime);
    return dateB.getTime() - dateA.getTime(); // desc order (newest first)
  });
  
  return {
    messages,
    next: data['@odata.nextLink']
  };
}

export async function listAttachments(messageId: string): Promise<AttachmentsResponse> {
  const mailboxUserId = process.env.MS_MAILBOX_USER_ID;
  if (!mailboxUserId) {
    throw new Error('MS_MAILBOX_USER_ID not configured');
  }

  const url = `/v1.0/users/${mailboxUserId}/messages/${messageId}/attachments?$top=50`;
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
  attachmentId: string
): Promise<Uint8Array> {
  const mailboxUserId = process.env.MS_MAILBOX_USER_ID;
  if (!mailboxUserId) {
    throw new Error('MS_MAILBOX_USER_ID not configured');
  }

  const url = `/v1.0/users/${mailboxUserId}/messages/${messageId}/attachments/${attachmentId}`;
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
    const url = `/v1.0/users/${mailbox}/messages/${messageId}/attachments?$top=50`;
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