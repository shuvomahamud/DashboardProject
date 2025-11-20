/**
 * Provider Adapter Interface
 *
 * Abstracts email fetching from different providers (MS Graph, Gmail, etc.)
 */

export interface EmailMessage {
  externalId: string;
  threadId: string | null;
  subject: string;
  from: {
    name: string;
    address: string;
  } | null;
  receivedAt: Date;
  hasAttachments: boolean;
  bodyPreview?: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
}

export interface EmailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
}

export interface ListMessagesOptions {
  jobTitle: string;
  limit?: number;
  lookbackDays?: number;
  mode?: 'graph-search' | 'deep-scan';
}

export interface ListMessagesResult {
  messages: EmailMessage[];
  totalCount?: number | null;
  rawCount?: number | null;
  filteredCount?: number | null;
  graphTruncated?: boolean;
  modeUsed: 'graph-search' | 'deep-scan';
}

export interface EmailProvider {
  /**
   * List/search messages matching criteria
   */
  listMessages(options: ListMessagesOptions): Promise<ListMessagesResult>;

  /**
   * Get full message details (body, attachments metadata)
   */
  getMessage(externalId: string): Promise<{
    message: EmailMessage;
    attachments: EmailAttachment[];
  }>;

  /**
   * Download attachment bytes
   */
  getAttachmentBytes(messageId: string, attachmentId: string): Promise<Uint8Array>;
}
