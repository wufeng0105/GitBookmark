import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { downloadTextFile } = await import('@/lib/download')

describe('downloadTextFile', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock')
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('DT-01: 以指定文件名触发下载并释放 URL', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const created: HTMLAnchorElement[] = []
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', tag)
      created.push(el as HTMLAnchorElement)
      return el
    }) as typeof document.createElement)

    downloadTextFile('test.json', '{"a":1}')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0]
    expect(await blob.text()).toBe('{"a":1}')
    expect(created[0].download).toBe('test.json')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('DT-02: 支持 MIME 类型覆盖', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadTextFile('a.md', '# 标题', 'text/markdown')
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob.type).toBe('text/markdown')
  })
})
