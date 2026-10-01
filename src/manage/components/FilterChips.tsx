import { X } from 'lucide-react'

export interface FilterChipsProps {
  activeTop: string | null
  activeSub: string | null
  activeLanguage: string | null
  matchCount: number
  hasActiveFilters: boolean
  onRemoveTop: () => void
  onRemoveSub: () => void
  onRemoveLanguage: () => void
}

function RemovableChip({
  label,
  tone,
  onRemove,
}: {
  label: string
  tone: 'neutral' | 'primary'
  onRemove: () => void
}) {
  return (
    <span
      className={
        tone === 'primary'
          ? 'inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary'
          : 'inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-foreground/70'
      }
    >
      {label}
      <button
        onClick={onRemove}
        title="移除"
        aria-label={`移除筛选：${label}`}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

/** 当前生效的筛选条件：可逐项移除，并显示匹配数量 */
export default function FilterChips({
  activeTop,
  activeSub,
  activeLanguage,
  matchCount,
  hasActiveFilters,
  onRemoveTop,
  onRemoveSub,
  onRemoveLanguage,
}: FilterChipsProps) {
  if (!hasActiveFilters) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeTop && <RemovableChip label={`分类：${activeTop}`} tone="neutral" onRemove={onRemoveTop} />}
      {activeSub && <RemovableChip label={`小类：${activeSub}`} tone="primary" onRemove={onRemoveSub} />}
      {activeLanguage && (
        <RemovableChip label={`语言：${activeLanguage}`} tone="neutral" onRemove={onRemoveLanguage} />
      )}
      <span className="ml-1 text-[11px] text-muted-foreground">匹配到 {matchCount} 个仓库</span>
    </div>
  )
}
