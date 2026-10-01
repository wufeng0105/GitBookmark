import { RefreshCw, Trash2, X, ListChecks } from 'lucide-react'

interface BatchToolbarProps {
  selectedCount: number
  /** 当前筛选结果是否已全部选中（决定「全选 / 取消全选」文案） */
  allSelected: boolean
  onToggleSelectAll: () => void
  onReanalyze: () => void
  onDelete: () => void
  onClear: () => void
}

/** 批量操作条：悬浮于视口底部居中的浅色胶囊，有选中时才出现 */
export default function BatchToolbar({
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onReanalyze,
  onDelete,
  onClear,
}: BatchToolbarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        aria-live="polite"
        className="flex flex-nowrap items-center gap-3.5 whitespace-nowrap rounded-full border border-border bg-background px-4 py-2 text-xs shadow-lg"
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <span className="size-2 shrink-0 rounded-full bg-primary" />
          已选择 {selectedCount} 项
        </span>
        <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
        <button
          onClick={onToggleSelectAll}
          className="flex items-center gap-1 text-foreground/80 transition-colors hover:text-primary"
        >
          <ListChecks className="h-3.5 w-3.5" />
          {allSelected ? '取消全选' : '全选'}
        </button>
        <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
        <button
          onClick={onReanalyze}
          className="flex items-center gap-1 text-foreground/80 transition-colors hover:text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重新分析
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 text-destructive transition-opacity hover:opacity-80"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </button>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          取消
        </button>
      </div>
    </div>
  )
}
