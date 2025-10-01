/**
 * Time budget tracking for slice-based processing
 */

export class TimeBudget {
  private readonly startTime: number;
  private readonly budgetMs: number;

  constructor(budgetMs: number) {
    this.startTime = Date.now();
    this.budgetMs = budgetMs;
  }

  /** Get elapsed time in milliseconds */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /** Get remaining time in milliseconds */
  remaining(): number {
    return Math.max(0, this.budgetMs - this.elapsed());
  }

  /** Check if we should continue (with buffer) */
  shouldContinue(bufferMs: number = 5000): boolean {
    return this.remaining() > bufferMs;
  }

  /** Get progress percentage */
  progress(): number {
    return Math.min(100, (this.elapsed() / this.budgetMs) * 100);
  }
}

/**
 * Parse soft budget from environment
 */
export function getSoftBudgetMs(): number {
  return parseInt(process.env.SOFT_BUDGET_MS || '30000', 10);
}

/**
 * Parse batch page size from environment
 */
export function getBatchPageSize(): number {
  return parseInt(process.env.BATCH_PAGE_SIZE || '100', 10);
}

/**
 * Parse item concurrency from environment
 */
export function getItemConcurrency(): number {
  return parseInt(process.env.ITEM_CONCURRENCY || '2', 10);
}
