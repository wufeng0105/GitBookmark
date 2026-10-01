import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BatchToolbar from '@/manage/components/BatchToolbar'

function renderBar(overrides: Partial<Parameters<typeof BatchToolbar>[0]> = {}) {
  const handlers = {
    onToggleSelectAll: vi.fn(),
    onReanalyze: vi.fn(),
    onDelete: vi.fn(),
    onClear: vi.fn(),
  }
  const utils = render(
    <BatchToolbar
      selectedCount={2}
      allSelected={false}
      {...handlers}
      {...overrides}
    />,
  )
  return { handlers, ...utils }
}

describe('BatchToolbar', () => {
  it('BT-01: 无选中时不渲染', () => {
    const { container } = renderBar({ selectedCount: 0 })

    expect(container.firstChild).toBeNull()
  })

  it('BT-02: 渲染选中计数与各项操作，点击触发对应回调', () => {
    const { handlers } = renderBar()

    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /重新分析/ }))
    expect(handlers.onReanalyze).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /删除/ }))
    expect(handlers.onDelete).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /取消/ }))
    expect(handlers.onClear).toHaveBeenCalled()
  })

  it('BT-03: 全选按钮按 allSelected 切换文案并触发回调', () => {
    const { handlers } = renderBar({ allSelected: false })

    fireEvent.click(screen.getByRole('button', { name: /^全选$/ }))
    expect(handlers.onToggleSelectAll).toHaveBeenCalled()
  })

  it('BT-04: allSelected 时文案为「取消全选」', () => {
    renderBar({ allSelected: true })

    expect(screen.getByRole('button', { name: /取消全选/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^全选$/ })).not.toBeInTheDocument()
  })
})
