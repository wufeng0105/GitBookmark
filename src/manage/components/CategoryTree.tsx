import { useEffect, useState } from 'react'
import {
  Brain,
  Terminal,
  Clapperboard,
  ScanSearch,
  BarChart3,
  NotebookPen,
  Monitor,
  Server,
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  type LucideIcon,
} from 'lucide-react'
import type { CategoryNode } from '@/lib/category'
import { cn } from '@/lib/utils'

/** 大类 → 侧栏图标，与分类体系的八个大类一一对应 */
const TOP_ICONS: Record<string, LucideIcon> = {
  'AI 智能体与模型': Brain,
  '编程与开发工具': Terminal,
  '内容与媒体': Clapperboard,
  '数据采集与解析': ScanSearch,
  '可视化与数据平台': BarChart3,
  '编辑器与笔记': NotebookPen,
  '桌面与系统工具': Monitor,
  '服务与基础设施': Server,
}

interface CategoryTreeProps {
  nodes: CategoryNode[]
  activeTop: string | null
  activeSub: string | null
  hasActiveFilters: boolean
  onSelectTop: (top: string | null) => void
  onSelectSub: (sub: string | null) => void
  onClearFilters: () => void
}

/** 侧栏分类树：大类行可点选筛选，chevron 按钮负责展开；小类行缩进显示计数 */
export default function CategoryTree({
  nodes,
  activeTop,
  activeSub,
  hasActiveFilters,
  onSelectTop,
  onSelectSub,
  onClearFilters,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 选中某个大类时自动展开，保证小类可见（UI 联动；派生化重构属专门迭代）
  useEffect(() => {
    if (activeTop) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded((prev) => (prev.has(activeTop) ? prev : new Set(prev).add(activeTop)))
    }
  }, [activeTop])

  const toggleExpand = (top: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(top)) {
        next.delete(top)
      } else {
        next.add(top)
      }
      return next
    })
  }

  const allExpanded = nodes.length > 0 && nodes.every((n) => expanded.has(n.top))

  return (
    <div>
      {/* 区块标题：中文标签不做 uppercase/tracking；有筛选时优先给「清除筛选」入口 */}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground/80">分类</span>
          <span className="text-[10px] text-muted-foreground">
            {nodes.length} 大类 · {nodes.reduce((n, node) => n + node.subs.length, 0)} 小类
          </span>
        </div>
        {hasActiveFilters ? (
          <button
            onClick={onClearFilters}
            className="text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
          >
            清除筛选
          </button>
        ) : (
          nodes.length > 0 && (
            <button
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(nodes.map((n) => n.top)))}
              aria-label={allExpanded ? '全部折叠' : '全部展开'}
              title={allExpanded ? '全部折叠' : '全部展开'}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      {/* 树面板：淡底容器与上方导航区形成「导航 / 数据浏览」的层级区分 */}
      <div className="space-y-0.5 rounded-md bg-muted/40 p-1.5 text-xs">
        {nodes.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">暂无分类</p>
        )}
        {nodes.map((node) => {
          const Icon = TOP_ICONS[node.top] ?? Server
          const isOpen = expanded.has(node.top)
          // 选中某小类时，其大类行仍高亮（父级激活态）
          const isActive = activeTop === node.top
          return (
            <div key={node.top}>
              <div
                className={cn(
                  'flex items-center rounded-md transition-colors',
                  isActive ? 'bg-primary/10' : 'hover:bg-accent/60',
                )}
              >
                {/* chevron：仅展开/折叠，不改变筛选 */}
                <button
                  onClick={() => toggleExpand(node.top)}
                  aria-label={`${isOpen ? '折叠' : '展开'}${node.top}`}
                  aria-expanded={isOpen}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {/* 行主体：点击 = 选中该大类并展开；再点一次 = 取消筛选并折叠 */}
                <button
                  onClick={() => {
                    if (activeTop === node.top && !activeSub) {
                      onSelectTop(null)
                      onSelectSub(null)
                      toggleExpand(node.top)
                    } else {
                      onSelectTop(node.top)
                      onSelectSub(null)
                      setExpanded((prev) => new Set(prev).add(node.top))
                    }
                  }}
                  aria-pressed={activeTop === node.top && !activeSub}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-2 text-left font-medium',
                    isActive ? 'text-primary' : 'text-foreground/80',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{node.top}</span>
                  <span
                    className={cn(
                      'ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground',
                      node.count === 0 && 'opacity-40',
                    )}
                  >
                    {node.count}
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {node.subs.map(({ sub, count }) => {
                    const subActive = activeTop === node.top && activeSub === sub
                    return (
                      <button
                        key={sub}
                        onClick={() => {
                          // 选小类同时锁定所属大类，与筛选片的大类/小类双 chip 一致
                          onSelectTop(node.top)
                          onSelectSub(subActive ? null : sub)
                        }}
                        aria-pressed={subActive}
                        className={cn(
                          'flex w-full items-center justify-between rounded px-2 py-1 text-left transition-colors',
                          subActive
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              'size-1.5 shrink-0 rounded-full',
                              subActive ? 'bg-primary' : 'bg-muted-foreground/40',
                            )}
                          />
                          <span className="truncate">{sub}</span>
                        </span>
                        <span
                          className={cn(
                            'ml-1 shrink-0 text-[10px] tabular-nums',
                            count === 0 && 'opacity-40',
                          )}
                        >
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
