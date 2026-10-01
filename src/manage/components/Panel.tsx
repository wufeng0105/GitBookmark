import type { LucideIcon } from 'lucide-react'

export interface PanelProps {
  /** 模块标题左侧图标 */
  icon?: LucideIcon
  title: string
  /** 标题旁的次要说明 */
  description?: string
  /** 底部左侧的辅助操作（如从文件读取、刷新状态） */
  secondary?: React.ReactNode
  /** 底部右侧的主操作（如保存、导入、备份） */
  primary?: React.ReactNode
  children: React.ReactNode
}

/**
 * 设置与数据页的模块容器：发丝边 + 8px 圆角的紧凑信息块，单列纵向排布。
 * 模块头（标题+描述）→ 内容（字段行）→ 模块尾（左辅助、右主操作）。
 * 按钮落位是全页约定：主操作一律右下、辅助一律左下，头部不放按钮。
 */
export default function Panel({
  icon: Icon,
  title,
  description,
  secondary,
  primary,
  children,
}: PanelProps) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <h2 className="text-xs font-semibold tracking-tight">{title}</h2>
        {description && (
          <span className="truncate text-[11px] text-muted-foreground">{description}</span>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-3 p-4">{children}</div>
      {(secondary || primary) && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2.5">
          {secondary && <div className="flex items-center gap-2">{secondary}</div>}
          {primary && <div className="ml-auto flex items-center gap-2">{primary}</div>}
        </footer>
      )}
    </section>
  )
}
