import OpenAI from 'openai';
import {
  addTokenUsage,
  getCurrentBudgetUsage,
  throwIfOverBudget,
  OutOfBudgetError
} from './budget';
import {
  RESUME_JSON_SCHEMA,
  redactForLLM
} from './schema/resumeSchema';

let sharedClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!sharedClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is missing or empty');
    }
    sharedClient = new OpenAI({ apiKey });
  }
  return sharedClient;
}

type ParseResumeErrorType = 'api' | 'validation' | 'budget';

interface ParseResumeOptions {
  text: string;
  hints?: {
    jobTitle?: string;
  };
}

interface ParseResumeSuccess {
  ok: true;
  data: unknown;
  tokensUsed?: number;
}

interface ParseResumeFailure {
  ok: false;
  error: string;
  type: ParseResumeErrorType;
}

export type ParseResumeResult = ParseResumeSuccess | ParseResumeFailure;

const DEFAULT_RESUME_MODEL = process.env.OPENAI_RESUME_MODEL || process.env.OPENAI_RESUME_MODEL_FALLBACK || 'gpt-4o-mini';
const DEFAULT_RESUME_TEMPERATURE = Number.isFinite(Number(process.env.OPENAI_TEMPERATURE))
  ? Number(process.env.OPENAI_TEMPERATURE)
  : 0;

const RESUME_SYSTEM_PROMPT = `You are an expert technical recruiter. Extract structured candidate data from the resume text.
Return minified JSON (no whitespace) that matches the provided JSON schema exactly.
Normalize strings, dedupe arrays, and convert nullish values to null.`;

export async function parseResumeToJson(options: ParseResumeOptions): Promise<ParseResumeResult> {
  const trimmedText = options.text?.trim();
  if (!trimmedText) {
    return {
      ok: false,
      error: 'Resume text is empty',
      type: 'validation'
    };
  }

  const estimatedTokens = Math.ceil(trimmedText.length / 4);

  try {
    throwIfOverBudget(estimatedTokens);
  } catch (error) {
    if (error instanceof OutOfBudgetError) {
      return {
        ok: false,
        error: error.message,
        type: 'budget'
      };
    }
    throw error;
  }

  try {
    const client = getOpenAIClient();
    const redactedText = redactForLLM(trimmedText);

    const hints: string[] = [];
    if (options.hints?.jobTitle) {
      hints.push(`Target job title: ${options.hints.jobTitle}`);
    }

    const userContent = [
      hints.length > 0 ? `Hints:\n${hints.join('\n')}\n` : null,
      `Resume:\n${redactedText}`
    ].filter(Boolean).join('\n\n');

    const response = await client.chat.completions.create({
      model: DEFAULT_RESUME_MODEL,
      temperature: DEFAULT_RESUME_TEMPERATURE,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RESUME_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${userContent}\n\nJSON Schema:\n${JSON.stringify(RESUME_JSON_SCHEMA)}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        ok: false,
        error: 'OpenAI response was empty',
        type: 'api'
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return {
        ok: false,
        error: `Failed to parse OpenAI response JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'api'
      };
    }

    const usageTokens = response.usage?.total_tokens ?? null;
    if (typeof usageTokens === 'number') {
      addTokenUsage(usageTokens);
    }

    return {
      ok: true,
      data: parsed,
      tokensUsed: usageTokens
    };
  } catch (error) {
    if (error instanceof OutOfBudgetError) {
      return {
        ok: false,
        error: error.message,
        type: 'budget'
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error from OpenAI';
    return {
      ok: false,
      error: message,
      type: 'api'
    };
  }
}

export function getBudgetStatus(): {
  date: string;
  tokensUsed: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  used: number;
  percentage: number;
} {
  const usage = getCurrentBudgetUsage();
  const remaining = Math.max(usage.limit - usage.tokensUsed, 0);
  const percentUsed = usage.limit > 0 ? Math.min(100, Math.round((usage.tokensUsed / usage.limit) * 10000) / 100) : 0;

  return {
    date: usage.date,
    tokensUsed: usage.tokensUsed,
    limit: usage.limit,
    remaining,
    percentUsed,
    used: usage.tokensUsed,
    percentage: percentUsed
  };
}
