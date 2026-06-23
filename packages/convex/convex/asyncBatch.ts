/**
 * Maps an async fn over `items` with at most `chunkSize` calls in flight at once,
 * preserving input order. Bounds fan-out so a high-volume month can't schedule
 * thousands of concurrent DB reads (RPT-5) while still parallelizing within a batch —
 * the middle ground between a serial N+1 loop and an unbounded `Promise.all`.
 */
export async function asyncMapChunked<T, R>(
  items: readonly T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}
