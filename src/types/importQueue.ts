export interface ImportRunSummary {
  totals: {
    totalMessages: number | null;
    processedMessages: number;
    failedMessages: number;
  };
  resumeParsing: {
    total: number;
    failed: number;
    retries: number;
    failedResumes: Array<{
      resumeId: number | null;
      status: string;
      error: string | null;
      attempts: number;
    }>;
    retryResumes: Array<{
      resumeId: number | null;
      status: string;
      error: string | null;
      attempts: number;
    }>;
  };
  itemFailures: Array<{
    messageId: string;
    error: string | null;
  }>;
  warnings: string[];
}

