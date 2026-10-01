import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { splitCategory, buildCategoryTree } from '@/lib/category'
import { useBookmarkFilter } from '@/hooks/useBookmarks'
import type { Bookmark } from '@/lib/types'

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/a/b'
  return {
    id: url.toLowerCase(),
    url,
    owner: 'a',
    repo: 'b',
    description: '描述',
    stars: 10,
    forks: 1,
    language: 'TypeScript',
    topics: [],
    summary: '摘要',
    category: null,
    tags: [],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  }
}

describe('splitCategory', () => {
  it('SC-01: 拆分「大类 / 小类」', () => {
    expect(splitCategory('AI 智能体与模型 / 技能包')).toEqual({
      top: 'AI 智能体与模型',
      sub: '技能包',
    })
  })

  it('SC-02: 无小类的旧分类整串回落为大类与小类', () => {
    expect(splitCategory('旧分类')).toEqual({ top: '旧分类', sub: '旧分类' })
  })

  it('SC-03: null 归入未分类', () => {
    expect(splitCategory(null)).toEqual({ top: '未分类', sub: '未分类' })
  })
})

describe('buildCategoryTree', () => {
  it('CT-01: 按大类聚合小类，大类与小类均按收藏数降序', () => {
    const tree = buildCategoryTree([
      makeBookmark({ url: 'https://github.com/a/1', category: '内容与媒体 / 创作技能' }),
      makeBookmark({ url: 'https://github.com/a/2', category: '内容与媒体 / 内容工具' }),
      makeBookmark({ url: 'https://github.com/a/3', category: '内容与媒体 / 创作技能' }),
      makeBookmark({ url: 'https://github.com/a/4', category: 'AI 智能体与模型 / 技能包' }),
    ])

    expect(tree.map((t) => t.top)).toEqual(['内容与媒体', 'AI 智能体与模型'])
    expect(tree[0].count).toBe(3)
    expect(tree[0].subs).toEqual([
      { sub: '创作技能', count: 2 },
      { sub: '内容工具', count: 1 },
    ])
    expect(tree[1].subs).toEqual([{ sub: '技能包', count: 1 }])
  })
})

describe('useBookmarkFilter', () => {
  const bookmarks = [
    makeBookmark({ url: 'https://github.com/a/1', category: 'AI 智能体与模型 / 技能包', language: 'Python' }),
    makeBookmark({ url: 'https://github.com/a/2', category: 'AI 智能体与模型 / GUI 智能体' }),
    makeBookmark({ url: 'https://github.com/a/3', category: '内容与媒体 / 创作技能' }),
    makeBookmark({ url: 'https://github.com/a/4', category: null }),
  ]

  it('UF-01: 无筛选时按大类分组，组间按条目数降序', () => {
    const { result } = renderHook(() => useBookmarkFilter(bookmarks))

    expect(result.current.groups.map((g) => g.top)).toEqual([
      'AI 智能体与模型',
      '内容与媒体',
      '未分类',
    ])
    expect(result.current.groups[0].items).toHaveLength(2)
    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('UF-05: 分类树计数为 facet 口径：随搜索/语言联动，不随分类筛选联动', () => {
    const { result } = renderHook(() => useBookmarkFilter(bookmarks))

    // 全量：AI 智能体与模型 2 条，其中 1 条 Python、1 条 TypeScript（makeBookmark 默认 TypeScript）
    expect(result.current.categoryTree.map((t) => [t.top, t.count])).toEqual([
      ['AI 智能体与模型', 2],
      ['内容与媒体', 1],
      ['未分类', 1],
    ])

    // 选语言后，facet 计数缩小
    act(() => result.current.setActiveLanguage('Python'))
    const ai = result.current.categoryTree.find((t) => t.top === 'AI 智能体与模型')
    expect(ai?.count).toBe(1)
    expect(result.current.uncategorizedCount).toBe(0)

    // 再选小类，facet 计数不应继续缩小（仍按语言口径）
    act(() => result.current.setActiveSub('技能包'))
    const ai2 = result.current.categoryTree.find((t) => t.top === 'AI 智能体与模型')
    expect(ai2?.count).toBe(1)
  })

  it('UF-02: 选中大类后仅保留该大类并退化为单一列表', () => {
    const { result } = renderHook(() => useBookmarkFilter(bookmarks))

    act(() => result.current.setActiveTop('内容与媒体'))

    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].top).toBeNull()
    expect(result.current.hasActiveFilters).toBe(true)
  })

  it('UF-03: 小类筛选命中同小类的条目', () => {
    const { result } = renderHook(() => useBookmarkFilter(bookmarks))

    act(() => result.current.setActiveTop('AI 智能体与模型'))
    act(() => result.current.setActiveSub('GUI 智能体'))

    expect(result.current.filtered.map((b) => b.id)).toEqual([
      'https://github.com/a/2',
    ])
  })

  it('UF-04: clearFilters 清空全部筛选条件', () => {
    const { result } = renderHook(() => useBookmarkFilter(bookmarks))

    act(() => result.current.setActiveTop('内容与媒体'))
    act(() => result.current.setSearch('关键字'))
    act(() => result.current.clearFilters())

    expect(result.current.filtered).toHaveLength(4)
    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('UF-06: 搜索输入防抖：输入值即时更新，过滤延迟生效', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useBookmarkFilter(bookmarks))

      act(() => result.current.setSearch('技能包'))
      // 输入即时反映，但过滤尚未重算
      expect(result.current.search).toBe('技能包')
      expect(result.current.filtered).toHaveLength(4)

      act(() => vi.advanceTimersByTime(200))
      // 防抖后命中：分类名进入搜索域，只有 1 条「技能包」
      expect(result.current.filtered).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('UF-07: 按名称排序时同 owner 的仓库按 repo 名排列', () => {
    const { result } = renderHook(() =>
      useBookmarkFilter([
        makeBookmark({ url: 'https://github.com/fb/zuck', owner: 'fb', repo: 'zuck' }),
        makeBookmark({ url: 'https://github.com/fb/react', owner: 'fb', repo: 'react' }),
      ]),
    )

    act(() => result.current.setSortBy('name'))
    expect(result.current.filtered.map((b) => b.repo)).toEqual(['react', 'zuck'])
  })
})
