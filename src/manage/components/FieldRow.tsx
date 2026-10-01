import { Label } from '@/components/ui/label'

export interface FieldRowProps {
  /** 字段标签 */
  label: string
  /** 标签关联的控件 id */
  htmlFor?: string
  /** 补充说明：stacked 模式在标签右侧，双列模式在控件列下方 */
  hint?: string
  /** 标签置于控件上方、控件全宽（文本域等长内容字段） */
  stacked?: boolean
  children: React.ReactNode
}

/**
 * 设置页统一字段行：参照 VS Code/Chrome 设置的行式排布，标签与控件对齐基准一致。
 * hint 统一与控件左对齐（双列模式落在控件列下方），窄标签列只放标签，避免长提示折行；
 * 控件列内的长说明与外部链接也应放进 children 跟随控件，保持整页「左标签脊 + 右内容列」网格。
 */
export default function FieldRow({ label, htmlFor, hint, stacked, children }: FieldRowProps) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor={htmlFor} className="text-xs font-normal text-foreground/80">
            {label}
          </Label>
          {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="flex items-start gap-4">
      <div className="w-32 shrink-0 pt-1.5">
        <Label htmlFor={htmlFor} className="text-xs font-normal text-foreground/80">
          {label}
        </Label>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {children}
        {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
