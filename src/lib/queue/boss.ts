import PgBoss from 'pg-boss';

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) {
    return boss;
  }

  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: 'pgboss',
    max: 5, // Connection pool size
    deleteAfterDays: 7, // Auto-delete completed jobs after 7 days
  });

  boss.on('error', (error) => {
    console.error('pg-boss error:', error);
  });

  await boss.start();
  console.log('✅ pg-boss started');

  return boss;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
    console.log('✅ pg-boss stopped');
  }
}
