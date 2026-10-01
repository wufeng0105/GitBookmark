/**
 * 带并发上限的 map，语义与 Promise.allSettled 一致：
 * 返回数组与 items 等长同序，单项失败不影响其他项。
 * 用于批量外部请求（GitHub 元数据 / DeepSeek AI），避免无界并发触发限流。
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0

  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index], index) }
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
  return results
}
