import { describe, it, expect } from 'vitest'

const { mapWithLimit } = await import('@/lib/concurrency')

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('mapWithLimit', () => {
  it('CL-01: 结果与输入等长同序，成功失败各自归位', async () => {
    const result = await mapWithLimit([1, 2, 3, 4], 2, async (n) => {
      if (n === 3) throw new Error('boom')
      return n * 10
    })
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ status: 'fulfilled', value: 10 })
    expect(result[1]).toEqual({ status: 'fulfilled', value: 20 })
    expect(result[2].status).toBe('rejected')
    expect(result[3]).toEqual({ status: 'fulfilled', value: 40 })
  })

  it('CL-02: 同时运行的任务数不超过 limit', async () => {
    let active = 0
    let peak = 0
    await mapWithLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      active++
      peak = Math.max(peak, active)
      await delay(1)
      active--
    })
    expect(peak).toBe(3)
  })

  it('CL-03: 空数组返回空结果', async () => {
    const result = await mapWithLimit([], 5, async (n: number) => n)
    expect(result).toEqual([])
  })

  it('CL-04: limit 大于任务数时全部并发执行', async () => {
    let active = 0
    let peak = 0
    await mapWithLimit([1, 2], 10, async () => {
      active++
      peak = Math.max(peak, active)
      await delay(1)
      active--
    })
    expect(peak).toBe(2)
  })
})
