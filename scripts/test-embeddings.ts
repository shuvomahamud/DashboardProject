import { embedText, validateEmbedding, normalizeForEmbedding } from '../src/lib/ai/embeddings';
import { upsertResumeEmbedding, findNearDuplicateResumes } from '../src/lib/ai/embedResume';
import { upsertJobEmbedding } from '../src/lib/ai/embedJob';
import prisma from '../src/lib/prisma';

async function testEmbeddings() {
  console.log('🧪 Testing Phase 4 - Embeddings & Semantic Features');
  console.log('================================================\n');

  try {
    // Test 1: Basic embedding functionality
    console.log('1. Testing basic embedding functionality...');
    
    const testText = 'Senior software engineer with 5 years of experience in React, TypeScript, and Node.js';
    const embedding = await embedText(testText);
    
    console.log(`✓ Generated embedding of dimension ${embedding.length}`);
    console.log(`✓ Embedding validation: ${validateEmbedding(embedding)}`);
    
    // Test normalization
    const normalizedText = normalizeForEmbedding(testText + '\x00\x01'); // Add control chars
    console.log(`✓ Text normalization works: ${normalizedText.length < testText.length + 2}`);
    
    // Test 2: Resume embedding
    console.log('\n2. Testing resume embedding...');
    
    // Find a resume with text
    const resumeWithText = await prisma.resume.findFirst({
      where: {
        AND: [
          { OR: [{ rawText: { not: null } }, { parsedText: { not: null } }] },
          { OR: [{ rawText: { not: '' } }, { parsedText: { not: '' } }] }
        ]
      },
      select: { id: true, candidateName: true, fileName: true }
    });
    
    if (resumeWithText) {
      const result = await upsertResumeEmbedding(resumeWithText.id);
      console.log(`✓ Resume ${resumeWithText.id} embedding: ${result.ok ? 'SUCCESS' : 'FAILED'} (${result.reason})`);
      
      if (result.ok) {
        // Test duplicate detection
        const duplicates = await findNearDuplicateResumes(resumeWithText.id, 0.8, 5);
        console.log(`✓ Found ${duplicates.length} potential duplicates for resume ${resumeWithText.id}`);
      }
    } else {
      console.log('⚠️  No resumes with text found for testing');
    }
    
    // Test 3: Job embedding
    console.log('\n3. Testing job embedding...');
    
    // Find a job with description
    const jobWithDescription = await prisma.job.findFirst({
      where: {
        AND: [
          { title: { not: null } },
          { title: { not: '' } }
        ]
      },
      include: { company: { select: { name: true } } },
      take: 1
    });
    
    if (jobWithDescription) {
      const result = await upsertJobEmbedding(jobWithDescription.id);
      console.log(`✓ Job ${jobWithDescription.id} embedding: ${result.ok ? 'SUCCESS' : 'FAILED'} (${result.reason})`);
    } else {
      console.log('⚠️  No jobs found for testing');
    }
    
    // Test 4: Vector similarity operations
    console.log('\n4. Testing vector similarity operations...');
    
    const text1 = 'Full stack developer with React experience';
    const text2 = 'Frontend developer experienced in React and JavaScript';
    const text3 = 'Backend engineer with Python and Django expertise';
    
    const [emb1, emb2, emb3] = await Promise.all([
      embedText(text1),
      embedText(text2), 
      embedText(text3)
    ]);
    
    // Calculate cosine similarity manually (1 - cosine distance)
    const dotProduct = (a: number[], b: number[]) => 
      a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    
    const magnitude = (a: number[]) => 
      Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    
    const cosineSimilarity = (a: number[], b: number[]) =>
      dotProduct(a, b) / (magnitude(a) * magnitude(b));
    
    const sim12 = cosineSimilarity(emb1, emb2);
    const sim13 = cosineSimilarity(emb1, emb3);
    const sim23 = cosineSimilarity(emb2, emb3);
    
    console.log(`✓ Similarity (React vs React): ${sim12.toFixed(3)} (should be high)`);
    console.log(`✓ Similarity (React vs Python): ${sim13.toFixed(3)} (should be lower)`);
    console.log(`✓ Similarity (Frontend vs Backend): ${sim23.toFixed(3)} (should be lowest)`);
    
    // Test 5: Database embedding counts
    console.log('\n5. Testing database embedding counts...');
    
    const [resumeEmbeddingCount, jobEmbeddingCount] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) as count FROM resume_embeddings`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM job_embeddings`
    ]);
    
    console.log(`✓ Resume embeddings in database: ${(resumeEmbeddingCount as any)[0].count}`);
    console.log(`✓ Job embeddings in database: ${(jobEmbeddingCount as any)[0].count}`);
    
    // Test 6: Environmental configuration
    console.log('\n6. Testing environment configuration...');
    
    const requiredEnvs = ['OPENAI_API_KEY', 'AI_MODEL_EMBED', 'EMBED_DIM'];
    const optionalEnvs = ['SEMANTIC_TOP_K', 'SEMANTIC_DUP_THRESHOLD'];
    
    requiredEnvs.forEach(env => {
      const value = process.env[env];
      console.log(`${value ? '✓' : '✗'} ${env}: ${value ? '(set)' : 'MISSING'}`);
    });
    
    optionalEnvs.forEach(env => {
      const value = process.env[env];
      console.log(`${value ? '✓' : '⚠️ '} ${env}: ${value || '(using default)'}`);
    });
    
    console.log('\n🎉 Embedding system test completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testEmbeddings().catch(console.error);