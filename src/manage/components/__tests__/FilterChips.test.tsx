import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterChips from '@/manage/components/FilterChips'

function renderChips(overrides: Partial<Parameters<typeof FilterChips>[0]> = {}) {
  const handlers = {
    onRemoveTop: vi.fn(),
    onRemoveSub: vi.fn(),
    onRemoveLanguage: vi.fn(),
  }
  const utils = render(
    <FilterChips
      activeTop={null}
      activeSub={null}
      activeLanguage={null}
      matchCount={0}
      hasActiveFilters={false}
      {...handlers}
      {...overrides}
    />,
  )
  return { handlers, ...utils }
}

describe('FilterChips', () => {
  it('FC-01: 无筛选时不渲染', () => {
    const { container } = renderChips()

    expect(container.firstChild).toBeNull()
  })

  it('FC-02: 渲染生效的筛选 chip 与匹配数', () => {
    renderChips({
      activeTop: 'AI 智能体与模型',
      activeSub: '技能包',
      activeLanguage: 'Python',
      matchCount: 5,
      hasActiveFilters: true,
    })

    expect(screen.getByText('分类：AI 智能体与模型')).toBeInTheDocument()
    expect(screen.getByText('小类：技能包')).toBeInTheDocument()
    expect(screen.getByText('语言：Python')).toBeInTheDocument()
    expect(screen.getByText('匹配到 5 个仓库')).toBeInTheDocument()
  })

  it('FC-03: 逐项移除按钮触发对应回调', () => {
    const { handlers } = renderChips({
      activeTop: 'AI 智能体与模型',
      activeSub: '技能包',
      activeLanguage: 'Python',
      matchCount: 5,
      hasActiveFilters: true,
    })

    fireEvent.click(screen.getByRole('button', { name: '移除筛选：分类：AI 智能体与模型' }))
    expect(handlers.onRemoveTop).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '移除筛选：小类：技能包' }))
    expect(handlers.onRemoveSub).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '移除筛选：语言：Python' }))
    expect(handlers.onRemoveLanguage).toHaveBeenCalled()
  })
})
