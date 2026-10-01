import { describe, it, expect } from 'vitest'
import { exportToJson, importFromJson, importAuto } from '@/lib/json-export'
import { exportToMarkdown, importFromMarkdown } from '@/lib/markdown'
import type { Bookmark } from '@/lib/types'
import { bookmarkId } from '@/lib/storage'

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/facebook/react'
  return {
    id: overrides.id ?? bookmarkId(url),
    url,
    owner: overrides.owner ?? 'facebook',
    repo: overrides.repo ?? 'react',
    description: overrides.description ?? 'A JavaScript library',
    stars: overrides.stars ?? 100,
    forks: overrides.forks ?? 10,
    language: overrides.language ?? 'JavaScript',
    topics: overrides.topics ?? [],
    summary: overrides.summary ?? 'React 是一个 UI 库',
    category: overrides.category ?? '前端框架',
    tags: overrides.tags ?? ['React', 'UI'],
    createdAt: overrides.createdAt ?? 1700000000000,
    updatedAt: overrides.updatedAt ?? 1700000000000,
  }
}

describe('exportToJson', () => {
  it('EJ-01: 正常导出', () => {
    const json = exportToJson([makeBookmark()])
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(1)
    expect(parsed.bookmarks).toHaveLength(1)
    expect(parsed.bookmarks[0].owner).toBe('facebook')
  })

  it('EJ-02: 空列表导出', () => {
    const json = exportToJson([])
    const parsed = JSON.parse(json)
    expect(parsed.bookmarkCount).toBe(0)
    expect(parsed.bookmarks).toEqual([])
  })

  it('EJ-03: 多个收藏导出', () => {
    const json = exportToJson([makeBookmark(), makeBookmark({ url: 'https://github.com/vuejs/vue', owner: 'vuejs', repo: 'vue' })])
    const parsed = JSON.parse(json)
    expect(parsed.bookmarkCount).toBe(2)
  })

  it('EJ-04: 导出可被 JSON.parse', () => {
    const json = exportToJson([makeBookmark()])
    expect(() => JSON.parse(json)).not.toThrow()
  })
})

describe('importFromJson', () => {
  it('IJ-01: 完整格式导入', () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: '2024-01-01T00:00:00Z',
      bookmarkCount: 1,
      bookmarks: [makeBookmark()],
    })
    const result = importFromJson(json)
    expect(result).toHaveLength(1)
    expect(result[0].owner).toBe('facebook')
  })

  it('IJ-02: 纯数组导入', () => {
    const json = JSON.stringify([makeBookmark()])
    const result = importFromJson(json)
    expect(result).toHaveLength(1)
  })

  it('IJ-03: 单对象导入', () => {
    const json = JSON.stringify(makeBookmark())
    const result = importFromJson(json)
    expect(result).toHaveLength(1)
  })

  it('IJ-04: 空数组导入', () => {
    const result = importFromJson('[]')
    expect(result).toEqual([])
  })

  it('IJ-05: 非法 JSON 抛错', () => {
    expect(() => importFromJson('not json')).toThrow()
  })

  it('IJ-06: 缺失字段补全', () => {
    const json = JSON.stringify({ url: 'https://github.com/a/b' })
    const result = importFromJson(json)
    expect(result).toHaveLength(1)
    expect(result[0].stars).toBe(0)
    expect(result[0].tags).toEqual([])
  })
})

describe('importAuto', () => {
  it('IA-01: JSON 对象自动检测', () => {
    const json = JSON.stringify({ bookmarks: [makeBookmark()] })
    const result = importAuto(json)
    expect(result).toHaveLength(1)
  })

  it('IA-02: JSON 数组自动检测', () => {
    const json = JSON.stringify([makeBookmark()])
    const result = importAuto(json)
    expect(result).toHaveLength(1)
  })

  it('IA-03: Markdown 自动检测', () => {
    const md = exportToMarkdown([makeBookmark()])
    const result = importAuto(md)
    expect(result).toHaveLength(1)
    expect(result[0].owner).toBe('facebook')
  })
})

describe('Markdown 互逆性', () => {
  it('IM-01: 导出后导入得到相同数据', () => {
    const original = [makeBookmark(), makeBookmark({
      url: 'https://github.com/vuejs/vue',
      owner: 'vuejs',
      repo: 'vue',
      category: '前端框架',
      tags: ['Vue', 'UI'],
    })]
    const md = exportToMarkdown(original)
    const restored = importFromMarkdown(md)
    expect(restored).toHaveLength(2)
    expect(restored[0].owner).toBe('facebook')
    expect(restored[0].repo).toBe('react')
    expect(restored[1].owner).toBe('vuejs')
    expect(restored[1].repo).toBe('vue')
  })
})
