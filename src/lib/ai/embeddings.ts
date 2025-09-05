import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_MODEL_EMBED = process.env.AI_MODEL_EMBED || 'text-embedding-3-large';
const EMBED_DIM = parseInt(process.env.EMBED_DIM || '1536', 10);

interface EmbeddingConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxTokens?: number;
}

const DEFAULT_CONFIG: Required<EmbeddingConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxTokens: 8000
};

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function normalizeForEmbedding(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove control characters and normalize whitespace
  let normalized = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Rough token estimation (1 token ≈ 4 chars for English text)
  const estimatedTokens = Math.ceil(normalized.length / 4);
  const maxChars = DEFAULT_CONFIG.maxTokens * 4;
  
  if (estimatedTokens > DEFAULT_CONFIG.maxTokens) {
    // Truncate to approximate token limit
    normalized = normalized.substring(0, maxChars);
    // Try to cut at word boundary
    const lastSpace = normalized.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.8) {
      normalized = normalized.substring(0, lastSpace);
    }
  }

  return normalized;
}

export async function embedText(
  text: string, 
  config: EmbeddingConfig = {}
): Promise<number[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const normalizedText = normalizeForEmbedding(text);
  
  if (!normalizedText) {
    throw new Error('No valid text to embed after normalization');
  }

  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: AI_MODEL_EMBED,
        input: normalizedText,
        encoding_format: 'float'
      });

      if (!response.data?.[0]?.embedding) {
        throw new Error('Invalid embedding response from OpenAI');
      }

      const embedding = response.data[0].embedding;
      
      // Validate embedding dimensions
      if (embedding.length !== EMBED_DIM) {
        throw new Error(
          `Embedding dimension mismatch: expected ${EMBED_DIM}, got ${embedding.length}`
        );
      }

      return embedding;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      if (lastError.message.includes('Invalid API key') ||
          lastError.message.includes('dimension mismatch') ||
          lastError.message.includes('No valid text')) {
        throw lastError;
      }

      // Check if it's a rate limit or server error that we should retry
      const shouldRetry = lastError.message.includes('429') || 
                         lastError.message.includes('5') || // 5xx errors
                         lastError.message.includes('timeout') ||
                         lastError.message.includes('ECONNRESET');

      if (!shouldRetry || attempt === mergedConfig.maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = mergedConfig.baseDelay * Math.pow(2, attempt) + 
                   Math.random() * 1000;
      
      console.warn(
        `Embedding attempt ${attempt + 1}/${mergedConfig.maxRetries + 1} failed: ${lastError.message}. ` +
        `Retrying in ${Math.round(delay)}ms...`
      );
      
      await sleep(delay);
    }
  }

  throw lastError || new Error('Embedding failed after all retries');
}

export function validateEmbedding(embedding: number[]): boolean {
  if (!Array.isArray(embedding)) return false;
  if (embedding.length !== EMBED_DIM) return false;
  return embedding.every(val => 
    typeof val === 'number' && 
    isFinite(val) && 
    !isNaN(val)
  );
}

export { EMBED_DIM, AI_MODEL_EMBED };