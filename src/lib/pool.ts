/**
 * Simple promise pool for bounded concurrency
 */

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let activeCount = 0;

  return new Promise((resolve, reject) => {
    const processNext = () => {
      // All done
      if (currentIndex === items.length && activeCount === 0) {
        return resolve(results);
      }

      // Start new tasks up to concurrency limit
      while (activeCount < concurrency && currentIndex < items.length) {
        const index = currentIndex++;
        activeCount++;

        fn(items[index], index)
          .then(result => {
            results[index] = result;
          })
          .catch(error => {
            reject(error); // Fail-fast on first error
          })
          .finally(() => {
            activeCount--;
            processNext();
          });
      }
    };

    processNext();
  });
}
