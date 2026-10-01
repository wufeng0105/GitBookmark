import { GITHUB_API_URL, GIST_FILENAME, GIST_DESCRIPTION, GITHUB_API_TIMEOUT } from '@/shared/constants'
import type { Bookmark, BackupInfo, BackupPayload } from '@/lib/types'

/** Gist API 响应类型 */
interface GistResponse {
  id: string
  html_url: string
  description: string | null
  updated_at: string
  created_at: string
  files: Record<string, { content: string; filename: string } | null>
}

// ─── 类型安全辅助函数 ──────────────────────────────────────

/** 检查值是否为对象 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** 校验 Gist API 响应结构 */
function isGistResponse(data: unknown): data is GistResponse {
  if (!isObject(data)) return false
  return typeof data.id === 'string' && typeof data.html_url === 'string'
}

/** 校验 BackupPayload 结构 */
function isBackupPayload(data: unknown): data is BackupPayload {
  if (!isObject(data)) return false
  return Array.isArray(data.bookmarks)
}

/** 构造备份 JSON 内容 */
export function buildBackupContent(bookmarks: Bookmark[]): string {
  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarkCount: bookmarks.length,
    bookmarks,
  }
  return JSON.stringify(payload, null, 2)
}

/** 从 Gist 响应中解析备份内容 */
function parseBackupContent(gist: GistResponse): Bookmark[] {
  const file = gist.files?.[GIST_FILENAME]
  if (!file) {
    throw new Error('Gist 中未找到备份文件')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(file.content)
  } catch {
    throw new Error('备份文件 JSON 解析失败')
  }
  if (!isBackupPayload(parsed)) {
    throw new Error('备份文件格式异常')
  }
  return parsed.bookmarks
}

/** 从 Gist 响应中提取备份信息 */
function extractBackupInfo(gist: GistResponse): BackupInfo {
  const file = gist.files?.[GIST_FILENAME]
  let count = 0
  if (file?.content) {
    try {
      const data: unknown = JSON.parse(file.content)
      if (isBackupPayload(data)) {
        count = data.bookmarkCount ?? data.bookmarks?.length ?? 0
      }
    } catch {
      // 备份内容损坏不影响其余信息展示，收藏数按 0 处理
    }
  }
  return {
    gistId: gist.id,
    gistUrl: gist.html_url,
    lastBackupAt: gist.updated_at,
    bookmarkCount: count,
    description: gist.description ?? '',
  }
}

/** 安全解析 Gist API 响应 */
async function parseGistResponse(res: Response): Promise<GistResponse> {
  const data: unknown = await res.json()
  if (!isGistResponse(data)) {
    throw new Error('GitHub Gist API 返回数据格式异常')
  }
  return data
}

/**
 * 首次备份：新建一个私有 Gist 并写入收藏。
 * 已有 gistId 时应改走 updateGistBackup，避免每次备份都新增一个 Gist。
 * @returns 新 Gist 的 ID 与网页地址
 */
export async function createGistBackup(
  token: string,
  bookmarks: Bookmark[],
): Promise<{ gistId: string; gistUrl: string }> {
  let res: Response
  try {
    res = await fetch(`${GITHUB_API_URL}/gists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: buildBackupContent(bookmarks),
          },
        },
      }),
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('GitHub Gist API 请求超时', { cause: err })
    }
    throw new Error('GitHub Gist API 网络请求失败', { cause: err })
  }

  if (res.status === 401) {
    throw new Error('GitHub Token 无效，请检查 Token 是否正确')
  }
  if (res.status === 403) {
    throw new Error('GitHub API 速率限制或 Token 权限不足，请确保 Token 包含 gist 权限')
  }
  if (res.status === 404) {
    throw new Error('Token 缺少 gist 权限。请重新创建 Token 并勾选 gist 选项')
  }
  if (!res.ok) {
    throw new Error(`创建备份失败: ${res.status}`)
  }

  const gist = await parseGistResponse(res)
  return { gistId: gist.id, gistUrl: gist.html_url }
}

/** 后续备份：整体覆盖已有 Gist 里的备份文件 */
export async function updateGistBackup(
  token: string,
  gistId: string,
  bookmarks: Bookmark[],
): Promise<{ gistUrl: string }> {
  let res: Response
  try {
    res = await fetch(`${GITHUB_API_URL}/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        files: {
          [GIST_FILENAME]: {
            content: buildBackupContent(bookmarks),
          },
        },
      }),
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('GitHub Gist API 请求超时', { cause: err })
    }
    throw new Error('GitHub Gist API 网络请求失败', { cause: err })
  }

  if (res.status === 401) {
    throw new Error('GitHub Token 无效，请检查 Token 是否正确')
  }
  if (res.status === 404) {
    throw new Error('备份 Gist 不存在（可能已被删除），请重新创建备份')
  }
  if (res.status === 403) {
    throw new Error('GitHub API 速率限制或 Token 权限不足，请确保 Token 包含 gist 权限')
  }
  if (!res.ok) {
    throw new Error(`更新备份失败: ${res.status}`)
  }

  const gist = await parseGistResponse(res)
  return { gistUrl: gist.html_url }
}

/**
 * 从 Gist 恢复备份
 * @returns 收藏列表
 */
export async function fetchGistBackup(
  token: string,
  gistId: string,
): Promise<Bookmark[]> {
  let res: Response
  try {
    res = await fetch(`${GITHUB_API_URL}/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('GitHub Gist API 请求超时', { cause: err })
    }
    throw new Error('GitHub Gist API 网络请求失败', { cause: err })
  }

  if (res.status === 401) {
    throw new Error('GitHub Token 无效，请检查 Token 是否正确')
  }
  if (res.status === 404) {
    throw new Error('备份 Gist 不存在')
  }
  if (res.status === 403) {
    throw new Error('Token 权限不足，请确保 Token 包含 gist 权限')
  }
  if (!res.ok) {
    throw new Error(`获取备份失败: ${res.status}`)
  }

  const gist = await parseGistResponse(res)
  return parseBackupContent(gist)
}

/**
 * 获取 Gist 备份信息（不下载完整内容）
 */
export async function getGistBackupInfo(
  token: string,
  gistId: string,
): Promise<BackupInfo> {
  let res: Response
  try {
    res = await fetch(`${GITHUB_API_URL}/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('GitHub Gist API 请求超时', { cause: err })
    }
    throw new Error('GitHub Gist API 网络请求失败', { cause: err })
  }

  if (res.status === 401) {
    throw new Error('GitHub Token 无效，请检查 Token 是否正确')
  }
  if (res.status === 404) {
    throw new Error('备份 Gist 不存在')
  }
  if (res.status === 403) {
    throw new Error('Token 权限不足，请确保 Token 包含 gist 权限')
  }
  if (!res.ok) {
    throw new Error(`获取备份信息失败: ${res.status}`)
  }

  const gist = await parseGistResponse(res)
  return extractBackupInfo(gist)
}
