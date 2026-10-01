import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSelection } from '@/hooks/useSelection'

interface Item {
  id: string
}

const ITEMS: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

function setup(items: Item[] = ITEMS, resetKey = 'k1') {
  return renderHook(({ items, resetKey }) => useSelection(items, resetKey), {
    initialProps: { items, resetKey },
  })
}

describe('useSelection', () => {
  it('US-01: toggle 单选与反选', () => {
    const { result } = setup()

    act(() => result.current.toggle('a'))
    expect(result.current.selectedCount).toBe(1)
    expect(result.current.selected.has('a')).toBe(true)

    act(() => result.current.toggle('a'))
    expect(result.current.selectedCount).toBe(0)
  })

  it('US-02: clear 清空全部勾选', () => {
    const { result } = setup()

    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('b'))
    act(() => result.current.clear())

    expect(result.current.selectedCount).toBe(0)
  })

  it('US-03: allSelected 判定：部分选中与空集均为 false', () => {
    const { result } = setup()

    expect(result.current.allSelected).toBe(false)

    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('b'))
    expect(result.current.allSelected).toBe(false)

    act(() => result.current.toggle('c'))
    expect(result.current.allSelected).toBe(true)
  })

  it('US-04: toggleAll 全选与取消全选（含分页外的全部条目）', () => {
    const { result } = setup()

    act(() => result.current.toggleAll())
    expect(result.current.selectedCount).toBe(3)
    expect(result.current.allSelected).toBe(true)

    // 已全选时再点 → 取消 items 内全部勾选
    act(() => result.current.toggleAll())
    expect(result.current.selectedCount).toBe(0)
  })

  it('US-05: resetKey 变化自动清空；items 变化（同 resetKey）不清空', () => {
    const { result, rerender } = setup()

    act(() => result.current.toggle('a'))

    // 结果集变化但筛选条件没变（如加载更多）→ 勾选保留
    rerender({ items: [...ITEMS, { id: 'd' }], resetKey: 'k1' })
    expect(result.current.selectedCount).toBe(1)

    // 筛选条件变化 → 勾选清空
    rerender({ items: ITEMS, resetKey: 'k2' })
    expect(result.current.selectedCount).toBe(0)
  })

  it('US-06: 空 items 时 allSelected 为 false，toggleAll 不产生勾选', () => {
    const { result } = setup([], 'k1')

    expect(result.current.allSelected).toBe(false)

    act(() => result.current.toggleAll())
    expect(result.current.selectedCount).toBe(0)
  })
})
