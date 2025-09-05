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
  next?: string
): Promise<MessagesResponse> {
  const mailboxUserId = process.env.MS_MAILBOX_USER_ID;
  if (!mailboxUserId) {
    throw new Error('MS_MAILBOX_USER_ID not configured');
  }

  let url: string;
  if (next) {
    // Use the full next link provided by Microsoft Graph
    url = next;
  } else {
    url = `/v1.0/users/${mailboxUserId}/messages?$search="${encodeURIComponent(aqs)}"&$top=${top}`;
  }

  const response = await graphFetch(url, { needsConsistencyLevel: true });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to search messages: ${response.status} ${error}`);
  }

  const data = await response.json();
  
  return {
    messages: data.value || [],
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