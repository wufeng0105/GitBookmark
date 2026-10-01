import { useState, useEffect, useCallback } from 'react'
import { sendMessage } from '@/lib/messaging'
import { parseGitHubUrl } from '@/lib/github'
import { bookmarkId } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import RepoDetailCard from '@/components/RepoDetailCard'
import {
  Loader2,
  ExternalLink,
  RefreshCw,
  Pencil,
  Check,
  AlertCircle,
  BookMarked,
} from 'lucide-react'
import type {
  Bookmark,
  RepoMeta,
  AIAnalysisResult,
} from '@/lib/types'

type PopupState =
  | 'loading'
  | 'not-github'
  | 'analyzing'
  | 'analyzed'
  | 'saved'
  | 'error'

export default function Popup() {
  const [state, setState] = useState<PopupState>('loading')
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<RepoMeta | null>(null)
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null)
  const [existing, setExisting] = useState<Bookmark | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const analyze = useCallback(async (tabUrl: string) => {
    setState('analyzing')
    try {
      const result = await sendMessage('ANALYZE_CURRENT', {
        url: tabUrl,
      })
      setMeta(result.meta)
      setAnalysis(result.analysis)
      setState('analyzed')
    } catch (err) {
      setError((err as Error).message)
      setState('error')
    }
  }, [])

  // 初始化：取当前 Tab 的 URL
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabUrl = tabs[0]?.url ?? ''
      const parsed = parseGitHubUrl(tabUrl)
      if (!parsed) {
        setState('not-github')
        return
      }
      setUrl(tabUrl)

      try {
        // 已收藏就直接展示详情，不重复分析
        const bookmarked = await sendMessage('CHECK_BOOKMARKED', {
          url: tabUrl,
        })
        if (bookmarked) {
          setExisting(bookmarked)
          setState('saved')
          return
        }
        // 未收藏 → 自动分析（使用默认模式）
        await analyze(tabUrl)
      } catch (err) {
        setError((err as Error).message)
        setState('error')
      }
    })
  }, [analyze])

  const handleSave = async () => {
    if (!meta || !analysis) return
    setSaving(true)
    try {
      const now = Date.now()
      const bookmark: Bookmark = {
        id: bookmarkId(meta.url),
        url: meta.url,
        owner: meta.owner,
        repo: meta.repo,
        description: meta.description,
        stars: meta.stars,
        forks: meta.forks,
        language: meta.language,
        topics: meta.topics,
        summary: analysis.summary,
        category: analysis.category || null,
        tags: analysis.suggestedTags ?? [],
        createdAt: now,
        updatedAt: now,
      }
      const bookmarks = await sendMessage('SAVE_BOOKMARK', {
        bookmark,
      })
      const saved = bookmarks.find((b) => b.id === bookmark.id) ?? bookmark
      setExisting(saved)
      setState('saved')
    } catch (err) {
      setError((err as Error).message)
      setState('error')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = () => {
    if (!existing) return
    // 只开一个带 edit 参数的管理页标签，由 App 消费 ?edit= 直达编辑弹窗
    chrome.tabs.create({
      url: `${chrome.runtime.getURL('manage.html')}?edit=${existing.id}`,
    })
  }

  const handleRetry = () => {
    if (url) {
      analyze(url)
    } else {
      setState('loading')
      window.close()
    }
  }

  // ─── 渲染 ──────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (state === 'not-github') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">不是 GitHub 页面</p>
          <p className="mt-1 text-xs text-muted-foreground">
            请在 GitHub 仓库页面使用此插件
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          打开管理页
        </Button>
      </div>
    )
  }

  if (state === 'analyzing') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">正在分析仓库…</p>
          <p className="mt-1 text-xs text-muted-foreground">
            获取 README 并生成 AI 摘要
          </p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">分析失败</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRetry}>
          重试
        </Button>
      </div>
    )
  }

  if (state === 'saved' && existing) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">已收藏</span>
          </div>
          <a
            href={existing.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`在 GitHub 打开 ${existing.owner}/${existing.repo}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <RepoDetailCard
            owner={existing.owner}
            repo={existing.repo}
            description={existing.description}
            stars={existing.stars}
            forks={existing.forks}
            language={existing.language}
            summary={existing.summary}
            category={existing.category}
            tags={existing.tags}
          />
        </div>

        <footer className="flex flex-col gap-2 border-t p-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => analyze(url)}
            >
              <RefreshCw className="h-3 w-3" />
              重新分析
            </Button>
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handleEdit}
            >
              <Pencil className="h-3 w-3" />
              编辑
            </Button>
          </div>
        </footer>
      </div>
    )
  }

  // 分析完成，等待用户保存
  if (state === 'analyzed' && meta && analysis) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">
              分析完成
            </span>
          </div>
          <a
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`在 GitHub 打开 ${meta.owner}/${meta.repo}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <RepoDetailCard
            owner={meta.owner}
            repo={meta.repo}
            description={meta.description}
            stars={meta.stars}
            forks={meta.forks}
            language={meta.language}
            summary={analysis.summary}
            category={analysis.category || null}
            tags={analysis.suggestedTags ?? []}
          />
        </div>

        <footer className="flex flex-col gap-2 border-t p-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => analyze(url)}
            >
              <RefreshCw className="h-3 w-3" />
              重新分析
            </Button>
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              收藏
            </Button>
          </div>
        </footer>
      </div>
    )
  }

  return null
}
