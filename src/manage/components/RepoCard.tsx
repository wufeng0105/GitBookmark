import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Star,
  GitFork,
  Pencil,
  Trash2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import type { Bookmark } from '@/lib/types'
import { splitCategory } from '@/lib/category'
import { formatStars } from '@/lib/format'
import { languageColor } from '@/lib/languageColors'
import { cn } from '@/lib/utils'

interface RepoCardProps {
  bookmark: Bookmark
  selected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (bookmark: Bookmark) => void
  onDelete: (id: string) => void
  onReanalyze: (ids: string[]) => void
}

/** 收藏卡片：悬停或选中时显示批量选择框与操作按钮 */
export default function RepoCard({
  bookmark: b,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onReanalyze,
}: RepoCardProps) {
  // 悬停/选中才可见的控件：opacity 隐藏期间必须同时禁用指针事件，避免误触
  const revealable = (hidden: boolean) =>
    hidden
      ? 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
      : 'opacity-100'

  const { sub } = splitCategory(b.category)

  return (
    <div
      className={cn(
        'group flex h-[164px] flex-col rounded-lg border bg-card p-3.5 shadow-sm transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-md',
        selected && 'border-2 border-primary bg-primary/5',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('shrink-0 transition-opacity', revealable(!selected))}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(b.id)}
            aria-label={`选择 ${b.owner}/${b.repo}`}
          />
        </span>

        {/* 语言色点：有色值才渲染，未收录语言不占位；title 供悬停查看语言名 */}
        {b.language && languageColor(b.language) && (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: languageColor(b.language) }}
            title={b.language}
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold tracking-tight">
          {b.owner}/{b.repo}
        </span>

        <span
          className={cn(
            'flex shrink-0 items-center transition-opacity',
            revealable(!selected),
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="编辑"
            aria-label={`编辑 ${b.owner}/${b.repo}`}
            onClick={() => onEdit(b)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="重新分析"
            aria-label={`重新分析 ${b.owner}/${b.repo}`}
            onClick={() => onReanalyze([b.id])}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="删除"
            aria-label={`删除 ${b.owner}/${b.repo}`}
            onClick={() => onDelete(b.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>

        <a
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`在 GitHub 打开 ${b.owner}/${b.repo}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* 摘要占三行：AI 标签行已移除，省出的空间给摘要，卡片高度不变 */}
      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {b.summary || b.description}
      </p>

      <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-1.5 text-[11px] tabular-nums text-muted-foreground">
        {b.stars > 0 && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            {formatStars(b.stars)}
          </span>
        )}
        {b.forks > 0 && (
          <span className="flex items-center gap-1">
            <GitFork className="h-3 w-3" />
            {formatStars(b.forks)}
          </span>
        )}
        {b.category && (
          <Badge variant="outline" className="ml-auto text-[10px] font-sans">
            {sub}
          </Badge>
        )}
      </div>
    </div>
  )
}
