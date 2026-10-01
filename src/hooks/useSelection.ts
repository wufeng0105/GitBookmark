import { useEffect, useState } from 'react'

/** 参与勾选的最小条目形态 */
export interface SelectableItem {
  id: string
}

/**
 * 批量勾选状态：勾选/清空/全选判定/全选切换。
 *
 * @param items 当前结果集（决定「全选」的范围与 allSelected 判定）
 * @param resetKey 勾选上下文的指纹——筛选条件拼接串；变化即清空勾选，
 *                 避免选中集与新结果脱节（用户勾了 A 组几张卡后切到 B 组，
 *                 那几张仍算选中但不可见的「灵异勾选」）
 */
export function useSelection<T extends SelectableItem>(
  items: T[],
  resetKey: string,
) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 筛选条件变化时清空：排序变化不在 resetKey 内，不影响勾选（等价状态重置；key 重置式重构属专门迭代）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(new Set())
  }, [resetKey])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const clear = () => setSelected(new Set())

  const allSelected = items.length > 0 && items.every((b) => selected.has(b.id))

  // 全选 = items 的全部（含分页未渲染部分）；已全选时再点则取消 items 内的勾选
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (items.length > 0 && items.every((b) => next.has(b.id))) {
        for (const b of items) next.delete(b.id)
      } else {
        for (const b of items) next.add(b.id)
      }
      return next
    })
  }

  return {
    selected,
    selectedCount: selected.size,
    toggle,
    clear,
    allSelected,
    toggleAll,
  }
}
