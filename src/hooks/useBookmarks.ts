import { useState, useMemo, useEffect } from 'react'
import type { Bookmark } from '@/lib/types'
import { splitCategory, buildCategoryTree } from '@/lib/category'

export type SortBy = 'date' | 'stars' | 'name'

/** 搜索匹配域：仓库名、描述、摘要、标签、分类名（大类/小类）与 GitHub topics */
function matchesSearch(b: Bookmark, q: string): boolean {
  const { top, sub } = splitCategory(b.category)
  return (
    b.owner.toLowerCase().includes(q) ||
    b.repo.toLowerCase().includes(q) ||
    b.description.toLowerCase().includes(q) ||
    b.summary.toLowerCase().includes(q) ||
    b.tags.some((t) => t.toLowerCase().includes(q)) ||
    b.topics.some((t) => t.toLowerCase().includes(q)) ||
    top.toLowerCase().includes(q) ||
    sub.toLowerCase().includes(q)
  )
}

/** 搜索输入防抖时长：避免每次击签全量重算 */
const SEARCH_DEBOUNCE_MS = 180

export function useBookmarkFilter(bookmarks: Bookmark[]) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeTop, setActiveTop] = useState<string | null>(null)
  const [activeSub, setActiveSub] = useState<string | null>(null)
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('date')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const allLanguages = useMemo(
    () =>
      Array.from(
        new Set(
          bookmarks
            .map((b) => b.language)
            .filter((l): l is string => l !== null && l !== ''),
        ),
      ).sort(),
    [bookmarks],
  )

  const filtered = useMemo(() => {
    let result = bookmarks

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((b) => matchesSearch(b, q))
    }

    if (activeTop) {
      result = result.filter((b) => splitCategory(b.category).top === activeTop)
    }

    if (activeSub) {
      result = result.filter((b) => splitCategory(b.category).sub === activeSub)
    }

    if (activeLanguage) {
      result = result.filter((b) => b.language === activeLanguage)
    }

    const sorted = [...result]
    if (sortBy === 'stars') {
      sorted.sort((a, b) => b.stars - a.stars)
    } else if (sortBy === 'name') {
      sorted.sort((a, b) =>
        `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`),
      )
    } else {
      sorted.sort((a, b) => b.createdAt - a.createdAt)
    }

    return sorted
  }, [bookmarks, debouncedSearch, activeTop, activeSub, activeLanguage, sortBy])

  /**
   * 侧栏 facet 基数：套用搜索与语言、但不套用分类筛选。
   * 分类树计数由此派生——选中某大类后其他大类的计数仍是「在该搜索/语言下可见的数量」，
   * 而不是全量数量，避免筛选态下计数误导。
   */
  const facetBase = useMemo(() => {
    let result = bookmarks
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((b) => matchesSearch(b, q))
    }
    if (activeLanguage) {
      result = result.filter((b) => b.language === activeLanguage)
    }
    return result
  }, [bookmarks, debouncedSearch, activeLanguage])

  const categoryTree = useMemo(() => buildCategoryTree(facetBase), [facetBase])

  const uncategorizedCount = useMemo(
    () => facetBase.filter((b) => !b.category).length,
    [facetBase],
  )

  // 无任何筛选时按大类分组展示；任一筛选生效则退化为单一列表（搜索用防抖值，与 filtered 同口径）
  const groups = useMemo(() => {
    if (debouncedSearch || activeTop || activeSub || activeLanguage) {
      return [{ top: null as string | null, items: filtered }]
    }
    const groupMap = new Map<string, Bookmark[]>()
    for (const b of filtered) {
      const { top } = splitCategory(b.category)
      if (!groupMap.has(top)) groupMap.set(top, [])
      groupMap.get(top)!.push(b)
    }
    // 组间顺序固定：先按条目数降序，同数按名称，保证导入/新增后位置不漂移
    return Array.from(groupMap.entries())
      .map(([top, items]) => ({ top, items }))
      .sort(
        (a, b) =>
          b.items.length - a.items.length ||
          (a.top ?? '').localeCompare(b.top ?? '', 'zh'),
      )
  }, [filtered, debouncedSearch, activeTop, activeSub, activeLanguage])

  const hasActiveFilters =
    !!search ||
    !!activeTop ||
    !!activeSub ||
    !!activeLanguage

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setActiveTop(null)
    setActiveSub(null)
    setActiveLanguage(null)
  }

  return {
    search,
    setSearch,
    activeTop,
    setActiveTop,
    activeSub,
    setActiveSub,
    activeLanguage,
    setActiveLanguage,
    sortBy,
    setSortBy,
    allLanguages,
    groups,
    filtered,
    categoryTree,
    uncategorizedCount,
    hasActiveFilters,
    clearFilters,
  }
}
