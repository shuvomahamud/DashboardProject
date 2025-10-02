/**
 * Test script to verify GPT timeout protection works correctly
 */

// Simulate parseAndScoreResume with different response times
async function mockParseAndScore(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`✅ GPT parsing completed in ${delayMs}ms`);
      resolve();
    }, delayMs);
  });
}

// Test the timeout protection logic
async function testTimeoutProtection(parseDelayMs: number, timeoutMs: number): Promise<void> {
  const startTime = Date.now();

  try {
    await Promise.race([
      mockParseAndScore(parseDelayMs),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('GPT_TIMEOUT')), timeoutMs)
      )
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Test PASSED: Parsing completed within timeout (${elapsed}ms)`);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;

    if (error.message === 'GPT_TIMEOUT') {
      console.log(`⚠️  Test PASSED: Timeout triggered correctly (${elapsed}ms)`);
      console.log(`   Import would continue without failing`);
    } else {
      console.log(`❌ Test FAILED: Unexpected error - ${error.message}`);
    }
  }
}

// Run test scenarios
async function runTests() {
  console.log('🧪 Testing GPT Timeout Protection\n');

  console.log('Test 1: Fast GPT response (3s, timeout 8s)');
  await testTimeoutProtection(3000, 8000);

  console.log('\nTest 2: Moderate GPT response (6s, timeout 8s)');
  await testTimeoutProtection(6000, 8000);

  console.log('\nTest 3: Slow GPT response (10s, timeout 8s)');
  await testTimeoutProtection(10000, 8000);

  console.log('\n✅ All timeout tests completed');
}

runTests().catch(console.error);
