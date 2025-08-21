-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create resume_embeddings table
CREATE TABLE IF NOT EXISTS "resume_embeddings" (
    "id" SERIAL PRIMARY KEY,
    "resume_id" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "chunk_text" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT "fk_resume_embeddings_resume_id" 
        FOREIGN KEY ("resume_id") 
        REFERENCES "Resume"("id") 
        ON DELETE CASCADE
);

-- Create job_embeddings table
CREATE TABLE IF NOT EXISTS "job_embeddings" (
    "id" SERIAL PRIMARY KEY,
    "job_id" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "chunk_text" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT "fk_job_embeddings_job_id" 
        FOREIGN KEY ("job_id") 
        REFERENCES "Job"("id") 
        ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_resume_embeddings_resume_id" ON "resume_embeddings"("resume_id");
CREATE INDEX IF NOT EXISTS "idx_job_embeddings_job_id" ON "job_embeddings"("job_id");

-- Create IVFFLAT indexes for vector similarity search
CREATE INDEX IF NOT EXISTS "idx_resume_embeddings_vector" 
    ON "resume_embeddings" 
    USING ivfflat ("embedding" vector_cosine_ops) 
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS "idx_job_embeddings_vector" 
    ON "job_embeddings" 
    USING ivfflat ("embedding" vector_cosine_ops) 
    WITH (lists = 100);

-- Add unique constraints to prevent duplicate embeddings
CREATE UNIQUE INDEX IF NOT EXISTS "idx_resume_embeddings_unique" 
    ON "resume_embeddings"("resume_id", "content_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_job_embeddings_unique" 
    ON "job_embeddings"("job_id", "content_hash");