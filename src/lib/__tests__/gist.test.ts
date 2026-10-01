import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildBackupContent,
  createGistBackup,
  updateGistBackup,
  fetchGistBackup,
  getGistBackupInfo,
} from '@/lib/gist'
import { GITHUB_API_URL, GIST_FILENAME, GIST_DESCRIPTION } from '@/shared/constants'
import type { Bookmark } from '@/lib/types'

// ─── 测试辅助 ──────────────────────────────────────────────

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/a/b'
  return {
    id: url.toLowerCase(),
    url,
    owner: overrides.owner ?? 'a',
    repo: overrides.repo ?? 'b',
    description: '测试描述',
    stars: 10,
    forks: 2,
    language: 'TypeScript',
    topics: [],
    summary: '测试摘要',
    category: '测试分类',
    tags: ['测试'],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  }
}

function installFetch(respond: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    respond(String(input), init),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** 构造 Gist API 响应体 */
function gistResponse(bookmarks: Bookmark[]) {
  return {
    id: 'gist123',
    html_url: 'https://gist.github.com/gist123',
    description: GIST_DESCRIPTION,
    updated_at: '2024-06-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    files: {
      [GIST_FILENAME]: {
        filename: GIST_FILENAME,
        content: buildBackupContent(bookmarks),
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── buildBackupContent ────────────────────────────────────

describe('buildBackupContent', () => {
  it('GB-01: 生成包含版本号、数量与收藏数组的合法 JSON', () => {
    const bookmarks = [makeBookmark(), makeBookmark({ url: 'https://github.com/c/d' })]

    const payload = JSON.parse(buildBackupContent(bookmarks))

    expect(payload.version).toBe(1)
    expect(payload.bookmarkCount).toBe(2)
    expect(payload.bookmarks).toHaveLength(2)
    expect(payload.exportedAt).toBeTruthy()
  })
})

// ─── createGistBackup ──────────────────────────────────────

describe('createGistBackup', () => {
  it('GB-02: 成功创建私有 Gist 并返回 ID 与 URL', async () => {
    const fetchFn = installFetch(() => jsonRes(gistResponse([])))

    const result = await createGistBackup('gh-token', [makeBookmark()])

    expect(result).toEqual({
      gistId: 'gist123',
      gistUrl: 'https://gist.github.com/gist123',
    })

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GITHUB_API_URL}/gists`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gh-token')
    const body = JSON.parse(String(init.body)) as {
      public: boolean
      description: string
      files: Record<string, { content: string }>
    }
    expect(body.public).toBe(false)
    expect(body.description).toBe(GIST_DESCRIPTION)
    expect(body.files[GIST_FILENAME]).toBeTruthy()
  })

  it('GB-03: 401 时提示 Token 无效', async () => {
    installFetch(() => jsonRes({ message: 'Bad credentials' }, 401))
    await expect(createGistBackup('bad', [])).rejects.toThrow('GitHub Token 无效')
  })

  it('GB-04: 403 时提示速率限制或权限不足', async () => {
    installFetch(() => jsonRes({ message: 'rate limited' }, 403))
    await expect(createGistBackup('t', [])).rejects.toThrow('gist 权限')
  })

  it('GB-05: 404 时提示缺少 gist 权限', async () => {
    installFetch(() => jsonRes({ message: 'Not Found' }, 404))
    await expect(createGistBackup('t', [])).rejects.toThrow('缺少 gist 权限')
  })

  it('GB-06: 网络错误时返回中文提示而非原始异常', async () => {
    installFetch(() => Promise.reject(new TypeError('offline')) as unknown as Response)
    await expect(createGistBackup('t', [])).rejects.toThrow('GitHub Gist API 网络请求失败')
  })
})

// ─── updateGistBackup ──────────────────────────────────────

describe('updateGistBackup', () => {
  it('GB-07: 成功更新已有 Gist（PATCH）并返回 URL', async () => {
    const fetchFn = installFetch(() => jsonRes(gistResponse([])))

    const result = await updateGistBackup('gh-token', 'gist123', [makeBookmark()])

    expect(result).toEqual({ gistUrl: 'https://gist.github.com/gist123' })
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GITHUB_API_URL}/gists/gist123`)
    expect(init.method).toBe('PATCH')
  })

  it('GB-08: Gist 已被删除时提示重新创建', async () => {
    installFetch(() => jsonRes({ message: 'Not Found' }, 404))
    await expect(updateGistBackup('t', 'gone', [])).rejects.toThrow('可能已被删除')
  })
})

// ─── fetchGistBackup ───────────────────────────────────────

describe('fetchGistBackup', () => {
  it('GB-09: 成功恢复备份内容为收藏列表', async () => {
    const bookmarks = [
      makeBookmark(),
      makeBookmark({ url: 'https://github.com/c/d', owner: 'c', repo: 'd' }),
    ]
    installFetch(() => jsonRes(gistResponse(bookmarks)))

    const result = await fetchGistBackup('gh-token', 'gist123')

    expect(result).toHaveLength(2)
    expect(result[0].url).toBe('https://github.com/a/b')
    expect(result[1].repo).toBe('d')
  })

  it('GB-10: Gist 中缺少备份文件时报错', async () => {
    installFetch(() =>
      jsonRes({
        id: 'gist123',
        html_url: 'https://gist.github.com/gist123',
        description: null,
        updated_at: '2024-06-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        files: { 'other.txt': { filename: 'other.txt', content: 'x' } },
      }),
    )
    await expect(fetchGistBackup('t', 'gist123')).rejects.toThrow('Gist 中未找到备份文件')
  })

  it('GB-11: 备份文件内容不是合法 JSON 时报错', async () => {
    installFetch(() =>
      jsonRes({
        id: 'gist123',
        html_url: 'https://gist.github.com/gist123',
        description: null,
        updated_at: '2024-06-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        files: { [GIST_FILENAME]: { filename: GIST_FILENAME, content: '{broken' } },
      }),
    )
    await expect(fetchGistBackup('t', 'gist123')).rejects.toThrow('JSON 解析失败')
  })

  it('GB-12: 备份 JSON 缺少 bookmarks 数组时提示格式异常', async () => {
    installFetch(() =>
      jsonRes({
        id: 'gist123',
        html_url: 'https://gist.github.com/gist123',
        description: null,
        updated_at: '2024-06-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        files: { [GIST_FILENAME]: { filename: GIST_FILENAME, content: '{"version":1}' } },
      }),
    )
    await expect(fetchGistBackup('t', 'gist123')).rejects.toThrow('备份文件格式异常')
  })

  it('GB-13: 404 时提示备份不存在', async () => {
    installFetch(() => jsonRes({ message: 'Not Found' }, 404))
    await expect(fetchGistBackup('t', 'gone')).rejects.toThrow('备份 Gist 不存在')
  })
})

// ─── getGistBackupInfo ─────────────────────────────────────

describe('getGistBackupInfo', () => {
  it('GB-14: 成功提取备份信息（含从文件内容解析的收藏数量）', async () => {
    const bookmarks = [
      makeBookmark(),
      makeBookmark({ url: 'https://github.com/c/d' }),
      makeBookmark({ url: 'https://github.com/e/f' }),
    ]
    installFetch(() => jsonRes(gistResponse(bookmarks)))

    const info = await getGistBackupInfo('gh-token', 'gist123')

    expect(info).toEqual({
      gistId: 'gist123',
      gistUrl: 'https://gist.github.com/gist123',
      lastBackupAt: '2024-06-01T00:00:00Z',
      bookmarkCount: 3,
      description: GIST_DESCRIPTION,
    })
  })

  it('GB-15: Gist 无备份文件时数量为 0 而不报错', async () => {
    installFetch(() =>
      jsonRes({
        id: 'gist123',
        html_url: 'https://gist.github.com/gist123',
        description: null,
        updated_at: '2024-06-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        files: {},
      }),
    )

    const info = await getGistBackupInfo('t', 'gist123')
    expect(info.bookmarkCount).toBe(0)
  })
})
