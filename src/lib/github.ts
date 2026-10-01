import {
  GITHUB_API_URL,
  GITHUB_API_TIMEOUT,
  README_MAX_LENGTH,
} from '@/shared/constants'
import type { RepoMeta } from '@/lib/types'

/** GitHub 仓库 URL 匹配规则：捕获 owner 与 repo，容忍 .git 后缀及其后的子路径、查询参数、哈希 */
const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/

/** 从 GitHub URL 解析 owner 和 repo */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim()
  const match = trimmed.match(GITHUB_URL_RE)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

/**
 * 归一化为规范仓库 URL（剥离子路径、查询参数、哈希与 .git 后缀）。
 * 收藏检测与保存共用此规则，避免子页面形态被误判为未收藏。
 */
export function normalizeRepoUrl(url: string): string | null {
  const parsed = parseGitHubUrl(url)
  if (!parsed) return null
  return `https://github.com/${parsed.owner}/${parsed.repo}`
}

/** 从多行文本中提取所有合法的 GitHub 仓库 URL（去重） */
export function extractGitHubUrls(text: string): string[] {
  const lines = text.split(/[\s,;\n]+/)
  const seen = new Set<string>()
  const urls: string[] = []
  for (const line of lines) {
    const normalized = normalizeRepoUrl(line)
    if (normalized && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase())
      urls.push(normalized)
    }
  }
  return urls
}

/** 取回 README 文本，清洗并截断到 README_MAX_LENGTH；任何失败都返回空字符串 */
export async function fetchReadme(
  owner: string,
  repo: string,
  token?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.raw',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const res = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/readme`,
      { headers, signal: AbortSignal.timeout(GITHUB_API_TIMEOUT) },
    )

    if (res.status === 404) {
      // 部分 README 使用非标准文件名（如 readme.zh-CN.md），尝试降级获取
      return fetchReadmeFallback(owner, repo, token)
    }
    if (res.status === 403) {
      // 被限流不该毁掉一次收藏：README 留空继续
      console.warn('[GitBookmark] README 获取受限（速率限制），已降级为空内容', `${owner}/${repo}`)
      return ''
    }
    if (!res.ok) {
      console.warn(`[GitBookmark] README 获取失败（HTTP ${res.status}），已降级为空内容`, `${owner}/${repo}`)
      return ''
    }

    const text = await res.text()
    return cleanReadme(text)
  } catch (err: unknown) {
    // README 只是分析的辅助输入，异常同样降级，但记下原因便于排查
    console.warn(`[GitBookmark] 获取 ${owner}/${repo} README 异常，已降级为空内容`, err)
    return ''
  }
}

/** 尝试从仓库根目录查找 README 文件（降级方案） */
async function fetchReadmeFallback(
  owner: string,
  repo: string,
  token?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const res = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/`, {
      headers,
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT),
    })
    if (!res.ok) return ''

    const data: unknown = await res.json()
    if (!Array.isArray(data)) return ''

    const files = data as Array<{ name: string }>
    const readmeFile = files.find(
      (f) => f.name.toLowerCase().startsWith('readme'),
    )
    if (!readmeFile) return ''

    // 命中文件名后，从 raw.githubusercontent 取原始文本
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${readmeFile.name}`,
      { signal: AbortSignal.timeout(GITHUB_API_TIMEOUT) },
    )
    if (!rawRes.ok) return ''

    const text = await rawRes.text()
    return cleanReadme(text)
  } catch {
    return ''
  }
}

/** 清掉 README 里对理解项目无用的噪音，再截断到送入 prompt 的长度上限 */
export function cleanReadme(raw: string): string {
  return raw
    // 移除 badge 图片行（如 ![...](https://img.shields.io/...)）
    .replace(/!\[[^\]]*\]\(https?:\/\/img\.shields\.io[^)]+\)/g, '')
    .replace(/!\[[^\]]*\]\(https?:\/\/github\.com\/[^)]+\/actions\/[^)]+\)/g, '')
    // 移除 HTML 注释
    .replace(/<!--[\s\S]*?-->/g, '')
    // 移除连续空行（超过 2 个换行压缩为 2 个）
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, README_MAX_LENGTH)
}

// ─── 类型安全辅助函数 ──────────────────────────────────────

/** 检查值是否为对象 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** 从 unknown 中安全提取字符串 */
function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** 从 unknown 中安全提取数字 */
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && !isNaN(v) ? v : fallback
}

/** 从 unknown 中安全提取字符串数组 */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((item): item is string => typeof item === 'string')
}

/** GitHub API repo 响应结构校验 */
function isRepoData(data: unknown): data is {
  html_url: string
  owner: { login: string } | null
  name: string
  description: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  topics: string[]
} {
  if (!isObject(data)) return false
  return typeof data.html_url === 'string'
}

/** 获取仓库元数据；请求超时、仓库不存在、被限流或响应结构异常都抛错，由调用方计入失败清单 */
export async function fetchRepoMeta(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepoMeta> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`GitHub API 请求超时: ${owner}/${repo}`, { cause: err })
    }
    throw new Error(`GitHub API 网络请求失败: ${owner}/${repo}`, { cause: err })
  }

  if (res.status === 404) {
    throw new Error(`仓库 ${owner}/${repo} 不存在`)
  }
  if (res.status === 403) {
    throw new Error('GitHub API 速率限制，请在设置中配置 GitHub Token')
  }
  if (!res.ok) {
    throw new Error(`GitHub API 错误: ${res.status}`)
  }

  const data: unknown = await res.json()
  if (!isRepoData(data)) {
    throw new Error(`GitHub API 返回数据格式异常: ${owner}/${repo}`)
  }

  return {
    url: data.html_url,
    owner: data.owner?.login ?? owner,
    repo: data.name ?? repo,
    description: asString(data.description),
    stars: asNumber(data.stargazers_count),
    forks: asNumber(data.forks_count),
    language: data.language ?? null,
    topics: asStringArray(data.topics),
    readmeContent: '',
  }
}
