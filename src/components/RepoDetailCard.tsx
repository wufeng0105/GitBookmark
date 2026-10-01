import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Star, GitFork, ChevronDown, ChevronRight } from 'lucide-react'
import { SUMMARY_COLLAPSE_THRESHOLD } from '@/shared/constants'
import { formatStars } from '@/lib/format'

/** 仓库详情卡片属性 */
export interface RepoDetailCardProps {
  owner: string
  repo: string
  description: string
  stars: number
  forks: number
  language: string | null
  summary: string
  category: string | null
  tags: string[]
}

/** 可折叠的摘要展示组件 */
function SummaryView({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false)
  const shouldCollapse = summary.length > SUMMARY_COLLAPSE_THRESHOLD
  const display = shouldCollapse && !expanded
    ? summary.slice(0, SUMMARY_COLLAPSE_THRESHOLD) + '…'
    : summary

  return (
    <div className="mb-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        AI 摘要
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground whitespace-pre-line">
        {display}
      </p>
      {shouldCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" />
              收起
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" />
              展开全部
            </>
          )}
        </button>
      )}
    </div>
  )
}

/**
 * 仓库详情卡片：标题、描述、Star/Fork/语言、AI 摘要、分类与标签。
 * Popup 的「分析完成」与「已收藏」状态共用。
 */
export default function RepoDetailCard({
  owner,
  repo,
  description,
  stars,
  forks,
  language,
  summary,
  category,
  tags,
}: RepoDetailCardProps) {
  return (
    <div>
      <h1 className="text-base font-semibold text-foreground">
        {owner}/{repo}
      </h1>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        {stars > 0 && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            {formatStars(stars)}
          </span>
        )}
        {forks > 0 && (
          <span className="flex items-center gap-1">
            <GitFork className="h-3 w-3" />
            {formatStars(forks)}
          </span>
        )}
        {language && (
          <Badge variant="secondary" className="text-[10px]">
            {language}
          </Badge>
        )}
      </div>

      <Separator className="my-3" />

      {summary && <SummaryView summary={summary} />}

      {category && (
        <div className="mb-2">
          <Badge variant="default" className="text-[10px]">
            {category}
          </Badge>
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 8).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
