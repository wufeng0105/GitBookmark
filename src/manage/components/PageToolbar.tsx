import { useEffect, useRef } from 'react'
import { Search, Plus, Globe, ArrowUpDown, ChevronDown } from 'lucide-react'
import type { SortBy } from '@/hooks/useBookmarks'

interface PageToolbarProps {
  search: string
  onSearch: (v: string) => void
  languages: string[]
  activeLanguage: string | null
  onLanguage: (v: string | null) => void
  sortBy: SortBy
  onSort: (v: SortBy) => void
  onAdd: () => void
}

/** 两个下拉共用：固定等宽 + 左侧功能图标 + 右侧箭头，宽度不随选中值变化 */
const SELECT_CLASS =
  'h-8 w-40 appearance-none rounded-md border border-border bg-background pl-7 pr-7 text-xs text-foreground/80 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring'

const SELECT_CHEVRON =
  'pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground'

/** 主区顶栏：搜索（⌘/Ctrl+K 聚焦）、语言筛选、排序与添加收藏入口 */
export default function PageToolbar({
  search,
  onSearch,
  languages,
  activeLanguage,
  onLanguage,
  sortBy,
  onSort,
  onAdd,
}: PageToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K 聚焦搜索框
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex items-center gap-3">
      <div className="relative max-w-lg flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜索仓库名、描述、摘要、标签、分类…"
          aria-label="搜索收藏"
          className="h-8 w-full rounded-md border border-border bg-muted/40 pl-8 pr-12 text-xs text-foreground transition-colors placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      {/* 控件组右对齐：搜索被截断后仍与下方卡片网格右缘对齐 */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {languages.length > 0 && (
          <div className="relative">
            <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <select
              aria-label="按语言筛选"
              value={activeLanguage ?? 'all'}
              onChange={(e) => onLanguage(e.target.value === 'all' ? null : e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">全部语言</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown className={SELECT_CHEVRON} />
          </div>
        )}

        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="排序方式"
            value={sortBy}
            onChange={(e) => onSort(e.target.value as SortBy)}
            className={SELECT_CLASS}
          >
            <option value="date">按时间</option>
            <option value="stars">按星数</option>
            <option value="name">按名称</option>
          </select>
          <ChevronDown className={SELECT_CHEVRON} />
        </div>

        <button
          onClick={onAdd}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          添加收藏
        </button>
      </div>
    </div>
  )
}
