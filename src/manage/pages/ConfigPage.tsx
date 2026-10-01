import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  PlusCircle,
  AlertCircle,
  Link2,
  FileInput,
  FileOutput,
  FileJson,
  FileText,
  Upload,
  Download,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  ExternalLink,
  Key,
  Brain,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { sendMessage } from '@/lib/messaging'
import { extractGitHubUrls } from '@/lib/github'
import { exportToJson } from '@/lib/json-export'
import { exportToMarkdown } from '@/lib/markdown'
import { downloadTextFile } from '@/lib/download'
import Panel from '../components/Panel'
import FieldRow from '../components/FieldRow'
import PageTitle, { SectionLabel } from '../components/PageTitle'
import type { Bookmark, Settings, BackupInfo } from '@/lib/types'
import { PAGE_CONTAINER } from '@/lib/layout'
import { GITHUB_TOKEN_URL, DEEPSEEK_PLATFORM_URL, GIST_ID_PREVIEW_LENGTH } from '@/shared/constants'

interface ConfigPageProps {
  bookmarks: Bookmark[]
  settings: Settings
  version: string
  onSave: (patch: Partial<Settings>) => Promise<void>
  onRefresh: () => Promise<void>
}

/** 模型输入框下方的快捷预设：仅作填充，模型名本身可自由填写 */
const MODEL_PRESETS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'deepseek-chat',
  'deepseek-reasoner',
]

/**
 * 设置与数据页：凭证与收藏数据两类模块的单页聚合。
 * 布局为单列纵向表单（参照成熟设置页的行式排布）：模块头（标题+描述）
 * → 字段行（标签左、控件与说明右）→ 模块尾（左辅助、右主操作）。
 */
export default function ConfigPage({
  bookmarks,
  settings,
  version,
  onSave,
  onRefresh,
}: ConfigPageProps) {
  const [form, setForm] = useState<Settings>(settings)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  // settings 变化时在渲染期同步表单（React 官方推荐模式，见 You Might Not Need an Effect）：
  // 比 useEffect 同步少一轮提交渲染，也不依赖 effect 的执行时序
  const [prevSettings, setPrevSettings] = useState(settings)
  if (prevSettings !== settings) {
    setPrevSettings(settings)
    setForm(settings)
  }

  // 模块级保存：只提交该模块涉及、且有改动的字段
  const saveFields = async (fields: Array<keyof Settings>, key: string) => {
    const patch: Partial<Settings> = {}
    for (const f of fields) {
      if (form[f] !== settings[f]) {
        ;(patch as Record<string, unknown>)[f] = form[f]
      }
    }
    if (Object.keys(patch).length === 0) {
      toast.info('没有需要保存的修改')
      return
    }
    setSavingKey(key)
    try {
      await onSave(patch)
    } finally {
      setSavingKey(null)
    }
  }

  const tokenDirty = form.githubToken !== settings.githubToken
  const aiDirty =
    form.deepseekApiKey !== settings.deepseekApiKey ||
    form.deepseekModel !== settings.deepseekModel

  return (
    <div className={PAGE_CONTAINER + " py-4 pb-16"}>
      <div>
        <PageTitle
          title="设置与数据"
          meta={
            <>
              {bookmarks.length} 个收藏 · DeepSeek{' '}
              {settings.deepseekApiKey ? '已配置' : '未配置'} ·{' '}
              {settings.gistId ? '已配置 Gist 备份' : '未配置云端备份'}
            </>
          }
        />

        <SectionLabel>凭证</SectionLabel>
        <div className="flex flex-col gap-3">
          <TokenPanel
            value={form.githubToken}
            dirty={tokenDirty}
            saving={savingKey === 'token'}
            onChange={(v) => setForm({ ...form, githubToken: v })}
            onSave={() => saveFields(['githubToken'], 'token')}
          />
          <DeepSeekPanel
            form={form}
            dirty={aiDirty}
            saving={savingKey === 'ai'}
            onChange={(patch) => setForm({ ...form, ...patch })}
            onSave={() =>
              saveFields(['deepseekApiKey', 'deepseekModel'], 'ai')
            }
          />
        </div>

        <SectionLabel>收藏数据</SectionLabel>
        <div className="flex flex-col gap-3">
          <AddPanel bookmarks={bookmarks} settings={settings} onRefresh={onRefresh} />
          <ImportPanel bookmarks={bookmarks} onRefresh={onRefresh} />
          <ExportPanel bookmarks={bookmarks} />
          <CloudPanel bookmarks={bookmarks} settings={settings} onRefresh={onRefresh} />
        </div>

        <footer className="mt-10 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">GitBookmark</span>
          <span className="font-mono text-[11px]">v{version}</span>
          <span>智能 GitHub 仓库收藏管理工具，基于 DeepSeek AI 自动生成摘要与分类建议</span>
        </footer>
      </div>
    </div>
  )
}

/* ─── GitHub Token ─────────────────────────────────── */

function TokenPanel({
  value,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  value: string
  dirty: boolean
  saving: boolean
  onChange: (v: string) => void
  onSave: () => void
}) {
  return (
    <Panel
      icon={Key}
      title="GitHub Token"
      description="API 调用与 Gist 云端备份共用"
      primary={
        <Button size="sm" onClick={onSave} disabled={!dirty || saving} className="h-7 text-xs">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          保存
        </Button>
      }
    >
      <FieldRow label="Token" htmlFor="github-token">
        <Input
          id="github-token"
          type="password"
          name="githubToken"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxx"
          className="h-8 text-xs"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          提高 API 速率限制，私有仓库收藏必需
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          需勾选 <code className="rounded bg-muted px-1">repo</code> 和{' '}
          <code className="rounded bg-muted px-1">gist</code> 权限（repo 含公共与私有仓库的读取）；请使用经典
          token，fine-grained token 不支持 Gist 备份
        </p>
        <a
          href={GITHUB_TOKEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          创建 GitHub Token <ExternalLink className="h-3 w-3" />
        </a>
      </FieldRow>
    </Panel>
  )
}

/* ─── DeepSeek AI ─────────────────────────────────── */

function DeepSeekPanel({
  form,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  form: Settings
  dirty: boolean
  saving: boolean
  onChange: (patch: Partial<Settings>) => void
  onSave: () => void
}) {
  return (
    <Panel
      icon={Brain}
      title="DeepSeek AI"
      description="摘要与分类建议的生成模型"
      primary={
        <Button size="sm" onClick={onSave} disabled={!dirty || saving} className="h-7 text-xs">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          保存
        </Button>
      }
    >
      <FieldRow label="API Key" htmlFor="deepseek-key">
        <Input
          id="deepseek-key"
          type="password"
          name="deepseekApiKey"
          autoComplete="off"
          value={form.deepseekApiKey}
          onChange={(e) => onChange({ deepseekApiKey: e.target.value })}
          placeholder="sk-xxxxxxxxxxxx"
          className="h-8 text-xs"
        />
        <a
          href={DEEPSEEK_PLATFORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          获取 DeepSeek API Key <ExternalLink className="h-3 w-3" />
        </a>
      </FieldRow>

      <FieldRow label="模型名称" htmlFor="deepseek-model">
        {/* 自由输入：DeepSeek 模型会更新换代，预设只做快捷填充 */}
        <Input
          id="deepseek-model"
          name="deepseekModel"
          value={form.deepseekModel}
          onChange={(e) => onChange({ deepseekModel: e.target.value })}
          placeholder="deepseek-v4-flash"
          className="h-8 font-mono text-xs"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          可自由填写，预设仅作快捷填充
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MODEL_PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => onChange({ deepseekModel: m })}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                form.deepseekModel === m
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          名称不被 API 接受时，会在分析时收到报错提示
        </p>
      </FieldRow>


    </Panel>
  )
}

/* ─── 批量添加 ─────────────────────────────────── */

function AddPanel({
  bookmarks,
  settings,
  onRefresh,
}: {
  bookmarks: Bookmark[]
  settings: Settings
  onRefresh: () => Promise<void>
}) {
  const [text, setText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState('')

  const detectedUrls = extractGitHubUrls(text)
  const existingIds = new Set(bookmarks.map((b) => b.id))

  const handleAnalyze = async () => {
    if (detectedUrls.length === 0) {
      toast.error('未检测到有效的 GitHub URL')
      return
    }
    if (!settings.deepseekApiKey) {
      toast.error('请先在上方「DeepSeek AI」模块中填写 API Key')
      return
    }

    setAnalyzing(true)
    setProgress(`正在分析 ${detectedUrls.length} 个仓库…`)

    try {
      const result = await sendMessage('BATCH_ANALYZE', {
        urls: detectedUrls,
      })
      const newCount = result.newBookmarks.filter((b) => !existingIds.has(b.id)).length
      const updateCount = result.newBookmarks.length - newCount

      if (result.newBookmarks.length > 0) {
        toast.success(`分析完成：新增 ${newCount} 个，更新 ${updateCount} 个`)
      }
      if (result.failed.length > 0) {
        toast.warning(`${result.failed.length} 个仓库处理失败`, {
          description: result.failed
            .slice(0, 5)
            .map((f) => `${f.url.replace('https://github.com/', '')}：${f.error}`)
            .join('\n'),
        })
      }
      setText('')
      await onRefresh()
    } catch (err) {
      toast.error('批量分析失败', { description: (err as Error).message })
    } finally {
      setAnalyzing(false)
      setProgress('')
    }
  }

  return (
    <Panel
      icon={Link2}
      title="批量添加"
      description="粘贴 GitHub 仓库 URL，AI 自动生成摘要与分类"
      primary={
        <Button
          onClick={handleAnalyze}
          disabled={analyzing || detectedUrls.length === 0}
          className="h-7 text-xs"
        >
          {analyzing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlusCircle className="h-3.5 w-3.5" />
          )}
          {analyzing ? '分析中…' : `开始分析并收藏（${detectedUrls.length} 个）`}
        </Button>
      }
    >
      {!settings.deepseekApiKey && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">
            尚未配置 DeepSeek API Key，请先在上方「DeepSeek AI」模块中填写
          </p>
        </div>
      )}

      <FieldRow
        label="粘贴 URL"
        htmlFor="bulk-urls"
        stacked
        hint="每行一个，自动识别"
      >
        <Textarea
          id="bulk-urls"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={
            'https://github.com/facebook/react\nhttps://github.com/vuejs/vue\nhttps://github.com/angular/angular'
          }
          disabled={analyzing}
          className="text-xs"
        />
      </FieldRow>

      {detectedUrls.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground">检测到 {detectedUrls.length} 个有效 URL：</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {detectedUrls.slice(0, 12).map((url) => {
              const id = url.replace(/\/$/, '').toLowerCase()
              const exists = existingIds.has(id)
              return (
                <Badge key={url} variant={exists ? 'secondary' : 'outline'} className="text-[10px]">
                  {exists ? '已收藏' : '新'}{' '}
                  {url.replace('https://github.com/', '')}
                </Badge>
              )
            })}
            {detectedUrls.length > 12 && (
              <Badge variant="outline" className="text-[10px]">
                +{detectedUrls.length - 12}
              </Badge>
            )}
          </div>
        </div>
      )}

      {analyzing && (
        <div aria-live="polite" className="flex items-center gap-2 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progress}
        </div>
      )}
    </Panel>
  )
}

/* ─── 导入收藏 ─────────────────────────────────── */

function ImportPanel({
  bookmarks,
  onRefresh,
}: {
  bookmarks: Bookmark[]
  onRefresh: () => Promise<void>
}) {
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = async (mode: 'merge' | 'replace') => {
    if (!importText.trim()) {
      toast.error('请粘贴导入内容')
      return
    }
    setImporting(true)
    try {
      if (mode === 'replace') {
        // 全量替换不可逆：替换前自动下载当前收藏快照
        downloadTextFile(
          `gitbookmark-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
          exportToJson(bookmarks),
        )
        toast.info('已下载替换前快照')
      }
      const result = await sendMessage('IMPORT_JSON', {
        text: importText,
        mode,
      })
      toast.success(`导入完成，共 ${result.length} 个收藏`)
      setImportText('')
      await onRefresh()
    } catch (err) {
      toast.error('导入失败', { description: (err as Error).message })
    } finally {
      setImporting(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImportText(ev.target?.result as string)
      toast.success(`已读取文件：${file.name}`)
    }
    reader.onerror = () => toast.error('文件读取失败')
    reader.readAsText(file)
  }

  return (
    <Panel
      icon={FileInput}
      title="导入收藏"
      description="支持 JSON（完整格式/纯数组/单对象）和 Markdown，自动检测"
      secondary={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            从文件读取
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.md,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </>
      }
      primary={
        <>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleImport('merge')}
            disabled={importing || !importText.trim()}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            合并导入
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (confirm('全量替换将清空当前所有收藏后导入新数据，确定继续？')) {
                handleImport('replace')
              }
            }}
            disabled={importing || !importText.trim()}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            全量替换
          </Button>
        </>
      }
    >
      <FieldRow label="导入内容" htmlFor="import-text" stacked hint="粘贴 JSON 或 Markdown，或从文件读取">
        <Textarea
          id="import-text"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={4}
          placeholder="粘贴 JSON 或 Markdown 内容…"
          disabled={importing}
          className="text-xs"
        />
      </FieldRow>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        合并导入：新数据与已有收藏合并（URL 相同则覆盖）。全量替换：清空已有收藏后导入新数据，替换前会自动下载当前收藏快照。
      </p>
    </Panel>
  )
}

/* ─── 导出收藏 ─────────────────────────────────── */

function ExportPanel({ bookmarks }: { bookmarks: Bookmark[] }) {
  const handleExportJson = () => {
    downloadTextFile(`gitbookmark-${new Date().toISOString().slice(0, 10)}.json`, exportToJson(bookmarks))
    toast.success('已导出 JSON 文件')
  }

  const handleExportMarkdown = () => {
    downloadTextFile(
      `gitbookmark-${new Date().toISOString().slice(0, 10)}.md`,
      exportToMarkdown(bookmarks),
      'text/markdown',
    )
    toast.success('已导出 Markdown 文件')
  }

  return (
    <Panel
      icon={FileOutput}
      title="导出收藏"
      description={`当前共 ${bookmarks.length} 个`}
      primary={
        <>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportJson} disabled={bookmarks.length === 0}>
            <FileJson className="h-3.5 w-3.5" />
            导出 JSON
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportMarkdown} disabled={bookmarks.length === 0}>
            <FileText className="h-3.5 w-3.5" />
            导出 Markdown
          </Button>
        </>
      }
    >
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        JSON 为完整格式（含摘要、分类、标签），可重新导入或移交给其他工具；Markdown
        为人类可读清单。导出的 JSON 与 Gist 云端备份格式一致。
      </p>
    </Panel>
  )
}

/* ─── 云端备份 ─────────────────────────────────── */

function CloudPanel({
  bookmarks,
  settings,
  onRefresh,
}: {
  bookmarks: Bookmark[]
  settings: Settings
  onRefresh: () => Promise<void>
}) {
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const fetchBackupInfo = useCallback(async () => {
    if (!settings.githubToken || !settings.gistId) {
      setBackupInfo(null)
      return
    }
    setLoading(true)
    try {
      const info = await sendMessage('CLOUD_BACKUP_INFO')
      setBackupInfo(info)
    } catch (err) {
      toast.error('获取备份信息失败', { description: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [settings.githubToken, settings.gistId])

  useEffect(() => {
    // set-state-in-effect 豁免：拉取备份信息需在请求发起时同步置 loading，属数据获取惯用法；
    // 正规解法（请求库/Suspense 或派生 loading）超出本次范围
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBackupInfo()
  }, [fetchBackupInfo])

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const info = await sendMessage('CLOUD_BACKUP')
      setBackupInfo(info)
      toast.success(`备份完成：${info.bookmarkCount} 个收藏`)
      await onRefresh()
    } catch (err) {
      toast.error('备份失败', { description: (err as Error).message })
    } finally {
      setBackingUp(false)
    }
  }

  const handleRestore = async () => {
    if (!confirm('恢复备份将全量替换当前收藏，确定继续？')) return
    setRestoring(true)
    try {
      // 恢复不可逆：恢复前自动下载当前收藏快照
      downloadTextFile(
        `gitbookmark-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
        exportToJson(bookmarks),
      )
      toast.info('已下载替换前快照')
      const restored = await sendMessage('CLOUD_RESTORE')
      toast.success(`恢复完成：${restored.length} 个收藏`)
      await onRefresh()
    } catch (err) {
      toast.error('恢复失败', { description: (err as Error).message })
    } finally {
      setRestoring(false)
    }
  }

  const hasToken = !!settings.githubToken
  const hasBackup = !!settings.gistId && !!backupInfo

  return (
    <Panel
      icon={CloudUpload}
      title="云端备份"
      description={
        hasBackup ? '已有云端备份' : hasToken ? '尚未创建备份' : '未配置 Token'
      }
      secondary={
        hasBackup ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={fetchBackupInfo}
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新状态
          </Button>
        ) : null
      }
      primary={
        <>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleBackup}
            disabled={!hasToken || backingUp || bookmarks.length === 0}
          >
            {backingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
            {hasBackup ? '更新备份' : '创建备份'}
          </Button>
          {hasBackup && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
              恢复备份
            </Button>
          )}
        </>
      }
    >
      {!hasToken && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">
            尚未配置 GitHub Token，请先在上方「GitHub Token」模块中填写（需 gist 权限）
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在获取备份信息…
        </div>
      ) : backupInfo ? (
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Gist ID</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
              {backupInfo.gistId.slice(0, GIST_ID_PREVIEW_LENGTH)}…
            </code>
            <a
              href={backupInfo.gistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">备份时间</span>
            <span>{new Date(backupInfo.lastBackupAt).toLocaleString('zh-CN')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">收藏数量</span>
            <Badge variant="secondary">{backupInfo.bookmarkCount}</Badge>
            {backupInfo.bookmarkCount !== bookmarks.length && (
              <span className="text-[11px] text-muted-foreground">（当前本地 {bookmarks.length} 个）</span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          备份数据存储在 GitHub 私有 Gist 中，格式与 JSON 导出一致
        </p>
      )}
    </Panel>
  )
}
