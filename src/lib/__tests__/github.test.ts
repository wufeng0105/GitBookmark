import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseGitHubUrl,
  normalizeRepoUrl,
  extractGitHubUrls,
  cleanReadme,
  fetchReadme,
  fetchRepoMeta,
} from '@/lib/github'
import { README_MAX_LENGTH } from '@/shared/constants'

describe('parseGitHubUrl', () => {
  it('GU-01: 标准 URL', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('GU-02: 带 .git 后缀', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react.git')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('GU-03: 带 trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react/')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('GU-04: 带 query params', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react?tab=readme')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('GU-05: 带 hash', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react#section')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('GU-06: 带 .git + query', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react.git?a=1')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('GU-07: 非 GitHub URL', () => {
    expect(parseGitHubUrl('https://gitlab.com/foo/bar')).toBeNull()
  })

  it('GU-08: 空字符串', () => {
    expect(parseGitHubUrl('')).toBeNull()
  })

  it('GU-09: 只有域名', () => {
    expect(parseGitHubUrl('https://github.com')).toBeNull()
  })

  it('GU-10: 只有 owner', () => {
    expect(parseGitHubUrl('https://github.com/facebook')).toBeNull()
  })

  it('GU-11: HTTP 协议', () => {
    expect(parseGitHubUrl('http://github.com/facebook/react')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('GU-12: 带空格的 URL', () => {
    expect(parseGitHubUrl('  https://github.com/facebook/react  ')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })
})

describe('extractGitHubUrls', () => {
  it('EU-01: 多行 URL', () => {
    const result = extractGitHubUrls('https://github.com/a/b\nhttps://github.com/c/d')
    expect(result).toHaveLength(2)
  })

  it('EU-02: 去重', () => {
    const result = extractGitHubUrls('https://github.com/a/b\nhttps://github.com/a/b')
    expect(result).toHaveLength(1)
  })

  it('EU-03: 混合非法 URL', () => {
    const result = extractGitHubUrls('hello\nhttps://github.com/a/b\nnot a url')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('https://github.com/a/b')
  })

  it('EU-04: 空格分隔', () => {
    const result = extractGitHubUrls('https://github.com/a/b https://github.com/c/d')
    expect(result).toHaveLength(2)
  })

  it('EU-05: 逗号分隔', () => {
    const result = extractGitHubUrls('https://github.com/a/b,https://github.com/c/d')
    expect(result).toHaveLength(2)
  })

  it('EU-06: 空文本', () => {
    expect(extractGitHubUrls('')).toEqual([])
  })

  it('EU-07: URL 规范化输出', () => {
    const result = extractGitHubUrls('https://github.com/Facebook/React')
    expect(result[0]).toBe('https://github.com/Facebook/React')
  })

  it('EU-08: 去重使用小写比较', () => {
    const result = extractGitHubUrls('https://github.com/Facebook/React\nhttps://github.com/facebook/react')
    expect(result).toHaveLength(1)
  })
})

describe('cleanReadme', () => {
  it('CR-01: 移除 shields.io badge', () => {
    const result = cleanReadme('![CI](https://img.shields.io/badge/CI-passing)\n# Title')
    expect(result).not.toContain('img.shields.io')
    expect(result).toContain('# Title')
  })

  it('CR-02: 移除 GitHub Actions badge', () => {
    const result = cleanReadme('![Actions](https://github.com/foo/bar/actions/workflows/ci.yml/badge.svg)\n# Title')
    expect(result).not.toContain('actions/workflows')
    expect(result).toContain('# Title')
  })

  it('CR-03: 移除 HTML 注释', () => {
    const result = cleanReadme('<!-- secret -->\n# Title')
    expect(result).not.toContain('secret')
    expect(result).toContain('# Title')
  })

  it('CR-04: 压缩连续空行', () => {
    const result = cleanReadme('# A\n\n\n\n# B')
    expect(result).not.toMatch(/\n{3,}/)
  })

  it('CR-05: 截断超长内容', () => {
    const long = 'x'.repeat(5000)
    const result = cleanReadme(long)
    expect(result.length).toBeLessThanOrEqual(README_MAX_LENGTH)
  })

  it('CR-06: 正常 README 不丢失内容', () => {
    const result = cleanReadme('# Title\n\nSome content')
    expect(result).toContain('# Title')
    expect(result).toContain('Some content')
  })
})

// ─── fetchReadme / fetchRepoMeta（mock fetch） ─────────────

function installFetch(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => handler(String(input)))
  vi.stubGlobal('fetch', fn)
  return fn
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchReadme', () => {
  it('FR-01: 200 时返回清理后的 README 内容', async () => {
    installFetch((url) => {
      if (url.endsWith('/readme')) {
        return new Response('# Hello\n\n![badge](https://img.shields.io/badge/x-y)\n\nWorld')
      }
      return new Response('', { status: 404 })
    })

    const result = await fetchReadme('a', 'b')
    expect(result).toContain('# Hello')
    expect(result).toContain('World')
    expect(result).not.toContain('img.shields.io')
  })

  it('FR-02: 404 时降级查找根目录无 README 文件则返回空字符串', async () => {
    installFetch((url) => {
      if (url.endsWith('/readme')) return new Response('', { status: 404 })
      if (url.endsWith('/contents/')) return jsonRes([{ name: 'src' }, { name: 'package.json' }])
      return new Response('', { status: 404 })
    })

    const result = await fetchReadme('a', 'b')
    expect(result).toBe('')
  })

  it('FR-03: 404 时降级获取非标准文件名 README', async () => {
    installFetch((url) => {
      if (url.endsWith('/readme')) return new Response('', { status: 404 })
      if (url.endsWith('/contents/')) return jsonRes([{ name: 'readme.zh-CN.md' }])
      if (url.startsWith('https://raw.githubusercontent.com/')) {
        return new Response('# 中文 README')
      }
      return new Response('', { status: 404 })
    })

    const result = await fetchReadme('a', 'b')
    expect(result).toContain('中文 README')
  })

  it('FR-04: 403 速率限制时降级返回空字符串且记录警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installFetch((url) => {
      if (url.endsWith('/readme')) return new Response('', { status: 403 })
      return new Response('', { status: 404 })
    })

    const result = await fetchReadme('a', 'b')
    expect(result).toBe('')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('README'),
      expect.stringContaining('a/b'),
    )
  })

  it('FR-05: 网络错误时降级返回空字符串（不抛出）并记录警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installFetch(() => Promise.reject(new TypeError('network down')))

    const result = await fetchReadme('a', 'b')
    expect(result).toBe('')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('README'),
      expect.anything(),
    )
  })

  it('FR-06: 其他非 2xx 状态码降级返回空字符串且记录警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installFetch((url) => {
      if (url.endsWith('/readme')) return new Response('', { status: 500 })
      return new Response('', { status: 404 })
    })

    const result = await fetchReadme('a', 'b')
    expect(result).toBe('')
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('fetchRepoMeta', () => {
  const repoData = {
    html_url: 'https://github.com/a/b',
    owner: { login: 'a' },
    name: 'b',
    description: 'desc',
    stargazers_count: 42,
    forks_count: 7,
    language: 'Rust',
    topics: ['cli'],
    default_branch: 'main',
    license: { name: 'MIT' },
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('RM-01: 200 时正确映射 RepoMeta 字段', async () => {
    installFetch((url) => {
      if (url === 'https://api.github.com/repos/a/b') return jsonRes(repoData)
      return new Response('', { status: 404 })
    })

    const meta = await fetchRepoMeta('a', 'b')
    expect(meta).toMatchObject({
      url: 'https://github.com/a/b',
      owner: 'a',
      repo: 'b',
      stars: 42,
      forks: 7,
      language: 'Rust',
      topics: ['cli'],
    })
    expect(meta.readmeContent).toBe('')
  })

  it('RM-02: 404 抛出仓库不存在', async () => {
    installFetch(() => new Response('', { status: 404 }))
    await expect(fetchRepoMeta('a', 'missing')).rejects.toThrow('不存在')
  })

  it('RM-03: 403 抛出速率限制提示', async () => {
    installFetch(() => new Response('', { status: 403 }))
    await expect(fetchRepoMeta('a', 'b')).rejects.toThrow('速率限制')
  })

  it('RM-04: 网络错误抛出中文提示', async () => {
    installFetch(() => Promise.reject(new TypeError('network down')))
    await expect(fetchRepoMeta('a', 'b')).rejects.toThrow('网络请求失败')
  })

  it('RM-05: 响应结构异常时抛出格式异常', async () => {
    installFetch((url) => {
      if (url === 'https://api.github.com/repos/a/b') return jsonRes({ foo: 1 })
      return new Response('', { status: 404 })
    })
    await expect(fetchRepoMeta('a', 'b')).rejects.toThrow('格式异常')
  })

  it('RM-06: 携带 Token 时请求头包含 Authorization', async () => {
    const fn = installFetch(() => jsonRes(repoData))
    await fetchRepoMeta('a', 'b', 'gh-token')
    const init = (fn.mock.calls[0] as unknown[])[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer gh-token')
  })
})

describe('normalizeRepoUrl', () => {
  it('NU-01: 剥离子路径、查询参数与哈希', () => {
    expect(
      normalizeRepoUrl('https://github.com/Facebook/React/tree/main?tab=readme#readme'),
    ).toBe('https://github.com/Facebook/React')
  })

  it('NU-02: 剥离 .git 后缀', () => {
    expect(normalizeRepoUrl('https://github.com/a/b.git')).toBe('https://github.com/a/b')
  })

  it('NU-03: 标准根 URL 保持原样', () => {
    expect(normalizeRepoUrl('https://github.com/a/b')).toBe('https://github.com/a/b')
  })

  it('NU-04: 非 GitHub URL 返回 null', () => {
    expect(normalizeRepoUrl('https://example.com/a/b')).toBeNull()
  })
})
