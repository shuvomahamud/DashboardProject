/**
 * Initialize pg-boss schema
 *
 * This script creates the pg-boss schema and tables in the database.
 * Run this once before starting the worker for the first time.
 */

import PgBoss from 'pg-boss';

async function initPgBoss() {
  console.log('🚀 Initializing pg-boss...\n');

  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: 'pgboss',
    max: 2,
  });

  try {
    console.log('Starting pg-boss...');
    await boss.start();
    console.log('✅ pg-boss started successfully\n');

    // Create a test queue to ensure everything works
    console.log('Creating test queue...');
    await boss.createQueue('import-emails');
    console.log('✅ Queue "import-emails" created\n');

    console.log('✅ pg-boss initialization complete!\n');
    console.log('You can now:');
    console.log('  1. Start the worker: npm run worker:import');
    console.log('  2. Use the Import Applications feature in the UI\n');

    await boss.stop();
  } catch (error: any) {
    console.error('❌ Failed to initialize pg-boss:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  - Ensure DATABASE_URL is set in .env');
    console.error('  - Check database connection');
    console.error('  - Verify PostgreSQL version >= 9.5\n');
    process.exit(1);
  }
}

initPgBoss();
