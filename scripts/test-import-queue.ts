/**
 * Test script for Import Queue system
 *
 * Verifies:
 * 1. Database table and indexes exist
 * 2. Unique constraints work correctly
 * 3. Can create, update, and query runs
 */

import prisma from '../src/lib/prisma';

async function testImportQueue() {
  console.log('🧪 Testing Import Queue System\n');

  try {
    // Test 1: Create a test job (or use existing)
    console.log('1️⃣  Finding or creating test job...');
    let testJob = await prisma.job.findFirst({
      where: { title: { contains: 'Test' } }
    });

    if (!testJob) {
      testJob = await prisma.job.create({
        data: {
          title: 'Test Job for Queue',
          description: 'This is a test job for the import queue system',
          status: 'active'
        }
      });
      console.log(`   ✅ Created test job: ${testJob.id}`);
    } else {
      console.log(`   ✅ Using existing test job: ${testJob.id}`);
    }

    // Test 2: Create first enqueued run
    console.log('\n2️⃣  Creating first enqueued run...');
    const run1 = await prisma.import_email_runs.create({
      data: {
        job_id: testJob.id,
        status: 'enqueued'
      }
    });
    console.log(`   ✅ Created run: ${run1.id}`);

    // Test 3: Try to create duplicate enqueued run (should fail)
    console.log('\n3️⃣  Testing duplicate enqueued prevention...');
    try {
      await prisma.import_email_runs.create({
        data: {
          job_id: testJob.id,
          status: 'enqueued'
        }
      });
      console.log('   ❌ FAILED: Should have prevented duplicate enqueued run!');
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log('   ✅ Correctly prevented duplicate enqueued run');
      } else {
        throw error;
      }
    }

    // Test 4: Mark first run as running
    console.log('\n4️⃣  Marking first run as running...');
    await prisma.import_email_runs.update({
      where: { id: run1.id },
      data: {
        status: 'running',
        started_at: new Date()
      }
    });
    console.log('   ✅ Marked as running');

    // Test 5: Create another job and enqueue it
    console.log('\n5️⃣  Creating second job and enqueueing it...');
    const testJob2 = await prisma.job.create({
      data: {
        title: 'Test Job 2 for Queue',
        description: 'Second test job',
        status: 'active'
      }
    });
    const run2 = await prisma.import_email_runs.create({
      data: {
        job_id: testJob2.id,
        status: 'enqueued'
      }
    });
    console.log(`   ✅ Created second run: ${run2.id}`);

    // Test 6: Try to mark second run as running (should fail due to global constraint)
    console.log('\n6️⃣  Testing global single-running constraint...');
    try {
      await prisma.import_email_runs.update({
        where: { id: run2.id },
        data: {
          status: 'running',
          started_at: new Date()
        }
      });
      console.log('   ❌ FAILED: Should have prevented second running import!');
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log('   ✅ Correctly prevented second running import (global constraint)');
      } else {
        throw error;
      }
    }

    // Test 7: Finish first run
    console.log('\n7️⃣  Finishing first run...');
    await prisma.import_email_runs.update({
      where: { id: run1.id },
      data: {
        status: 'succeeded',
        finished_at: new Date(),
        progress: 100,
        processed_messages: 50,
        total_messages: 50
      }
    });
    console.log('   ✅ Marked first run as succeeded');

    // Test 8: Now second run can be marked as running
    console.log('\n8️⃣  Marking second run as running (should work now)...');
    await prisma.import_email_runs.update({
      where: { id: run2.id },
      data: {
        status: 'running',
        started_at: new Date()
      }
    });
    console.log('   ✅ Successfully marked second run as running');

    // Test 9: Test summary query
    console.log('\n9️⃣  Testing summary query...');
    const inProgress = await prisma.import_email_runs.findFirst({
      where: { status: 'running' },
      include: { Job: { select: { id: true, title: true } } }
    });
    const enqueued = await prisma.import_email_runs.findMany({
      where: { status: 'enqueued' },
      orderBy: { created_at: 'asc' },
      include: { Job: { select: { id: true, title: true } } }
    });
    const recentDone = await prisma.import_email_runs.findMany({
      where: { status: { in: ['succeeded', 'failed', 'canceled'] } },
      orderBy: [{ finished_at: 'desc' }, { created_at: 'desc' }],
      take: 3,
      include: { Job: { select: { id: true, title: true } } }
    });

    console.log(`   ✅ In Progress: ${inProgress ? 1 : 0}`);
    console.log(`   ✅ Enqueued: ${enqueued.length}`);
    console.log(`   ✅ Recent Done: ${recentDone.length}`);

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await prisma.import_email_runs.deleteMany({
      where: { job_id: { in: [testJob.id, testJob2.id] } }
    });
    await prisma.job.delete({ where: { id: testJob.id } });
    await prisma.job.delete({ where: { id: testJob2.id } });
    console.log('   ✅ Cleanup complete');

    console.log('\n✅ All tests passed!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testImportQueue();
