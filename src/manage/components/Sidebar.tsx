import { BookMarked, type LucideIcon } from 'lucide-react'
import type { CategoryNode } from '@/lib/category'
import { cn } from '@/lib/utils'
import CategoryTree from './CategoryTree'

export interface SidebarNavItem {
  id: string
  label: string
  Icon: LucideIcon
}

export interface SidebarProps {
  /** 导航项由 App 统一下发 */
  items: SidebarNavItem[]
  activePage: string
  onNavigate: (id: string) => void
  totalCount: number
  tree: CategoryNode[]
  activeTop: string | null
  activeSub: string | null
  hasActiveFilters: boolean
  onSelectTop: (top: string | null) => void
  onSelectSub: (sub: string | null) => void
  onClearFilters: () => void
}

/** 管理页左侧栏：品牌、页面导航与分类树 */
export default function Sidebar({
  items,
  activePage,
  onNavigate,
  totalCount,
  tree,
  activeTop,
  activeSub,
  hasActiveFilters,
  onSelectTop,
  onSelectSub,
  onClearFilters,
}: SidebarProps) {
  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-muted/40">
      {/* 品牌行：版本号移至设置页；同步状态在设置与数据页查看，此处不再重复 */}
      <div className="border-b border-border/70 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookMarked className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">GitBookmark</span>
        </div>
      </div>

      {/* 导航 + 分类树，独立滚动 */}
      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-2 py-2">
        <nav className="space-y-0.5" aria-label="主导航">
          {items.map(({ id, label, Icon }) => {
            const isActive = id === activePage
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 transition-colors',
                  isActive
                    ? 'border-l-2 border-primary bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
                {id === 'bookmarks' && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary">
                    {totalCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <CategoryTree
          nodes={tree}
          activeTop={activeTop}
          activeSub={activeSub}
          hasActiveFilters={hasActiveFilters}
          onSelectTop={onSelectTop}
          onSelectSub={onSelectSub}
          onClearFilters={onClearFilters}
        />
      </div>
    </aside>
  )
}
