import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Bookmark, Settings, type LucideIcon } from 'lucide-react'
import Sidebar from '@/manage/components/Sidebar'
import type { CategoryNode } from '@/lib/category'

const TREE: CategoryNode[] = [
  { top: 'AI 智能体与模型', count: 2, subs: [{ sub: '技能包', count: 2 }] },
]

const ITEMS: Array<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'bookmarks', label: '收藏', Icon: Bookmark },
  { id: 'config', label: '设置与数据', Icon: Settings },
]

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const handlers = {
    onNavigate: vi.fn(),
    onSelectTop: vi.fn(),
    onSelectSub: vi.fn(),
    onClearFilters: vi.fn(),
  }
  const utils = render(
    <Sidebar
      items={ITEMS}
      activePage="bookmarks"
      totalCount={63}
      tree={TREE}
      activeTop={null}
      activeSub={null}
      hasActiveFilters={false}
      {...handlers}
      {...overrides}
    />,
  )
  return { handlers, ...utils }
}

describe('Sidebar', () => {
  it('SB-01: 品牌行只保留名称；无版本号、无同步状态、计数只在导航徽标', () => {
    renderSidebar()

    expect(screen.getByText('GitBookmark')).toBeInTheDocument()
    // 计数唯一出现处是「收藏」导航徽标
    expect(screen.getByText('63')).toBeInTheDocument()
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument()
    expect(screen.queryByText('已配置 Gist 备份')).not.toBeInTheDocument()
    expect(screen.queryByText('未配置云端备份')).not.toBeInTheDocument()
    expect(screen.queryByText('筛选中')).not.toBeInTheDocument()
  })

  it('SB-02: 导航项点击触发 onNavigate', () => {
    const { handlers } = renderSidebar()

    screen.getByRole('button', { name: /设置与数据/ }).click()

    expect(handlers.onNavigate).toHaveBeenCalledWith('config')
  })
})
