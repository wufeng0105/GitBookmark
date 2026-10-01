import type { Bookmark } from '@/lib/types'

/** 分类分隔符：存储形态为「大类 / 小类」，与 CATEGORY_TAXONOMY 的 prompt 约定一致 */
const CATEGORY_SEP = ' / '

/** 把完整分类拆成大类与小类；无小类时（旧数据/未分类）小类回落为整串 */
export function splitCategory(category: string | null): {
  top: string
  sub: string
} {
  if (!category) return { top: '未分类', sub: '未分类' }
  const idx = category.indexOf(CATEGORY_SEP)
  if (idx === -1) return { top: category, sub: category }
  return {
    top: category.slice(0, idx),
    sub: category.slice(idx + CATEGORY_SEP.length),
  }
}

/** 侧栏分类树的一个节点：大类及其小类（含各自收藏数） */
export interface CategoryNode {
  top: string
  count: number
  subs: Array<{ sub: string; count: number }>
}

/** 由收藏列表聚合出侧栏分类树：大类按收藏数降序，小类在大类内按收藏数降序 */
export function buildCategoryTree(bookmarks: Bookmark[]): CategoryNode[] {
  const tops = new Map<string, Map<string, number>>()
  for (const b of bookmarks) {
    const { top, sub } = splitCategory(b.category)
    if (!tops.has(top)) tops.set(top, new Map())
    const subs = tops.get(top)!
    subs.set(sub, (subs.get(sub) ?? 0) + 1)
  }
  return [...tops.entries()]
    .map(([top, subs]) => ({
      top,
      count: [...subs.values()].reduce((a, b) => a + b, 0),
      subs: [...subs.entries()]
        .map(([sub, count]) => ({ sub, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count)
}
