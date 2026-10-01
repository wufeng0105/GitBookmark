import { describe, it, expect, beforeEach } from 'vitest'
import type { Bookmark, Settings } from '@/lib/types'
import { STORAGE_KEYS } from '@/shared/constants'

const {
  bookmarkId,
  addBookmarksBatch,
  updateBookmarksBatch,
  deleteBookmarks,
  getBookmarks,
  replaceBookmarks,
  getSettings,
  updateSettings,
} = await import('@/lib/storage')

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/a/b'
  return {
    id: overrides.id ?? bookmarkId(url),
    url,
    owner: overrides.owner ?? 'a',
    repo: overrides.repo ?? 'b',
    description: overrides.description ?? '',
    stars: overrides.stars ?? 0,
    forks: overrides.forks ?? 0,
    language: overrides.language ?? null,
    topics: overrides.topics ?? [],
    summary: overrides.summary ?? '',
    category: overrides.category ?? null,
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  }
}

beforeEach(() => {
  const chromeMock = (globalThis as unknown as {
    chrome: { storage: { local: { data: Record<string, unknown>; clear: () => void } } }
  }).chrome
  chromeMock.storage.local.clear()
})

describe('bookmarkId', () => {
  it('BI-01: 标准 URL', () => {
    expect(bookmarkId('https://github.com/a/b')).toBe('https://github.com/a/b')
  })

  it('BI-02: Trailing slash 移除', () => {
    expect(bookmarkId('https://github.com/a/b/')).toBe('https://github.com/a/b')
  })

  it('BI-03: 大写转小写', () => {
    expect(bookmarkId('https://github.com/Facebook/React')).toBe('https://github.com/facebook/react')
  })

  it('BI-04: Trailing slash + 大写', () => {
    expect(bookmarkId('https://github.com/Facebook/React/')).toBe('https://github.com/facebook/react')
  })
})

describe('addBookmarksBatch', () => {
  it('AB-01: 批量添加新收藏', async () => {
    const bookmarks = [
      makeBookmark({ url: 'https://github.com/a/b' }),
      makeBookmark({ url: 'https://github.com/c/d', owner: 'c', repo: 'd' }),
      makeBookmark({ url: 'https://github.com/e/f', owner: 'e', repo: 'f' }),
    ]

    const result = await addBookmarksBatch(bookmarks)
    expect(result).toHaveLength(3)
  })

  it('AB-02: 已存在的覆盖', async () => {
    await addBookmarksBatch([
      makeBookmark({ url: 'https://github.com/a/b', stars: 10 }),
    ])
    const result = await addBookmarksBatch([
      makeBookmark({ url: 'https://github.com/a/b', stars: 999 }),
      makeBookmark({ url: 'https://github.com/c/d', owner: 'c', repo: 'd' }),
    ])
    expect(result).toHaveLength(2)
    const updated = result.find((b) => b.id === bookmarkId('https://github.com/a/b'))
    expect(updated?.stars).toBe(999)
  })

  it('AB-03: 空数组不报错', async () => {
    const result = await addBookmarksBatch([])
    expect(result).toEqual([])
  })
})

describe('updateBookmarksBatch', () => {
  it('UB-01: 批量更新', async () => {
    await addBookmarksBatch([
      makeBookmark({ id: 'id1', url: 'u1', summary: 'old1' }),
      makeBookmark({ id: 'id2', url: 'u2', owner: 'c', repo: 'd', summary: 'old2' }),
    ])

    const result = await updateBookmarksBatch([
      { id: 'id1', patch: { summary: 'new1' } },
      { id: 'id2', patch: { summary: 'new2' } },
    ])
    expect(result).toHaveLength(2)
    expect(result.find((b) => b.id === 'id1')?.summary).toBe('new1')
    expect(result.find((b) => b.id === 'id2')?.summary).toBe('new2')
  })

  it('UB-02: 不存在的 ID 忽略', async () => {
    await addBookmarksBatch([
      makeBookmark({ id: 'id1', url: 'u1' }),
    ])

    const result = await updateBookmarksBatch([
      { id: 'id1', patch: { summary: 'updated' } },
      { id: 'nonexistent', patch: { summary: 'noop' } },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].summary).toBe('updated')
  })

  it('UB-03: 空数组不报错', async () => {
    const result = await updateBookmarksBatch([])
    expect(result).toEqual([])
  })

  it('UB-04: updatedAt 自动更新', async () => {
    const oldTime = 1000000
    await addBookmarksBatch([
      makeBookmark({ id: 'id1', url: 'u1', updatedAt: oldTime }),
    ])

    const result = await updateBookmarksBatch([
      { id: 'id1', patch: { summary: 'updated' } },
    ])
    expect(result[0].updatedAt).toBeGreaterThan(oldTime)
  })
})

describe('updateSettings', () => {
  it('US-01: patch 合并到现有设置，未指定字段保留', async () => {
    await updateSettings({ deepseekApiKey: 'sk-a', githubToken: 'gh-a' })

    const result = await updateSettings({ deepseekModel: 'deepseek-v4-pro' })

    expect(result).toMatchObject({
      deepseekApiKey: 'sk-a',
      githubToken: 'gh-a',
      deepseekModel: 'deepseek-v4-pro',
    })
  })

  it('US-02: 并发更新互不覆盖', async () => {
    await Promise.all([
      updateSettings({ deepseekApiKey: 'sk-a' }),
      updateSettings({ githubToken: 'gh-b' }),
      updateSettings({ deepseekModel: 'deepseek-v4-pro' }),
    ])

    const result = await getSettings()
    expect(result).toMatchObject({
      deepseekApiKey: 'sk-a',
      githubToken: 'gh-b',
      deepseekModel: 'deepseek-v4-pro',
    })
  })

  it('US-03: 读取时在内存中迁移废弃字段，不整对象写回', async () => {
    const chromeMock = (globalThis as unknown as {
      chrome: { storage: { local: { data: Record<string, unknown> } } }
    }).chrome
    const legacy = {
      deepseekApiKey: 'sk-x',
      githubToken: '',
      deepseekModel: 'deepseek-chat',
      gistId: '',
    }
    chromeMock.storage.local.data[STORAGE_KEYS.SETTINGS] = legacy

    const result: Settings = await getSettings()
    expect(result.deepseekModel).toBe('deepseek-v4-flash')
    expect(result.deepseekApiKey).toBe('sk-x')

    // 迁移只发生在内存中，原始存储不被整对象覆盖
    expect(chromeMock.storage.local.data[STORAGE_KEYS.SETTINGS]).toEqual(legacy)
  })

  it('US-04: 每次写入追加审计记录（来源+字段名，不含字段值）', async () => {
    const chromeMock = (globalThis as unknown as {
      chrome: { storage: { local: { data: Record<string, unknown> } } }
    }).chrome

    await updateSettings({ deepseekApiKey: 'sk-secret-value' }, 'UPDATE_SETTINGS')

    const audit = chromeMock.storage.local.data[STORAGE_KEYS.SETTINGS_AUDIT] as Array<{
      at: number
      source: string
      fields: string[]
    }>
    expect(audit).toHaveLength(1)
    expect(audit[0].source).toBe('UPDATE_SETTINGS')
    expect(audit[0].fields).toEqual(['deepseekApiKey'])
    expect(typeof audit[0].at).toBe('number')
    // 审计只记字段名，敏感值不落盘
    expect(JSON.stringify(audit)).not.toContain('sk-secret-value')
  })

  it('US-05: 审计只保留最近 20 条', async () => {
    const chromeMock = (globalThis as unknown as {
      chrome: { storage: { local: { data: Record<string, unknown> } } }
    }).chrome

    for (let i = 0; i < 25; i++) {
      await updateSettings({ deepseekModel: 'deepseek-v4-pro' }, 'TEST')
    }

    const audit = chromeMock.storage.local.data[STORAGE_KEYS.SETTINGS_AUDIT] as Array<{
      at: number
      source: string
      fields: string[]
    }>
    expect(audit).toHaveLength(20)
    expect(audit[0].fields).toEqual(['deepseekModel'])
  })
})

describe('收藏写入串行化', () => {
  it('SB-01: 并发新增与删除不互相覆盖', async () => {
    await addBookmarksBatch([
      makeBookmark({ url: 'https://github.com/a/b' }),
      makeBookmark({ url: 'https://github.com/c/d', owner: 'c', repo: 'd' }),
    ])

    await Promise.all([
      addBookmarksBatch([
        makeBookmark({ url: 'https://github.com/e/f', owner: 'e', repo: 'f' }),
      ]),
      deleteBookmarks(['https://github.com/a/b']),
    ])

    const result = await getBookmarks()
    expect(result.map((b) => b.id)).toEqual([
      'https://github.com/e/f',
      'https://github.com/c/d',
    ])
  })

  it('SB-02: 全量替换与并发新增不复活旧数据', async () => {
    await addBookmarksBatch([makeBookmark({ url: 'https://github.com/a/b' })])

    await Promise.all([
      addBookmarksBatch([
        makeBookmark({ url: 'https://github.com/e/f', owner: 'e', repo: 'f' }),
      ]),
      replaceBookmarks([
        makeBookmark({ url: 'https://github.com/x/y', owner: 'x', repo: 'y' }),
      ]),
    ])

    const result = await getBookmarks()
    expect(result.map((b) => b.id)).toEqual(['https://github.com/x/y'])
  })
})
