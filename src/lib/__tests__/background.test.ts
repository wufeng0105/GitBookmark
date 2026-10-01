import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type {
  Bookmark,
  Settings,
  BatchAnalyzeResult,
  ReanalyzeResult,
} from '@/lib/types'
import { GIST_FILENAME, FIELD_MAX_LENGTH } from '@/shared/constants'

const { handleMessage } = await import('@/background/index')

// ─── 测试辅助 ──────────────────────────────────────────────

const TEST_SETTINGS: Settings = {
  deepseekApiKey: 'sk-test',
  githubToken: 'gh-test',
  deepseekModel: 'deepseek-v4-flash',
  gistId: '',
}

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/a/b'
  return {
    id: overrides.id ?? url.replace(/\/$/, '').toLowerCase(),
    url,
    owner: overrides.owner ?? 'a',
    repo: overrides.repo ?? 'b',
    description: overrides.description ?? '测试仓库描述',
    stars: overrides.stars ?? 10,
    forks: overrides.forks ?? 2,
    language: overrides.language ?? 'TypeScript',
    topics: overrides.topics ?? [],
    summary: overrides.summary ?? '旧摘要',
    category: overrides.category ?? '测试分类',
    tags: overrides.tags ?? ['测试'],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  }
}

interface FetchRoute {
  match: (url: string, init: RequestInit | undefined) => boolean
  respond: () => Response
}

function installFetch(routes: FetchRoute[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const r of routes) {
      if (r.match(url, init)) return r.respond()
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const textRes = (text: string, status = 200) =>
  new Response(text, { status })

function repoData(owner: string, repo: string) {
  return {
    html_url: `https://github.com/${owner}/${repo}`,
    owner: { login: owner },
    name: repo,
    description: `${repo} 的描述`,
    stargazers_count: 100,
    forks_count: 10,
    language: 'TypeScript',
    topics: ['test'],
    default_branch: 'main',
    license: { name: 'MIT' },
    updated_at: '2024-01-01T00:00:00Z',
  }
}

function chatRes(analysis: { summary: string; category: string; suggestedTags: string[] }) {
  return {
    choices: [
      { message: { content: JSON.stringify(analysis) } },
    ],
  }
}

/** 常用路由：GitHub 元数据 + README + DeepSeek 成功响应 */
function okRoutes(owner: string, repo: string, analysis = { summary: '新摘要', category: '新分类', suggestedTags: ['新标签'] }): FetchRoute[] {
  return [
    {
      match: (u: string) => u === `https://api.github.com/repos/${owner}/${repo}`,
      respond: () => jsonRes(repoData(owner, repo)),
    },
    {
      match: (u: string) => u === `https://api.github.com/repos/${owner}/${repo}/readme`,
      respond: () => textRes('# README 内容'),
    },
    {
      match: (u: string) => u === 'https://api.deepseek.com/v1/chat/completions',
      respond: () => jsonRes(chatRes(analysis)),
    },
  ]
}

beforeEach(() => {
  const chromeMock = (globalThis as unknown as {
    chrome: { storage: { local: { clear: () => void } } }
  }).chrome
  chromeMock.storage.local.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── 基础消息分发 ──────────────────────────────────────────

describe('handleMessage 基础消息', () => {
  it('BG-01: GET_BOOKMARKS 初始为空数组', async () => {
    const result = await handleMessage({ action: 'GET_BOOKMARKS' })
    expect(result).toEqual([])
  })

  it('BG-02: SAVE_BOOKMARK 后可查询到该收藏', async () => {
    const b = makeBookmark()
    await handleMessage({ action: 'SAVE_BOOKMARK', payload: { bookmark: b } })
    const result = (await handleMessage({ action: 'GET_BOOKMARKS' })) as Bookmark[]
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(b.id)
  })

  it('BG-03: CHECK_BOOKMARKED 已收藏返回对象，未收藏返回 null', async () => {
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: { bookmark: makeBookmark() },
    })

    const hit = await handleMessage({
      action: 'CHECK_BOOKMARKED',
      payload: { url: 'https://github.com/a/b' },
    })
    expect(hit).toMatchObject({ owner: 'a', repo: 'b' })

    const miss = await handleMessage({
      action: 'CHECK_BOOKMARKED',
      payload: { url: 'https://github.com/x/y' },
    })
    expect(miss).toBeNull()
  })

  it('BG-04: DELETE_BOOKMARK 支持批量删除', async () => {
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: { bookmark: makeBookmark({ url: 'https://github.com/a/b' }) },
    })
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: {
        bookmark: makeBookmark({ url: 'https://github.com/c/d', owner: 'c', repo: 'd' }),
      },
    })

    await handleMessage({
      action: 'DELETE_BOOKMARK',
      payload: { ids: ['https://github.com/a/b'] },
    })

    const result = (await handleMessage({ action: 'GET_BOOKMARKS' })) as Bookmark[]
    expect(result).toHaveLength(1)
    expect(result[0].repo).toBe('d')
  })

  it('BG-05: 未知 action 抛出错误', async () => {
    await expect(handleMessage({ action: 'NOPE' })).rejects.toThrow('未知操作')
  })

  it('BG-06: GET_SETTINGS 未配置时返回默认设置', async () => {
    const result = await handleMessage({ action: 'GET_SETTINGS' })
    expect(result).toMatchObject({ deepseekApiKey: '' })
  })
})

// ─── 设置的合并式写入 ──────────────────────────────────────

describe('UPDATE_SETTINGS 合并写入', () => {
  it('BG-19: patch 只更新指定字段，其余字段保留', async () => {
    await handleMessage({
      action: 'UPDATE_SETTINGS',
      payload: { patch: { deepseekApiKey: 'sk-test', githubToken: 'gh-test' } },
    })

    await handleMessage({
      action: 'UPDATE_SETTINGS',
      payload: { patch: { deepseekModel: 'deepseek-v4-pro' } },
    })

    const result = (await handleMessage({ action: 'GET_SETTINGS' })) as Settings
    expect(result).toMatchObject({
      deepseekApiKey: 'sk-test',
      githubToken: 'gh-test',
      deepseekModel: 'deepseek-v4-pro',
    })
  })

  it('BG-20: 并发 patch 更新互不覆盖', async () => {
    await Promise.all([
      handleMessage({ action: 'UPDATE_SETTINGS', payload: { patch: { deepseekApiKey: 'sk-a' } } }),
      handleMessage({ action: 'UPDATE_SETTINGS', payload: { patch: { githubToken: 'gh-b' } } }),
      handleMessage({ action: 'UPDATE_SETTINGS', payload: { patch: { deepseekModel: 'deepseek-v4-pro' } } }),
    ])

    const result = (await handleMessage({ action: 'GET_SETTINGS' })) as Settings
    expect(result).toMatchObject({
      deepseekApiKey: 'sk-a',
      githubToken: 'gh-b',
      deepseekModel: 'deepseek-v4-pro',
    })
  })

  it('BG-21: 整体覆盖式 SAVE_SETTINGS 已从协议移除', async () => {
    await expect(
      handleMessage({ action: 'SAVE_SETTINGS', payload: TEST_SETTINGS }),
    ).rejects.toThrow('未知操作')
  })
})

// ─── 批量分析失败回传 ─────────────────────────────────────

describe('BATCH_ANALYZE 失败回传', () => {
  beforeEach(async () => {
    await handleMessage({ action: 'UPDATE_SETTINGS', payload: { patch: TEST_SETTINGS } })
  })

  it('BG-07: 未配置 API Key 时抛出中文提示', async () => {
    await handleMessage({
      action: 'UPDATE_SETTINGS',
      payload: { patch: { deepseekApiKey: '' } },
    })

    await expect(
      handleMessage({
        action: 'BATCH_ANALYZE',
        payload: { urls: ['https://github.com/a/b'] },
      }),
    ).rejects.toThrow('请先在设置中填写 DeepSeek API Key')
  })

  it('BG-08: 元数据获取失败的仓库计入 failed 清单回传', async () => {
    installFetch([
      {
        match: (u: string) => u === 'https://api.github.com/repos/a/b',
        respond: () => textRes('', 404),
      },
      ...okRoutes('c', 'd'),
    ])

    const result = (await handleMessage({
      action: 'BATCH_ANALYZE',
      payload: { urls: ['https://github.com/a/b', 'https://github.com/c/d'] },
    })) as BatchAnalyzeResult

    expect(result.newBookmarks).toHaveLength(1)
    expect(result.newBookmarks[0].repo).toBe('d')
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].url).toBe('https://github.com/a/b')
    expect(result.failed[0].error).toContain('不存在')
  })

  it('BG-09: 无效 URL 计入 failed 清单', async () => {
    installFetch(okRoutes('c', 'd'))

    const result = (await handleMessage({
      action: 'BATCH_ANALYZE',
      payload: { urls: ['not-a-url', 'https://github.com/c/d'] },
    })) as BatchAnalyzeResult

    expect(result.newBookmarks).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].url).toBe('not-a-url')
    expect(result.failed[0].error).toContain('无效')
  })

  it('BG-10: AI 分析失败的仓库不保存并计入 failed', async () => {
    let deepseekCalls = 0
    installFetch([
      {
        match: (u: string) => u === 'https://api.deepseek.com/v1/chat/completions',
        respond: () => {
          deepseekCalls++
          if (deepseekCalls === 1) return textRes('unauthorized', 401)
          return jsonRes(chatRes({ summary: '新摘要', category: '新分类', suggestedTags: ['t'] }))
        },
      },
      ...okRoutes('a', 'b').filter(
        (r) => !r.match('https://api.deepseek.com/v1/chat/completions', undefined),
      ),
      ...okRoutes('c', 'd').filter(
        (r) => !r.match('https://api.deepseek.com/v1/chat/completions', undefined),
      ),
    ])

    const result = (await handleMessage({
      action: 'BATCH_ANALYZE',
      payload: { urls: ['https://github.com/a/b', 'https://github.com/c/d'] },
    })) as BatchAnalyzeResult

    expect(result.newBookmarks).toHaveLength(1)
    expect(result.newBookmarks[0].repo).toBe('d')
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].url).toBe('https://github.com/a/b')
    expect(result.failed[0].error).toContain('Key 无效')

    const all = (await handleMessage({ action: 'GET_BOOKMARKS' })) as Bookmark[]
    expect(all).toHaveLength(1)
    expect(all[0].repo).toBe('d')
  })

  it('BG-11: 全部仓库元数据失败时抛出整体错误', async () => {
    installFetch([
      {
        match: (u: string) => u === 'https://api.github.com/repos/a/b',
        respond: () => textRes('', 404),
      },
    ])

    await expect(
      handleMessage({
        action: 'BATCH_ANALYZE',
        payload: { urls: ['https://github.com/a/b'] },
      }),
    ).rejects.toThrow('所有仓库')
  })

  it('BG-12: 成功时 failed 为空数组', async () => {
    installFetch(okRoutes('c', 'd'))

    const result = (await handleMessage({
      action: 'BATCH_ANALYZE',
      payload: { urls: ['https://github.com/c/d'] },
    })) as BatchAnalyzeResult

    expect(result.newBookmarks).toHaveLength(1)
    expect(result.newBookmarks[0].summary).toBe('新摘要')
    expect(result.failed).toEqual([])
  })
})

// ─── 重新分析失败回传 ─────────────────────────────────────

describe('REANALYZE 失败回传', () => {
  beforeEach(async () => {
    await handleMessage({ action: 'UPDATE_SETTINGS', payload: { patch: TEST_SETTINGS } })
  })

  it('BG-13: 元数据失败的仓库回传 failed 且原数据不变', async () => {
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: { bookmark: makeBookmark({ url: 'https://github.com/a/b', summary: '旧摘要a' }) },
    })
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: {
        bookmark: makeBookmark({ url: 'https://github.com/c/d', owner: 'c', repo: 'd', summary: '旧摘要c' }),
      },
    })

    installFetch([
      {
        match: (u: string) => u === 'https://api.github.com/repos/a/b',
        respond: () => textRes('', 404),
      },
      ...okRoutes('c', 'd'),
    ])

    const result = (await handleMessage({
      action: 'REANALYZE',
      payload: { ids: ['https://github.com/a/b', 'https://github.com/c/d'] },
    })) as ReanalyzeResult

    expect(result.reanalyzed).toBe(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].url).toBe('https://github.com/a/b')

    const all = (await handleMessage({ action: 'GET_BOOKMARKS' })) as Bookmark[]
    expect(all.find((b) => b.repo === 'b')?.summary).toBe('旧摘要a')
    expect(all.find((b) => b.repo === 'd')?.summary).toBe('新摘要')
  })

  it('BG-14: AI 失败的收藏保留原数据并回传 failed', async () => {
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: { bookmark: makeBookmark({ url: 'https://github.com/a/b', summary: '旧摘要a' }) },
    })

    installFetch([
      ...okRoutes('a', 'b').filter(
        (r) => !r.match('https://api.deepseek.com/v1/chat/completions', undefined),
      ),
      {
        match: (u: string) => u === 'https://api.deepseek.com/v1/chat/completions',
        respond: () => textRes('server error', 500),
      },
    ])

    const result = (await handleMessage({
      action: 'REANALYZE',
      payload: { ids: ['https://github.com/a/b'] },
    })) as ReanalyzeResult

    expect(result.reanalyzed).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toContain('DeepSeek')

    const all = (await handleMessage({ action: 'GET_BOOKMARKS' })) as Bookmark[]
    expect(all[0].summary).toBe('旧摘要a')
  })
})

// ─── 分析当前仓库与导入导出 ────────────────────────────────

describe('ANALYZE_CURRENT', () => {
  beforeEach(async () => {
    await handleMessage({ action: 'UPDATE_SETTINGS', payload: { patch: TEST_SETTINGS } })
  })

  it('BG-15: AI 分析失败时抛出错误而非返回空结果', async () => {
    installFetch([
      ...okRoutes('a', 'b').filter(
        (r) => !r.match('https://api.deepseek.com/v1/chat/completions', undefined),
      ),
      {
        match: (u: string) => u === 'https://api.deepseek.com/v1/chat/completions',
        respond: () => textRes('server error', 500),
      },
    ])

    await expect(
      handleMessage({
        action: 'ANALYZE_CURRENT',
        payload: { url: 'https://github.com/a/b' },
      }),
    ).rejects.toThrow('DeepSeek')
  })

  it('BG-16: 无效 URL 抛出错误', async () => {
    await expect(
      handleMessage({
        action: 'ANALYZE_CURRENT',
        payload: { url: 'https://example.com/foo' },
      }),
    ).rejects.toThrow('无效的 GitHub URL')
  })
})

describe('导入导出', () => {
  it('BG-17: EXPORT_JSON 输出可解析的 JSON', async () => {
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: { bookmark: makeBookmark() },
    })

    const text = (await handleMessage({ action: 'EXPORT_JSON' })) as string
    const parsed = JSON.parse(text) as { bookmarks: Bookmark[] }
    expect(parsed.bookmarks).toHaveLength(1)
    expect(parsed.bookmarks[0].repo).toBe('b')
  })

  it('BG-18: IMPORT_JSON replace 模式覆盖本地数据', async () => {
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: { bookmark: makeBookmark({ url: 'https://github.com/a/b' }) },
    })

    const importText = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      bookmarkCount: 1,
      bookmarks: [
        makeBookmark({ url: 'https://github.com/x/y', owner: 'x', repo: 'y' }),
      ],
    })

    const result = (await handleMessage({
      action: 'IMPORT_JSON',
      payload: { text: importText, mode: 'replace' },
    })) as Bookmark[]

    expect(result).toHaveLength(1)
    expect(result[0].repo).toBe('y')
  })
})

// ─── 检测归一化与恢复校验 ──────────────────────────────────

describe('CHECK_BOOKMARKED 归一化与 CLOUD_RESTORE 校验', () => {
  it('BG-22: 子页面/查询参数/大小写形态命中同一收藏', async () => {
    await handleMessage({
      action: 'SAVE_BOOKMARK',
      payload: { bookmark: makeBookmark() },
    })

    const variants = [
      'https://github.com/a/b/tree/main',
      'https://github.com/a/b/blob/main/README.md',
      'https://github.com/a/b?tab=readme',
      'https://github.com/a/b#readme',
      'https://github.com/a/b/',
      'https://GitHub.com/A/B',
    ]
    for (const url of variants) {
      const hit = await handleMessage({
        action: 'CHECK_BOOKMARKED',
        payload: { url },
      })
      expect(hit, `未命中: ${url}`).toMatchObject({ owner: 'a', repo: 'b' })
    }
  })

  it('BG-23: CLOUD_RESTORE 对备份逐条 normalizeBookmark', async () => {
    await handleMessage({
      action: 'UPDATE_SETTINGS',
      payload: { patch: { githubToken: 'gh-test', gistId: 'gist-1' } },
    })

    const gistPayload = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00Z',
      bookmarkCount: 1,
      bookmarks: [
        {
          url: 'https://github.com/a/b',
          summary: 'x'.repeat(FIELD_MAX_LENGTH.SUMMARY + 1000),
          stars: '100',
          tags: 'not-an-array',
          topics: null,
        },
      ],
    }
    installFetch([
      {
        match: (u: string) => u === 'https://api.github.com/gists/gist-1',
        respond: () =>
          jsonRes({
            id: 'gist-1',
            html_url: 'https://gist.github.com/gist-1',
            files: {
              [GIST_FILENAME]: { content: JSON.stringify(gistPayload) },
            },
          }),
      },
    ])

    const restored = (await handleMessage({
      action: 'CLOUD_RESTORE',
    })) as Bookmark[]

    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({
      id: 'https://github.com/a/b',
      owner: 'a',
      repo: 'b',
      // normalizeBookmark 契约：类型错误收敛为回退值（不做隐式强转）
      stars: 0,
      tags: [],
      topics: [],
    })
    expect(restored[0].summary.length).toBeLessThanOrEqual(FIELD_MAX_LENGTH.SUMMARY)
  })
})
