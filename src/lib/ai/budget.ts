// Simple in-memory token budget tracker
// Resets every UTC midnight, tracks daily usage

interface BudgetTracker {
  date: string; // YYYY-MM-DD format
  tokensUsed: number;
}

let dailyBudget: BudgetTracker = {
  date: new Date().toISOString().split('T')[0],
  tokensUsed: 0
};

export class OutOfBudgetError extends Error {
  constructor(used: number, limit: number) {
    super(`Daily token budget exceeded: ${used}/${limit} tokens used today`);
    this.name = 'OutOfBudgetError';
  }
}

export function getCurrentBudgetUsage(): { date: string; tokensUsed: number; limit: number } {
  const today = new Date().toISOString().split('T')[0];
  const limit = parseInt(process.env.AI_DAILY_TOKEN_BUDGET || '200000');
  
  // Reset if new day
  if (dailyBudget.date !== today) {
    dailyBudget = {
      date: today,
      tokensUsed: 0
    };
  }
  
  return {
    date: dailyBudget.date,
    tokensUsed: dailyBudget.tokensUsed,
    limit
  };
}

export function checkBudgetAvailable(estimatedTokens: number = 0): boolean {
  const usage = getCurrentBudgetUsage();
  return (usage.tokensUsed + estimatedTokens) <= usage.limit;
}

export function addTokenUsage(tokensUsed: number): void {
  const today = new Date().toISOString().split('T')[0];
  
  // Reset if new day
  if (dailyBudget.date !== today) {
    dailyBudget = {
      date: today,
      tokensUsed: 0
    };
  }
  
  dailyBudget.tokensUsed += tokensUsed;
}

export function throwIfOverBudget(estimatedTokens: number = 0): void {
  const usage = getCurrentBudgetUsage();
  
  if ((usage.tokensUsed + estimatedTokens) > usage.limit) {
    throw new OutOfBudgetError(usage.tokensUsed, usage.limit);
  }
}