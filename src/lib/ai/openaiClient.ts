import OpenAI from 'openai';
import { RESUME_JSON_SCHEMA, redactForLLM } from './schema/resumeSchema';
import { throwIfOverBudget, addTokenUsage, OutOfBudgetError } from './budget';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ParseHints {
  jobTitle?: string;
}

interface ParseRequest {
  text: string;
  hints?: ParseHints;
}

type ParseResult = 
  | { ok: true; data: any; tokensUsed: number }
  | { ok: false; error: string; type: 'budget' | 'api' | 'validation' };

const SYSTEM_PROMPT = `You are an expert resume parser. Return only JSON matching the provided schema. Do not include extra keys.

Guidelines:
- Extract candidate information accurately
- Normalize email addresses to lowercase
- Format phone numbers consistently
- Calculate total experience years as a decimal (e.g., 2.5 for 2 years 6 months)
- List skills in lowercase, remove duplicates
- For employment dates, use ISO format (yyyy-mm or yyyy-mm-dd) when possible
- Mark current positions with null endDate
- Be conservative with data extraction - use null when information is unclear`;

function buildUserPrompt(text: string, hints?: ParseHints): string {
  let prompt = 'Parse the following resume text and return structured JSON:\n\n';
  
  if (hints?.jobTitle) {
    prompt += `Context: This resume was submitted for a "${hints.jobTitle}" position.\n\n`;
  }
  
  prompt += '--- RESUME TEXT ---\n';
  prompt += text;
  prompt += '\n--- END RESUME TEXT ---';
  
  return prompt;
}

export async function parseResumeToJson(request: ParseRequest): Promise<ParseResult> {
  try {
    // Check if AI features are enabled
    if (process.env.AI_FEATURES !== 'on') {
      return {
        ok: false,
        error: 'AI features are disabled',
        type: 'api'
      };
    }

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(request.text.length / 4) + 500; // +500 for system prompt and response
    
    // Check budget before making API call
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

    // Redact PII from text before sending to LLM
    const redactedText = redactForLLM(request.text);
    
    const model = process.env.AI_MODEL_PARSE || 'gpt-4o-mini';
    
    // Make OpenAI API call with structured outputs
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: buildUserPrompt(redactedText, request.hints)
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'resume_parse',
          strict: true,
          schema: RESUME_JSON_SCHEMA
        }
      },
      temperature: 0.1,
      max_tokens: 2000,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return {
        ok: false,
        error: 'No response from OpenAI',
        type: 'api'
      };
    }

    // Parse JSON response
    let parsedData;
    try {
      parsedData = JSON.parse(response);
    } catch (parseError) {
      return {
        ok: false,
        error: 'Invalid JSON response from OpenAI',
        type: 'validation'
      };
    }

    // Track token usage
    const tokensUsed = completion.usage?.total_tokens || estimatedTokens;
    addTokenUsage(tokensUsed);

    return {
      ok: true,
      data: parsedData,
      tokensUsed
    };

  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof Error) {
      // Rate limiting
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        return {
          ok: false,
          error: 'Rate limit exceeded, please try again later',
          type: 'api'
        };
      }
      
      // Other API errors
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        return {
          ok: false,
          error: 'OpenAI API authentication failed',
          type: 'api'
        };
      }
    }
    
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown OpenAI API error',
      type: 'api'
    };
  }
}

// Helper function to get current budget status
export function getBudgetStatus() {
  const usage = getCurrentBudgetUsage();
  return {
    date: usage.date,
    tokensUsed: usage.tokensUsed,
    limit: usage.limit,
    remaining: usage.limit - usage.tokensUsed,
    percentUsed: Math.round((usage.tokensUsed / usage.limit) * 100)
  };
}

// Re-export for convenience
export { getCurrentBudgetUsage } from './budget';