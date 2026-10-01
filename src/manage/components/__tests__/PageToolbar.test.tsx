import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PageToolbar from '@/manage/components/PageToolbar'

function renderToolbar(overrides: Partial<Parameters<typeof PageToolbar>[0]> = {}) {
  const handlers = {
    onSearch: vi.fn(),
    onLanguage: vi.fn(),
    onSort: vi.fn(),
    onAdd: vi.fn(),
  }
  const utils = render(
    <PageToolbar
      search=""
      languages={['Python', 'Rust']}
      activeLanguage={null}
      sortBy="date"
      {...handlers}
      {...overrides}
    />,
  )
  return { handlers, ...utils }
}

describe('PageToolbar', () => {
  it('PT-01: 搜索输入触发 onSearch', () => {
    const { handlers } = renderToolbar()

    fireEvent.change(screen.getByLabelText('搜索收藏'), { target: { value: 'rust' } })

    expect(handlers.onSearch).toHaveBeenCalledWith('rust')
  })

  it('PT-02: ⌘K / Ctrl+K 聚焦搜索框', () => {
    renderToolbar()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(document.activeElement).toBe(screen.getByLabelText('搜索收藏'))

    screen.getByLabelText('搜索收藏').blur()
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    expect(document.activeElement).toBe(screen.getByLabelText('搜索收藏'))
  })

  it('PT-03: 语言选择触发 onLanguage，「全部」传 null', () => {
    const { handlers } = renderToolbar()

    fireEvent.change(screen.getByLabelText('按语言筛选'), { target: { value: 'Python' } })
    expect(handlers.onLanguage).toHaveBeenCalledWith('Python')

    fireEvent.change(screen.getByLabelText('按语言筛选'), { target: { value: 'all' } })
    expect(handlers.onLanguage).toHaveBeenCalledWith(null)
  })

  it('PT-04: 排序选择触发 onSort', () => {
    const { handlers } = renderToolbar()

    fireEvent.change(screen.getByLabelText('排序方式'), { target: { value: 'stars' } })

    expect(handlers.onSort).toHaveBeenCalledWith('stars')
  })

  it('PT-05: 添加收藏按钮触发 onAdd', () => {
    const { handlers } = renderToolbar()

    fireEvent.click(screen.getByRole('button', { name: /添加收藏/ }))
    expect(handlers.onAdd).toHaveBeenCalled()
  })

  it('PT-06: 无语言数据时隐藏语言下拉', () => {
    renderToolbar({ languages: [] })

    expect(screen.queryByLabelText('按语言筛选')).not.toBeInTheDocument()
  })
})
