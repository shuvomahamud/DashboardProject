/**
 * MS Graph Email Provider Implementation
 */

import { searchMessages, listAttachments, getFileAttachmentBytes, isAttachmentEligible } from '@/lib/msgraph/outlook';
import type { EmailProvider, EmailMessage, EmailAttachment, ListMessagesOptions } from './email-provider';

export class MSGraphEmailProvider implements EmailProvider {
  private mailboxUserId: string;

  constructor(mailboxUserId?: string) {
    this.mailboxUserId = mailboxUserId || process.env.MS_MAILBOX_USER_ID || '';
    if (!this.mailboxUserId) {
      throw new Error('Mailbox user ID not provided and MS_MAILBOX_USER_ID not configured');
    }
  }

  async listMessages(options: ListMessagesOptions): Promise<EmailMessage[]> {
    const { jobTitle, limit = 5000, lookbackDays } = options;

    // Set lookback days in env if provided
    if (lookbackDays) {
      process.env.MS_IMPORT_LOOKBACK_DAYS = lookbackDays.toString();
    }

    const result = await searchMessages(jobTitle, limit, this.mailboxUserId);

    return result.messages.map(msg => ({
      externalId: msg.id,
      threadId: null, // MS Graph doesn't expose conversationId in basic queries
      subject: msg.subject,
      from: msg.from ? {
        name: msg.from.emailAddress.name,
        address: msg.from.emailAddress.address
      } : null,
      receivedAt: new Date(msg.receivedDateTime),
      hasAttachments: msg.hasAttachments,
      bodyPreview: msg.bodyPreview
    }));
  }

  async getMessage(externalId: string): Promise<{
    message: EmailMessage;
    attachments: EmailAttachment[];
  }> {
    console.log(`🔍 Provider: getMessage called with externalId: "${externalId}" (length: ${externalId.length})`);
    console.log(`🔍 Provider: First 50 chars: "${externalId.substring(0, 50)}"`);
    console.log(`🔍 Provider: Last 10 chars: "${externalId.substring(externalId.length - 10)}"`);

    // Get attachments
    const attachmentsResult = await listAttachments(externalId, this.mailboxUserId);

    // Filter eligible attachments
    const eligibleAttachments = attachmentsResult.attachments
      .filter(isAttachmentEligible)
      .map(att => ({
        id: att.id,
        name: att.name,
        contentType: att.contentType,
        size: att.size,
        contentBytes: att.contentBytes
      }));

    // We don't need to re-fetch the message since we already have it from listMessages
    // But we'll create a minimal message object for consistency
    const message: EmailMessage = {
      externalId,
      threadId: null,
      subject: '',
      from: null,
      receivedAt: new Date(),
      hasAttachments: eligibleAttachments.length > 0
    };

    return {
      message,
      attachments: eligibleAttachments
    };
  }

  async getAttachmentBytes(messageId: string, attachmentId: string): Promise<Uint8Array> {
    return getFileAttachmentBytes(messageId, attachmentId, this.mailboxUserId);
  }
}

// Factory function
export function createEmailProvider(mailboxUserId?: string): EmailProvider {
  return new MSGraphEmailProvider(mailboxUserId);
}
