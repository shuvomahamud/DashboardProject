import prisma from '../src/lib/prisma';
import { embedText } from '../src/lib/ai/embeddings';

interface SemanticSearchResult {
  resumeId: number;
  originalName: string | null;
  fileName: string;
  score: number;
}

async function demonstrateSemanticSearch() {
  console.log('🔍 Semantic Search Demo');
  console.log('======================\n');

  try {
    // Check if we have any resume embeddings
    const embeddingCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM resume_embeddings` as any[];
    const count = parseInt(embeddingCount[0].count);
    
    if (count === 0) {
      console.log('❌ No resume embeddings found. Please run:');
      console.log('   POST /api/embeddings/resumes');
      return;
    }
    
    console.log(`✓ Found ${count} resume embeddings in database\n`);
    
    // Demo queries
    const demoQueries = [
      'React TypeScript developer',
      'Python machine learning engineer',
      'Senior frontend developer with JavaScript',
      'Full stack engineer with Node.js',
      'Data scientist with experience in analytics',
      'DevOps engineer with cloud experience'
    ];
    
    for (const query of demoQueries) {
      console.log(`🔍 Searching for: "${query}"`);
      
      try {
        // Generate embedding for query
        const queryEmbedding = await embedText(query);
        const embeddingString = JSON.stringify(queryEmbedding);
        
        // Find most similar resumes
        const results = await prisma.$queryRaw<SemanticSearchResult[]>`
          SELECT 
            r.id as "resumeId",
            r."originalName",
            r."fileName",
            (1 - (re.embedding <=> ${embeddingString}::vector)) as score
          FROM resume_embeddings re
          JOIN "Resume" r ON r.id = re.resume_id
          ORDER BY re.embedding <=> ${embeddingString}::vector
          LIMIT 3
        `;
        
        if (results.length === 0) {
          console.log('   No results found\n');
          continue;
        }
        
        results.forEach((result, index) => {
          const score = (result.score * 100).toFixed(1);
          const name = result.originalName || 'Unknown';
          console.log(`   ${index + 1}. ${name} (${result.fileName}) - ${score}% match`);
        });
        console.log();
        
      } catch (searchError) {
        console.error(`   ❌ Error searching for "${query}":`, searchError);
      }
    }
    
    // Demo duplicate detection
    console.log('\n🔍 Duplicate Detection Demo');
    console.log('==========================\n');
    
    // Find a resume with embeddings to test duplicates
    const sampleResume = await prisma.$queryRaw`
      SELECT r.id, r."originalName", r."fileName"
      FROM "Resume" r
      JOIN resume_embeddings re ON r.id = re.resume_id
      LIMIT 1
    ` as any[];
    
    if (sampleResume.length > 0) {
      const resume = sampleResume[0];
      console.log(`🔍 Finding duplicates for: ${resume.originalName || 'Unknown'} (${resume.fileName})`);
      
      // Get the resume's embedding
      const embeddingResult = await prisma.$queryRaw`
        SELECT embedding FROM resume_embeddings WHERE resume_id = ${resume.id} LIMIT 1
      ` as any[];
      
      if (embeddingResult.length > 0) {
        const embedding = JSON.stringify(embeddingResult[0].embedding);
        
        // Find similar resumes (potential duplicates)
        const duplicates = await prisma.$queryRaw<SemanticSearchResult[]>`
          SELECT 
            r.id as "resumeId",
            r."originalName",
            r."fileName",
            (1 - (re.embedding <=> ${embedding}::vector)) as score
          FROM resume_embeddings re
          JOIN "Resume" r ON r.id = re.resume_id
          WHERE r.id <> ${resume.id}
            AND (1 - (re.embedding <=> ${embedding}::vector)) > 0.85
          ORDER BY re.embedding <=> ${embedding}::vector
          LIMIT 5
        `;
        
        if (duplicates.length === 0) {
          console.log('   ✓ No potential duplicates found (good!)\n');
        } else {
          duplicates.forEach((dup, index) => {
            const score = (dup.score * 100).toFixed(1);
            const name = dup.originalName || 'Unknown';
            console.log(`   ${index + 1}. ${name} (${dup.fileName}) - ${score}% similar`);
          });
        }
      }
    }
    
    console.log('\n🎉 Semantic search demo completed!');
    
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

demonstrateSemanticSearch().catch(console.error);