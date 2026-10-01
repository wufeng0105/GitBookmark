import { describe, it, expect } from 'vitest'
import { exportToMarkdown, importFromMarkdown } from '@/lib/markdown'
import { MARKDOWN_HEADER } from '@/shared/constants'
import { bookmarkId } from '@/lib/storage'
import type { Bookmark } from '@/lib/types'

// ─── 测试辅助 ──────────────────────────────────────────────

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/facebook/react'
  return {
    id: bookmarkId(url),
    url,
    owner: 'facebook',
    repo: 'react',
    description: 'The library for web and native user interfaces.',
    stars: 220000,
    forks: 45000,
    language: 'JavaScript',
    topics: [],
    summary: 'React 是一个用于构建用户界面的 JavaScript 库',
    category: '前端框架',
    tags: ['前端框架', 'UI库'],
    createdAt: new Date('2024-01-15T10:30:00').getTime(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ─── exportToMarkdown ──────────────────────────────────────

describe('exportToMarkdown', () => {
  it('MD-01: 输出头部标识、导出时间与收藏数量', () => {
    const md = exportToMarkdown([makeBookmark()])

    expect(md).toContain(MARKDOWN_HEADER)
    expect(md).toContain('> 导出时间：')
    expect(md).toContain('> 共 1 个收藏')
  })

  it('MD-02: 单个收藏输出标题链接与全部字段', () => {
    const md = exportToMarkdown([makeBookmark()])

    expect(md).toContain('## [facebook/react](https://github.com/facebook/react)')
    expect(md).toContain('- **描述**: The library for web and native user interfaces.')
    expect(md).toContain('**Star**: 220,000')
    expect(md).toContain('**Fork**: 45,000')
    expect(md).toContain('**语言**: JavaScript')
    expect(md).toContain('- **分类**: 前端框架')
    expect(md).toContain('- **标签**: `前端框架` `UI库`')
    expect(md).toContain('- **摘要**: React 是一个用于构建用户界面的 JavaScript 库')
    expect(md).toContain('- **收藏时间**: 2024-01-15')
  })

  it('MD-03: 语言为空、标签为空、摘要为空时省略对应行', () => {
    const md = exportToMarkdown([
      makeBookmark({ language: null, tags: [], summary: '' }),
    ])

    expect(md).not.toContain('**语言**')
    expect(md).not.toContain('**标签**')
    expect(md).not.toContain('**摘要**')
  })

  it('MD-04: 空描述输出（无描述）占位', () => {
    const md = exportToMarkdown([makeBookmark({ description: '' })])
    expect(md).toContain('- **描述**: （无描述）')
  })

  it('MD-05: 空列表仅输出头部', () => {
    const md = exportToMarkdown([])
    expect(md).toContain(MARKDOWN_HEADER)
    expect(md).not.toContain('## [')
    expect(md).toContain('> 共 0 个收藏')
  })
})

// ─── importFromMarkdown ────────────────────────────────────

describe('importFromMarkdown', () => {
  it('MD-06: 导出后导入可还原核心字段（互逆）', () => {
    const original = [
      makeBookmark(),
      makeBookmark({
        url: 'https://github.com/vitejs/vite',
        owner: 'vitejs',
        repo: 'vite',
        description: 'Next generation frontend tooling',
        stars: 65000,
        forks: 5800,
        language: 'TypeScript',
        category: '构建工具',
        tags: ['构建工具', 'ESM'],
        summary: 'Vite 是新一代前端构建工具',
      }),
    ]

    const imported = importFromMarkdown(exportToMarkdown(original))

    expect(imported).toHaveLength(2)
    const [a, b] = imported
    expect(a.owner).toBe('facebook')
    expect(a.repo).toBe('react')
    expect(a.url).toBe('https://github.com/facebook/react')
    expect(a.description).toBe('The library for web and native user interfaces.')
    expect(a.stars).toBe(220000)
    expect(a.forks).toBe(45000)
    expect(a.language).toBe('JavaScript')
    expect(a.category).toBe('前端框架')
    expect(a.tags).toEqual(['前端框架', 'UI库'])
    expect(a.summary).toBe('React 是一个用于构建用户界面的 JavaScript 库')
    expect(a.id).toBe(bookmarkId('https://github.com/facebook/react'))

    expect(b.repo).toBe('vite')
    expect(b.stars).toBe(65000)
    expect(b.tags).toEqual(['构建工具', 'ESM'])
  })

  it('MD-07: 解析手动编写的简化 Markdown', () => {
    const md = [
      MARKDOWN_HEADER,
      '',
      '## [vuejs/core](https://github.com/vuejs/core)',
      '',
      '- **描述**: Vue.js core',
      '- **Star**: 45,000 | **Fork**: 8,200 | **语言**: TypeScript',
      '- **分类**: 前端框架',
      '- **收藏时间**: 2023-05-20',
      '',
    ].join('\n')

    const result = importFromMarkdown(md)

    expect(result).toHaveLength(1)
    expect(result[0].owner).toBe('vuejs')
    expect(result[0].repo).toBe('core')
    expect(result[0].stars).toBe(45000)
    expect(result[0].forks).toBe(8200)
    expect(result[0].language).toBe('TypeScript')
    expect(result[0].category).toBe('前端框架')
    expect(result[0].tags).toEqual([])
    expect(result[0].summary).toBe('')
  })

  it('MD-08: 无仓库标题行时返回空数组', () => {
    expect(importFromMarkdown('# 只有标题\n\n没有内容')).toEqual([])
    expect(importFromMarkdown('')).toEqual([])
  })

  it('MD-09: 字段缺失时补全默认值并生成稳定 ID', () => {
    const md = '## [a/b](https://github.com/a/b)\n'

    const result = importFromMarkdown(md)

    expect(result).toHaveLength(1)
    const b = result[0]
    expect(b.id).toBe('https://github.com/a/b')
    expect(b.owner).toBe('a')
    expect(b.repo).toBe('b')
    expect(b.description).toBe('')
    expect(b.stars).toBe(0)
    expect(b.language).toBeNull()
    expect(b.topics).toEqual([])
    expect(b.category).toBeNull()
    expect(b.createdAt).toBeGreaterThan(0)
  })

  it('MD-10: 多个收藏依次解析且互不串扰', () => {
    const md = [
      '## [a/one](https://github.com/a/one)',
      '- **摘要**: 摘要一',
      '',
      '## [a/two](https://github.com/a/two)',
      '- **摘要**: 摘要二',
      '',
    ].join('\n')

    const result = importFromMarkdown(md)

    expect(result).toHaveLength(2)
    expect(result[0].summary).toBe('摘要一')
    expect(result[1].summary).toBe('摘要二')
    expect(result[0].url).toBe('https://github.com/a/one')
    expect(result[1].url).toBe('https://github.com/a/two')
  })
})
