import OpenAI from 'openai';

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
