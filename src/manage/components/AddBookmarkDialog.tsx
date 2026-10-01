import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendMessage } from '@/lib/messaging'
import { toast } from 'sonner'
import { Loader2, BookmarkPlus } from 'lucide-react'
import { parseGitHubUrl } from '@/lib/github'
import { bookmarkId } from '@/lib/storage'
import type { Bookmark } from '@/lib/types'

interface AddBookmarkDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Phase = 'idle' | 'analyzing' | 'analyzed' | 'saving'

/** 添加收藏：输入 GitHub 链接 → AI 分析 → 确认后入库 */
export default function AddBookmarkDialog({ open, onClose, onSaved }: AddBookmarkDialogProps) {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ meta: Bookmark } | null>(null)

  // 每次打开重置表单（等价状态重置；key 重置式重构属专门迭代）
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl('')
      setPhase('idle')
      setError('')
      setPreview(null)
    }
  }, [open])

  const busy = phase === 'analyzing' || phase === 'saving'

  const handleAnalyze = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('请输入 GitHub 仓库链接')
      return
    }
    const parsed = parseGitHubUrl(trimmed)
    if (!parsed) {
      setError('无效的 GitHub URL，示例：https://github.com/owner/repo')
      return
    }
    setError('')
    setPhase('analyzing')
    try {
      const result = await sendMessage('ANALYZE_CURRENT', { url: trimmed })
      setPreview({
        meta: {
          id: bookmarkId(result.meta.url),
          url: result.meta.url,
          owner: result.meta.owner,
          repo: result.meta.repo,
          description: result.meta.description,
          stars: result.meta.stars,
          forks: result.meta.forks,
          language: result.meta.language,
          topics: result.meta.topics,
          summary: result.analysis.summary,
          category: result.analysis.category || null,
          tags: result.analysis.suggestedTags ?? [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })
      setPhase('analyzed')
    } catch (err) {
      setError((err as Error).message)
      setPhase('idle')
    }
  }

  const handleSave = async () => {
    if (!preview) return
    setPhase('saving')
    try {
      await sendMessage('SAVE_BOOKMARK', { bookmark: preview.meta })
      toast.success(`已收藏 ${preview.meta.owner}/${preview.meta.repo}`)
      onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setPhase('analyzed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookmarkPlus className="h-4 w-4 text-primary" />
            添加收藏
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="add-url" className="text-xs text-muted-foreground">
              GitHub 仓库链接
            </Label>
            <Input
              id="add-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && phase !== 'analyzed' && handleAnalyze()}
              placeholder="https://github.com/owner/repo"
              disabled={busy || phase === 'analyzed'}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {phase === 'analyzing' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取 README 并分析…
            </p>
          )}

          {preview && phase !== 'analyzing' && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="font-mono text-xs font-semibold">
                {preview.meta.owner}/{preview.meta.repo}
              </p>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {preview.meta.summary || preview.meta.description || '（无摘要）'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                {preview.meta.category && (
                  <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-primary">
                    {preview.meta.category}
                  </span>
                )}
                {preview.meta.language && <span>{preview.meta.language}</span>}
                {preview.meta.tags.slice(0, 4).map((t) => (
                  <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          {phase === 'analyzed' || phase === 'saving' ? (
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {phase === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              收藏
            </Button>
          ) : (
            <Button size="sm" onClick={handleAnalyze} disabled={busy}>
              {phase === 'analyzing' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              分析
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
