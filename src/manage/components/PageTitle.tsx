import { cn } from '@/lib/utils'

export interface PageTitleProps {
  title: string
  /** 标题下的状态行（收藏数、配置状态等） */
  meta?: React.ReactNode
  /** 右侧操作槽 */
  actions?: React.ReactNode
}

/** 页面标题行：收藏页与设置与数据页共用的小标题 + meta 行 */
export default function PageTitle({ title, meta, actions }: PageTitleProps) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}

export interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

/** 分组小标签：与侧栏「分类」标题同款字阶，用于分隔页面内的模块组 */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div className={cn('mb-2 mt-6 flex items-center gap-2 first:mt-0', className)}>
      <span className="text-xs font-medium text-foreground/80">{children}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
