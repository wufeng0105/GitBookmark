import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CategoryTree from '@/manage/components/CategoryTree'
import type { CategoryNode } from '@/lib/category'

const NODES: CategoryNode[] = [
  {
    top: 'AI 智能体与模型',
    count: 7,
    subs: [
      { sub: '技能包', count: 5 },
      { sub: 'Agent 框架', count: 2 },
    ],
  },
  {
    top: '内容与媒体',
    count: 3,
    subs: [{ sub: '创作技能', count: 3 }],
  },
]

function renderTree(overrides: Partial<Parameters<typeof CategoryTree>[0]> = {}) {
  const handlers = {
    onSelectTop: vi.fn(),
    onSelectSub: vi.fn(),
    onClearFilters: vi.fn(),
  }
  const utils = render(
    <CategoryTree
      nodes={NODES}
      activeTop={null}
      activeSub={null}
      hasActiveFilters={false}
      {...handlers}
      {...overrides}
    />,
  )
  return { handlers, ...utils }
}

/** 展开某个大类（点击 chevron 按钮）以显示小类行 */
function expand(top: string) {
  fireEvent.click(screen.getByRole('button', { name: `展开${top}` }))
}

describe('CategoryTree', () => {
  it('CT-01: 渲染大类与小类计数', () => {
    renderTree()

    expect(screen.getByText('AI 智能体与模型')).toBeInTheDocument()
    expect(screen.getByText('内容与媒体')).toBeInTheDocument()
    expect(screen.getByText('2 大类 · 3 小类')).toBeInTheDocument()
  })

  it('CT-02: 点击大类行 = 选中该大类并展开（小类可见）', () => {
    const { handlers } = renderTree()

    fireEvent.click(screen.getByText('AI 智能体与模型'))

    expect(handlers.onSelectTop).toHaveBeenCalledWith('AI 智能体与模型')
    // 行点击后小类行出现
    expect(screen.getByText('技能包')).toBeInTheDocument()
  })

  it('CT-02b: 再次点击已选大类行 = 取消筛选并折叠', () => {
    const handlers = {
      onSelectTop: vi.fn(),
      onSelectSub: vi.fn(),
      onClearFilters: vi.fn(),
    }
    const { rerender } = render(
      <CategoryTree
        nodes={NODES}
        activeTop={null}
        activeSub={null}
        hasActiveFilters={false}
        {...handlers}
      />,
    )

    // 第一次点击：选中并展开
    fireEvent.click(screen.getByText('AI 智能体与模型'))
    expect(handlers.onSelectTop).toHaveBeenCalledWith('AI 智能体与模型')

    // 模拟第一次点击后的真实 props（大类已选中），再点一次应取消并折叠
    rerender(
      <CategoryTree
        nodes={NODES}
        activeTop="AI 智能体与模型"
        activeSub={null}
        hasActiveFilters
        {...handlers}
      />,
    )
    handlers.onSelectTop.mockClear()
    handlers.onSelectSub.mockClear()

    fireEvent.click(screen.getByText('AI 智能体与模型'))

    expect(handlers.onSelectTop).toHaveBeenCalledWith(null)
    expect(handlers.onSelectSub).toHaveBeenCalledWith(null)
    // 折叠后小类行消失
    expect(screen.queryByText('技能包')).not.toBeInTheDocument()
  })

  it('CT-02c: chevron 只展开不筛选：点击后小类可见但不触发筛选回调', () => {
    const { handlers } = renderTree()

    fireEvent.click(screen.getByRole('button', { name: '展开AI 智能体与模型' }))

    expect(screen.getByText('技能包')).toBeInTheDocument()
    expect(handlers.onSelectTop).not.toHaveBeenCalled()
    expect(handlers.onSelectSub).not.toHaveBeenCalled()
  })

  it('CT-03: 展开后点击小类，同时选中其所属大类与小类', () => {
    const { handlers } = renderTree()
    expand('AI 智能体与模型')

    fireEvent.click(screen.getByText('技能包'))

    // 关键回归：小类点击必须把小类名（而非大类名）传给 onSelectSub
    expect(handlers.onSelectTop).toHaveBeenCalledWith('AI 智能体与模型')
    expect(handlers.onSelectSub).toHaveBeenCalledWith('技能包')
  })

  it('CT-04: 点击已选小类取消选择', () => {
    // 模拟第一次点击后的真实 props（大类与小类均已选中）
    const handlers = {
      onSelectTop: vi.fn(),
      onSelectSub: vi.fn(),
      onClearFilters: vi.fn(),
    }
    render(
      <CategoryTree
        nodes={NODES}
        activeTop="AI 智能体与模型"
        activeSub="技能包"
        hasActiveFilters
        {...handlers}
      />,
    )

    fireEvent.click(screen.getByText('技能包'))

    expect(handlers.onSelectSub).toHaveBeenCalledWith(null)
  })

  it('CT-05: 有筛选时标题行显示「清除筛选」并触发回调', () => {
    const { handlers } = renderTree({ hasActiveFilters: true })

    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))

    expect(handlers.onClearFilters).toHaveBeenCalled()
    // 有筛选时不显示展开/折叠开关
    expect(screen.queryByRole('button', { name: /全部展开|全部折叠/ })).not.toBeInTheDocument()
  })

  it('CT-06: 无筛选时标题行显示展开/折叠开关', () => {
    renderTree()

    expect(screen.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全部展开' })).toBeInTheDocument()
  })
})
