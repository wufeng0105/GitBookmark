import { bookmarkId } from '@/lib/storage'
import { parseGitHubUrl } from '@/lib/github'
import { importFromMarkdown } from '@/lib/markdown'
import { FIELD_MAX_LENGTH, MAX_TAGS_COUNT } from '@/shared/constants'
import type { Bookmark, BackupPayload } from '@/lib/types'

// ─── 类型安全辅助函数 ──────────────────────────────────────

/** 检查值是否为对象 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** 从 unknown 中安全提取字符串（含长度截断） */
function asString(v: unknown, fallback = '', maxLen?: number): string {
  if (typeof v !== 'string') return fallback
  return maxLen ? v.slice(0, maxLen) : v
}

/** 从 unknown 中安全提取数字 */
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && !isNaN(v) ? v : fallback
}

/** 从 unknown 中安全提取字符串或 null */
function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** 从 unknown 中安全提取字符串数组（含数量和长度限制） */
function asStringArray(v: unknown, maxCount?: number, maxItemLen?: number): string[] {
  if (!Array.isArray(v)) return []
  const filtered = v.filter((item): item is string => typeof item === 'string')
  const limited = maxItemLen ? filtered.map((s) => s.slice(0, maxItemLen)) : filtered
  return maxCount ? limited.slice(0, maxCount) : limited
}

/** 将收藏列表导出为 JSON 文本，产出即 BackupPayload 结构 */
export function exportToJson(bookmarks: Bookmark[]): string {
  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarkCount: bookmarks.length,
    bookmarks,
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * 从 JSON 文本中解析收藏列表。
 * 兼容三种格式：
 *   1. 完整格式 { version, exportedAt, bookmarkCount, bookmarks: [...] }
 *   2. 纯数组 [ {bookmark}, ... ]
 *   3. 单个对象 { id, url, ... }（视为单个收藏）
 */
export function importFromJson(text: string): Bookmark[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('JSON 解析失败，请检查格式是否正确')
  }

  if (isObject(data) && !Array.isArray(data) && Array.isArray(data.bookmarks)) {
    const payload = data as { bookmarks: unknown[] }
    return payload.bookmarks.map(normalizeBookmark)
  }

  if (Array.isArray(data)) {
    return data.map(normalizeBookmark)
  }

  if (isObject(data) && (data.url || data.id)) {
    return [normalizeBookmark(data)]
  }

  throw new Error('JSON 格式异常：无法识别的收藏数据')
}

/** 把来源不明的对象补成合法收藏：补默认值、截断超长字段，JSON 导入与云端恢复共用 */
export function normalizeBookmark(raw: unknown): Bookmark {
  const obj = isObject(raw) ? raw : {}
  const url = asString(obj.url)
  const now = Date.now()

  // 能解析出 owner/repo 时把 URL 重写成规范形态，解析不出则原样留着
  const parsed = parseGitHubUrl(url)
  const validUrl = parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : url
  const owner = parsed?.owner ?? asString(obj.owner)
  const repo = parsed?.repo ?? asString(obj.repo)

  return {
    id: asString(obj.id) || bookmarkId(validUrl),
    url: validUrl,
    owner,
    repo,
    description: asString(obj.description, '', FIELD_MAX_LENGTH.DESCRIPTION),
    stars: asNumber(obj.stars),
    forks: asNumber(obj.forks),
    language: asStringOrNull(obj.language),
    topics: asStringArray(obj.topics),
    summary: asString(obj.summary, '', FIELD_MAX_LENGTH.SUMMARY),
    category: asStringOrNull(obj.category)?.slice(0, FIELD_MAX_LENGTH.CATEGORY) ?? null,
    tags: asStringArray(obj.tags, MAX_TAGS_COUNT, FIELD_MAX_LENGTH.TAG),
    createdAt: asNumber(obj.createdAt, now),
    updatedAt: asNumber(obj.updatedAt, now),
  }
}

/**
 * 按开头字符判定导入格式：以 { 或 [ 开头走 JSON 导入，其余按 Markdown 解析。
 */
export function importAuto(text: string): Bookmark[] {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return importFromJson(trimmed)
  }
  return importFromMarkdown(trimmed)
}
