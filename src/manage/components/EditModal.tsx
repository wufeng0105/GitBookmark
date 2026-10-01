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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { sendMessage } from '@/lib/messaging'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { Bookmark } from '@/lib/types'

interface EditModalProps {
  bookmark: Bookmark | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export default function EditModal({
  bookmark,
  open,
  onClose,
  onSaved,
}: EditModalProps) {
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (bookmark && open) {
      // bookmark 属性灌入编辑表单（props→state 同步；渲染期调整状态模式重构属专门迭代）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(bookmark.category ?? '')
      setTags(bookmark.tags.join('、'))
      setSummary(bookmark.summary)
    }
  }, [bookmark, open])

  const handleSave = async () => {
    if (!bookmark) return
    setSaving(true)
    try {
      await sendMessage('UPDATE_BOOKMARK', {
        id: bookmark.id,
        patch: {
          category: category.trim() || null,
          tags: tags
            .split(/[、,\s]+/)
            .map((t) => t.trim())
            .filter(Boolean),
          summary: summary.trim(),
        },
      })
      toast.success('已保存修改')
      onSaved()
      onClose()
    } catch (err) {
      toast.error('保存失败', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            编辑 {bookmark?.owner}/{bookmark?.repo}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-category">分类</Label>
            <Input
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="输入分类名称"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-tags">标签</Label>
            <Input
              id="edit-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="用、或逗号分隔"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-summary">摘要</Label>
            <Textarea
              id="edit-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="编辑 AI 摘要"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
