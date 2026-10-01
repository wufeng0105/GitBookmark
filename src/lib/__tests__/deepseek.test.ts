import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractJSON, batchAnalyzeRepos } from '@/lib/deepseek'
import { DEEPSEEK_API_URL } from '@/shared/constants'
import type { Bookmark, RepoMeta, Settings } from '@/lib/types'

// ─── 测试辅助 ──────────────────────────────────────────────

const TEST_SETTINGS: Settings = {
  deepseekApiKey: 'sk-test',
  githubToken: 'gh-test',
  deepseekModel: 'deepseek-v4-flash',
  gistId: '',
}

function makeMeta(owner: string, repo: string, overrides: Partial<RepoMeta> = {}): RepoMeta {
  return {
    url: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    description: `${repo} 的描述`,
    stars: 100,
    forks: 10,
    language: 'TypeScript',
    topics: ['test'],
    readmeContent: '# README 内容',
    ...overrides,
  }
}

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/a/b'
  return {
    id: url.toLowerCase(),
    url,
    owner: overrides.owner ?? 'a',
    repo: overrides.repo ?? 'b',
    description: '已有收藏描述',
    stars: 10,
    forks: 2,
    language: 'TypeScript',
    topics: [],
    summary: '旧摘要',
    category: overrides.category ?? '已有分类',
    tags: overrides.tags ?? ['已有标签'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
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

const textRes = (text: string, status = 200) => new Response(text, { status })

/** DeepSeek Chat Completion 成功响应 */
function chatRes(content: string) {
  return { choices: [{ message: { content } }] }
}

/** 按请求体中的仓库标识路由（user prompt 含 owner/repo，用于区分并发请求） */
function deepseekRoute(
  repoMark: string,
  analysis: { summary: string; category: string; suggestedTags: string[] } | { __raw: string },
): FetchRoute {
  return {
    match: (u, init) => u === DEEPSEEK_API_URL && String(init?.body ?? '').includes(repoMark),
    respond: () => {
      const content = '__raw' in analysis ? analysis.__raw : JSON.stringify(analysis)
      return jsonRes(chatRes(content))
    },
  }
}

/** 兜底 DeepSeek 路由（未匹配到仓库标识时命中） */
const deepseekFallback: FetchRoute = {
  match: (u) => u === DEEPSEEK_API_URL,
  respond: () => jsonRes(chatRes(JSON.stringify({ summary: '兜底摘要', category: '兜底分类', suggestedTags: [] }))),
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── extractJSON ───────────────────────────────────────────

describe('extractJSON', () => {
  it('EJ-01: 解析纯 JSON 字符串', () => {
    const result = extractJSON<{ summary: string }>('{"summary":"你好"}')
    expect(result).toEqual({ summary: '你好' })
  })

  it('EJ-02: 解析 ```json 围栏包裹的内容', () => {
    const result = extractJSON<{ category: string }>(
      '分析结果：\n```json\n{"category":"前端框架"}\n```',
    )
    expect(result).toEqual({ category: '前端框架' })
  })

  it('EJ-03: 解析无语言标注的 ``` 围栏内容', () => {
    const result = extractJSON<{ tags: string[] }>('```\n{"tags":["React"]}\n```')
    expect(result).toEqual({ tags: ['React'] })
  })

  it('EJ-04: 无法解析时抛出中文错误提示', () => {
    expect(() => extractJSON('这不是 JSON')).toThrow(
      'AI 返回内容无法解析为 JSON，请重试',
    )
  })

  it('EJ-05: JSON 字符串值内部的三反引号不被误判为围栏', () => {
    const raw =
      '{"summary":"用法：```js\\nnpm i react```","category":"前端框架"}'
    const result = extractJSON<{ summary: string; category: string }>(raw)
    expect(result.summary).toBe('用法：```js\nnpm i react```')
    expect(result.category).toBe('前端框架')
  })

  it('EJ-06: 围栏内 JSON 的值含三反引号时仍可解析', () => {
    const raw =
      '分析结果：\n```json\n{"summary":"见 ```bash\\nnpm i``` 一节"}\n```'
    const result = extractJSON<{ summary: string }>(raw)
    expect(result.summary).toBe('见 ```bash\nnpm i``` 一节')
  })
})

// ─── batchAnalyzeRepos ─────────────────────────────────────

describe('batchAnalyzeRepos', () => {
  it('BA-01: 空 metas 直接返回空结果且不发起任何请求', async () => {
    const fetchFn = installFetch([deepseekFallback])

    const output = await batchAnalyzeRepos([], [], TEST_SETTINGS)

    expect(output).toEqual({ results: [], failures: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('BA-02: 全部成功时结果与 metas 等长、无失败项', async () => {
    installFetch([
      deepseekRoute('a/one', { summary: '摘要一', category: '前端框架', suggestedTags: ['React'] }),
      deepseekRoute('a/two', { summary: '摘要二', category: 'CLI工具', suggestedTags: ['Node'] }),
      deepseekFallback,
    ])

    const output = await batchAnalyzeRepos(
      [makeMeta('a', 'one'), makeMeta('a', 'two')],
      [],
      TEST_SETTINGS,    )

    expect(output.failures).toEqual([])
    expect(output.results).toHaveLength(2)
    expect(output.results[0]).toEqual({ summary: '摘要一', category: '前端框架', suggestedTags: ['React'] })
    expect(output.results[1]).toEqual({ summary: '摘要二', category: 'CLI工具', suggestedTags: ['Node'] })
  })

  it('BA-03: 请求体包含模型名、JSON 模式与鉴权头', async () => {
    const fetchFn = installFetch([
      deepseekRoute('a/one', { summary: 's', category: 'c', suggestedTags: [] }),
      deepseekFallback,
    ])

    await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(DEEPSEEK_API_URL)
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(String(init?.body)) as { model: string; response_format: { type: string } }
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.response_format.type).toBe('json_object')
  })

  it('BA-04: 已有分类和标签注入 prompt 供 AI 复用', async () => {
    const fetchFn = installFetch([
      deepseekRoute('a/one', { summary: 's', category: 'c', suggestedTags: [] }),
      deepseekFallback,
    ])
    const existing = [
      makeBookmark({ category: '前端框架', tags: ['React'] }),
      makeBookmark({ url: 'https://github.com/x/y', category: 'CLI工具', tags: ['Node'] }),
    ]

    await batchAnalyzeRepos([makeMeta('a', 'one')], existing, TEST_SETTINGS)

    const body = String(fetchFn.mock.calls[0][1]?.body)
    expect(body).toContain('前端框架')
    expect(body).toContain('CLI工具')
    expect(body).toContain('React')
    expect(body).toContain('Node')
  })

  it('BA-05: AI 返回 tags 字段时兼容读取为 suggestedTags', async () => {
    installFetch([
      {
        match: (u) => u === DEEPSEEK_API_URL,
        respond: () => jsonRes(chatRes('{"summary":"s","category":"c","tags":["兼容标签"]}')),
      },
    ])

    const output = await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)

    expect(output.results[0].suggestedTags).toEqual(['兼容标签'])
  })

  it('BA-06: AI 返回 { results: [...] } 包装结构时取第一个元素', async () => {
    installFetch([
      {
        match: (u) => u === DEEPSEEK_API_URL,
        respond: () =>
          jsonRes(
            chatRes(
              JSON.stringify({
                results: [{ summary: '包装摘要', category: '包装分类', suggestedTags: ['t'] }],
              }),
            ),
          ),
      },
    ])

    const output = await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)

    expect(output.results[0]).toEqual({ summary: '包装摘要', category: '包装分类', suggestedTags: ['t'] })
  })

  it('BA-07: 部分失败时 results 保持等长占位、failures 携带下标与原因', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    installFetch([
      {
        match: (u, init) =>
          u === DEEPSEEK_API_URL && String(init?.body ?? '').includes('a/bad'),
        respond: () => jsonRes({ error: 'unauthorized' }, 401),
      },
      deepseekRoute('a/good', { summary: '成功摘要', category: '前端框架', suggestedTags: [] }),
      deepseekFallback,
    ])

    const output = await batchAnalyzeRepos(
      [makeMeta('a', 'good'), makeMeta('a', 'bad')],
      [],
      TEST_SETTINGS,    )

    expect(output.results).toHaveLength(2)
    expect(output.results[0].summary).toBe('成功摘要')
    expect(output.results[1]).toEqual({ summary: '', category: '', suggestedTags: [] })
    expect(output.failures).toHaveLength(1)
    expect(output.failures[0].index).toBe(1)
    expect(output.failures[0].repo).toBe('a/bad')
    expect(output.failures[0].error).toContain('API Key 无效')
  })

  it('BA-08: 相似分类名（含空格差异）归一化为先出现的名称', async () => {
    installFetch([
      deepseekRoute('a/one', { summary: 's1', category: '前端框架', suggestedTags: [] }),
      deepseekRoute('a/two', { summary: 's2', category: '前端 框架', suggestedTags: [] }),
      deepseekFallback,
    ])

    const output = await batchAnalyzeRepos(
      [makeMeta('a', 'one'), makeMeta('a', 'two')],
      [],
      TEST_SETTINGS,    )

    expect(output.results[0].category).toBe('前端框架')
    expect(output.results[1].category).toBe('前端框架')
  })

  it('BA-08b: 「大类/小类」无空格或全角斜杠归一化为「大类 / 小类」', async () => {
    installFetch([
      deepseekRoute('a/one', { summary: 's1', category: 'AI 智能体与模型/GUI 智能体', suggestedTags: [] }),
      deepseekRoute('a/two', { summary: 's2', category: 'AI 智能体与模型 ／ GUI 智能体', suggestedTags: [] }),
      deepseekFallback,
    ])

    const output = await batchAnalyzeRepos(
      [makeMeta('a', 'one'), makeMeta('a', 'two')],
      [],
      TEST_SETTINGS,    )

    expect(output.results[0].category).toBe('AI 智能体与模型 / GUI 智能体')
    expect(output.results[1].category).toBe('AI 智能体与模型 / GUI 智能体')
  })

  it('BA-08c: system prompt 注入固定分类体系与小类表', async () => {
    const fetchFn = installFetch([
      deepseekRoute('a/one', { summary: 's', category: 'c', suggestedTags: [] }),
      deepseekFallback,
    ])

    await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)

    const body = String(fetchFn.mock.calls[0][1]?.body)
    expect(body).toContain('固定分类体系')
    expect(body).toContain('AI 智能体与模型')
    expect(body).toContain('GUI 智能体')
    expect(body).toContain('禁止创建新分类')
  })

  it('BA-09: 401 / 429 / 5xx 返回对应的中文错误提示', async () => {    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cases: Array<{ status: number; body: string; message: string }> = [
      { status: 401, body: '', message: 'DeepSeek API Key 无效，请在设置中检查' },
      { status: 429, body: '', message: 'DeepSeek API 调用频率超限，请稍后重试' },
      { status: 500, body: '', message: 'DeepSeek 服务暂时不可用，请稍后重试' },
    ]

    for (const c of cases) {
      installFetch([
        { match: (u) => u === DEEPSEEK_API_URL, respond: () => textRes(c.body, c.status) },
      ])
      const output = await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)
      expect(output.failures[0].error).toBe(c.message)
    }
  })

  it('BA-10: 400 且错误文本含 model 时提示切换模型', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    installFetch([
      {
        match: (u) => u === DEEPSEEK_API_URL,
        respond: () =>
          textRes('{"error":{"message":"Model not exist"}}', 400),
      },
    ])

    const output = await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)

    expect(output.failures[0].error).toContain('模型名不被支持')
  })

  it('BA-11: 响应结构异常（choices 为空）时返回格式异常提示', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    installFetch([
      { match: (u) => u === DEEPSEEK_API_URL, respond: () => jsonRes({ choices: [] }) },
    ])

    const output = await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)

    expect(output.failures[0].error).toBe('DeepSeek API 返回数据格式异常')
  })

  it('BA-12: 网络错误时返回网络请求失败提示而非原始异常', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    installFetch([
      {
        match: (u) => u === DEEPSEEK_API_URL,
        respond: () => Promise.reject(new TypeError('network down')) as unknown as Response,
      },
    ])

    const output = await batchAnalyzeRepos([makeMeta('a', 'one')], [], TEST_SETTINGS)

    expect(output.failures[0].error).toBe('DeepSeek API 网络请求失败，请检查网络后重试')
  })
})
