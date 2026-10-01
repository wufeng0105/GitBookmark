import {
  getBookmarks,
  updateBookmark,
  deleteBookmark,
  deleteBookmarks,
  getSettings,
  updateSettings,
  replaceBookmarks,
  addBookmarksBatch,
  updateBookmarksBatch,
  bookmarkId,
} from '@/lib/storage'
import { fetchRepoMeta, fetchReadme, parseGitHubUrl, normalizeRepoUrl } from '@/lib/github'
import { batchAnalyzeRepos } from '@/lib/deepseek'
import { mapWithLimit } from '@/lib/concurrency'
import { exportToJson, importAuto, normalizeBookmark } from '@/lib/json-export'
import {
  createGistBackup,
  updateGistBackup,
  fetchGistBackup,
  getGistBackupInfo,
} from '@/lib/gist'
import { BATCH_ANALYZE_MAX, ANALYZE_CONCURRENCY } from '@/shared/constants'
import type {
  MessagePayloadMap,
  MessageResponse,
  Bookmark,
  RepoMeta,
  Settings,
  AIAnalysisResult,
  BackupInfo,
  BatchAnalyzeResult,
  BatchFailure,
  ReanalyzeResult,
  AnalyzeCurrentResult,
} from '@/lib/types'

// ─── 批量元数据获取 ────────────────────────────────────────

/** fetchMetasBatch 的单项结果：成功位带元数据，失败位带错误信息 */
type MetaSlot = { ok: true; meta: RepoMeta } | { ok: false; error: string }

/**
 * 批量获取仓库元数据（受限并发）：返回与 items 等长对齐的槽位数组。
 * 单仓失败只记日志、不中断整批，由调用方按失败位回填各自的失败清单
 * （BATCH_ANALYZE 记 url，REANALYZE 还需按成功位配对旧收藏）。
 */
async function fetchMetasBatch(
  items: Array<{ owner: string; repo: string }>,
  settings: Settings,
  tag: string,
): Promise<MetaSlot[]> {
  const settled = await mapWithLimit(items, ANALYZE_CONCURRENCY, async (item) => {
    const meta = await fetchRepoMeta(
      item.owner,
      item.repo,
      settings.githubToken || undefined,
    )
    meta.readmeContent = await fetchReadme(
      item.owner,
      item.repo,
      settings.githubToken || undefined,
    )
    return meta
  })

  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return { ok: true as const, meta: s.value }
    const error = s.reason instanceof Error ? s.reason.message : String(s.reason)
    console.error(
      `[GitBookmark] ${tag}: 获取 ${items[i].owner}/${items[i].repo} 失败:`,
      error,
    )
    return { ok: false as const, error }
  })
}

// ─── 右键菜单注册 ──────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-manage',
    title: '进入管理',
    contexts: ['action'],
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'open-manage') {
    chrome.runtime.openOptionsPage()
  }
})

// ─── 消息处理 ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    request: { action: string; payload?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    handleMessage(request)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err: unknown) =>
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    return true
  },
)

export async function handleMessage(request: {
  action: string
  payload?: unknown
}): Promise<unknown> {
  const { action, payload } = request

  switch (action) {
    case 'GET_BOOKMARKS':
      return getBookmarks()

    case 'CHECK_BOOKMARKED': {
      const { url } = payload as MessagePayloadMap['CHECK_BOOKMARKED']
      const bookmarks = await getBookmarks()
      const normalized = normalizeRepoUrl(url)
      const id = bookmarkId(normalized ?? url)
      return bookmarks.find((b) => b.id === id) ?? null
    }

    case 'ANALYZE_CURRENT': {
      const { url } = payload as MessagePayloadMap['ANALYZE_CURRENT']
      const settings = await getSettings()
      if (!settings.deepseekApiKey) {
        throw new Error('请先在设置中填写 DeepSeek API Key')
      }

      const parsed = parseGitHubUrl(url)
      if (!parsed) {
        throw new Error('无效的 GitHub URL')
      }

      const meta = await fetchRepoMeta(
        parsed.owner,
        parsed.repo,
        settings.githubToken || undefined,
      )
      meta.readmeContent = await fetchReadme(
        parsed.owner,
        parsed.repo,
        settings.githubToken || undefined,
      )

      const existing = await getBookmarks()
      const { results, failures } = await batchAnalyzeRepos(
        [meta], existing, settings,
      )
      if (failures.length > 0) {
        // 单仓库分析失败直接抛错，由 Popup 展示并可重试
        throw new Error(failures[0].error)
      }
      const analysis: AIAnalysisResult = results[0] ?? {
        summary: '',
        category: '',
        suggestedTags: [],
      }

      return { meta, analysis } satisfies AnalyzeCurrentResult
    }

    case 'SAVE_BOOKMARK': {
      const { bookmark } = payload as MessagePayloadMap['SAVE_BOOKMARK']
      return addBookmarksBatch([bookmark])
    }

    case 'UPDATE_BOOKMARK': {
      const { id, patch } = payload as MessagePayloadMap['UPDATE_BOOKMARK']
      return updateBookmark(id, patch)
    }

    case 'DELETE_BOOKMARK': {
      const { id, ids } = payload as MessagePayloadMap['DELETE_BOOKMARK']
      if (ids && ids.length > 0) {
        return deleteBookmarks(ids)
      }
      if (id) {
        return deleteBookmark(id)
      }
      throw new Error('缺少要删除的 ID')
    }

    case 'GET_SETTINGS':
      return getSettings()

    case 'UPDATE_SETTINGS': {
      const { patch } = payload as MessagePayloadMap['UPDATE_SETTINGS']
      return updateSettings(patch, action)
    }

    case 'BATCH_ANALYZE': {
      const { urls } = payload as MessagePayloadMap['BATCH_ANALYZE']
      const settings = await getSettings()
      if (!settings.deepseekApiKey) {
        throw new Error('请先在设置中填写 DeepSeek API Key')
      }

      const parseResults = urls.map((url: string) => ({
        url,
        parsed: parseGitHubUrl(url),
      }))

      // 无效 URL 计入失败清单，回传界面提示
      const failed: BatchFailure[] = parseResults
        .filter((r) => r.parsed === null)
        .map((r) => ({ url: r.url, error: '无效的 GitHub URL' }))

      const valid = parseResults.filter(
        (r): r is { url: string; parsed: { owner: string; repo: string } } =>
          r.parsed !== null,
      )

      if (valid.length === 0) {
        throw new Error('没有有效的 GitHub 仓库')
      }
      if (valid.length > BATCH_ANALYZE_MAX) {
        throw new Error(`单次最多分析 ${BATCH_ANALYZE_MAX} 个仓库，请分批添加`)
      }

      // 受限并发获取元数据；单个仓库失败只进失败清单，不中断整批
      const metaSlots = await fetchMetasBatch(
        valid.map((v) => v.parsed),
        settings,
        'BATCH_ANALYZE',
      )
      const metas: RepoMeta[] = []
      metaSlots.forEach((slot, i) => {
        if (slot.ok) {
          metas.push(slot.meta)
        } else {
          failed.push({ url: valid[i].url, error: slot.error })
        }
      })

      if (metas.length === 0) {
        throw new Error('所有仓库的 GitHub 元数据获取失败，请检查网络或 GitHub Token 设置')
      }

      const existing = await getBookmarks()
      const { results, failures: aiFailures } = await batchAnalyzeRepos(
        metas, existing, settings,
      )

      // AI 分析失败的仓库不保存，计入失败清单
      const aiFailedIdx = new Set(aiFailures.map((f) => f.index))
      aiFailures.forEach((f) => {
        failed.push({ url: metas[f.index].url, error: f.error })
      })

      const newBookmarks: Bookmark[] = []
      metas.forEach((meta, i) => {
        if (aiFailedIdx.has(i)) return
        const analysis: AIAnalysisResult = results[i] ?? {
          summary: '',
          category: '',
          suggestedTags: [],
        }
        const now = Date.now()
        newBookmarks.push({
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
        })
      })

      await addBookmarksBatch(newBookmarks)

      const allBookmarks = await getBookmarks()
      if (failed.length > 0) {
        console.warn(`[GitBookmark] BATCH_ANALYZE: ${failed.length} 个仓库处理失败已跳过`)
      }
      return { newBookmarks, allBookmarks, failed } satisfies BatchAnalyzeResult
    }

    case 'REANALYZE': {
      const { ids } = payload as MessagePayloadMap['REANALYZE']
      const settings = await getSettings()
      if (!settings.deepseekApiKey) {
        throw new Error('请先在设置中填写 DeepSeek API Key')
      }

      const existing = await getBookmarks()
      const toReanalyze = existing.filter((b) => ids.includes(b.id))

      if (toReanalyze.length === 0) {
        throw new Error('未找到要重新分析的收藏')
      }
      if (toReanalyze.length > BATCH_ANALYZE_MAX) {
        throw new Error(`单次最多重新分析 ${BATCH_ANALYZE_MAX} 个仓库，请分批操作`)
      }
      if (toReanalyze.length < ids.length) {
        console.warn(
          `[GitBookmark] REANALYZE: ${ids.length - toReanalyze.length} 个 ID 未找到对应收藏`,
        )
      }

      const failed: BatchFailure[] = []
      // 元数据获取沿用批量分析同一套并发上限与失败处理；槽位与输入按下标配对
      const metaSlots = await fetchMetasBatch(toReanalyze, settings, 'REANALYZE')
      const metas: RepoMeta[] = []
      const pairedBookmarks: Bookmark[] = []
      metaSlots.forEach((slot, i) => {
        if (slot.ok) {
          metas.push(slot.meta)
          pairedBookmarks.push(toReanalyze[i])
        } else {
          failed.push({ url: toReanalyze[i].url, error: slot.error })
        }
      })

      if (metas.length === 0) {
        throw new Error('所有仓库的 GitHub 元数据获取失败，请检查网络或 GitHub Token 设置')
      }

      const { results, failures: aiFailures } = await batchAnalyzeRepos(
        metas, existing, settings,
      )

      // AI 分析失败的收藏保留原数据不更新，计入失败清单
      const aiFailedIdx = new Set(aiFailures.map((f) => f.index))
      aiFailures.forEach((f) => {
        failed.push({ url: pairedBookmarks[f.index].url, error: f.error })
      })

      const updates = metas
        .map((meta, i) => {
          if (aiFailedIdx.has(i)) return null
          const analysis: AIAnalysisResult = results[i] ?? {
            summary: '',
            category: '',
            suggestedTags: [],
          }
          const old = pairedBookmarks[i]
          return {
            id: old.id,
            patch: {
              description: meta.description,
              stars: meta.stars,
              forks: meta.forks,
              language: meta.language,
              topics: meta.topics,
              summary: analysis.summary || old.summary,
              category: analysis.category || old.category,
              tags: analysis.suggestedTags?.length ? analysis.suggestedTags : old.tags,
              updatedAt: Date.now(),
            } as Partial<Bookmark>,
          }
        })
        .filter((u): u is { id: string; patch: Partial<Bookmark> } => u !== null)

      await updateBookmarksBatch(updates)

      const allBookmarks = await getBookmarks()
      if (failed.length > 0) {
        console.warn(`[GitBookmark] REANALYZE: ${failed.length} 个仓库处理失败已跳过`)
      }
      return {
        reanalyzed: updates.length,
        allBookmarks,
        failed,
      } satisfies ReanalyzeResult
    }

    case 'EXPORT_JSON': {
      const bookmarks = await getBookmarks()
      return exportToJson(bookmarks)
    }

    case 'IMPORT_JSON': {
      const { text, mode } = payload as MessagePayloadMap['IMPORT_JSON']
      const imported = importAuto(text)
      if (mode === 'replace') {
        await replaceBookmarks(imported)
        return imported
      }
      await addBookmarksBatch(imported)
      return getBookmarks()
    }

    case 'CLOUD_BACKUP': {
      const settings = await getSettings()
      if (!settings.githubToken) {
        throw new Error('请先在设置中填写 GitHub Token（需 gist 权限）')
      }

      const bookmarks = await getBookmarks()

      let gistId = settings.gistId
      let gistUrl: string

      if (gistId) {
        const result = await updateGistBackup(settings.githubToken, gistId, bookmarks)
        gistUrl = result.gistUrl
      } else {
        const result = await createGistBackup(settings.githubToken, bookmarks)
        gistId = result.gistId
        gistUrl = result.gistUrl
        await updateSettings({ gistId }, action)
      }

      const info: BackupInfo = {
        gistId,
        gistUrl,
        lastBackupAt: new Date().toISOString(),
        bookmarkCount: bookmarks.length,
        description: 'GitBookmark Cloud Backup',
      }
      return info
    }

    case 'CLOUD_RESTORE': {
      const settings = await getSettings()
      if (!settings.githubToken) {
        throw new Error('请先在设置中填写 GitHub Token（需 gist 权限）')
      }
      if (!settings.gistId) {
        throw new Error('还没有云端备份，请先创建备份')
      }

      const bookmarks = (await fetchGistBackup(settings.githubToken, settings.gistId)).map(
        normalizeBookmark,
      )
      await replaceBookmarks(bookmarks)
      return bookmarks
    }

    case 'CLOUD_BACKUP_INFO': {
      const settings = await getSettings()
      if (!settings.githubToken) {
        throw new Error('请先在设置中填写 GitHub Token（需 gist 权限）')
      }
      if (!settings.gistId) {
        return null
      }
      return await getGistBackupInfo(settings.githubToken, settings.gistId)
    }

    default:
      throw new Error(`未知操作: ${action}`)
  }
}
