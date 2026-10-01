import { MARKDOWN_HEADER } from '@/shared/constants'
import { bookmarkId } from '@/lib/storage'
import type { Bookmark } from '@/lib/types'

// ─── 导出 ──────────────────────────────────────────────────

/** 格式化日期为 YYYY-MM-DD */
function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 格式化日期时间为 YYYY-MM-DD HH:mm:ss */
function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const date = formatDate(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${date} ${h}:${min}:${s}`
}

/** 格式化数字（如 220000 → 220,000） */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * 将收藏列表导出为 Markdown 文本。
 *
 * 格式示例：
 * ```md
 * # GitBookmark 收藏列表
 *
 * > 导出时间：2024-01-15 10:30:00
 * > 共 15 个收藏
 *
 * ---
 *
 * ## [facebook/react](https://github.com/facebook/react)
 *
 * - **描述**: The library for web and native user interfaces.
 * - **Star**: 220,000 | **Fork**: 45,000 | **语言**: JavaScript
 * - **分类**: 前端框架
 * - **标签**: `前端框架` `UI库` `React`
 * - **摘要**: React 是一个用于构建用户界面的 JavaScript 库...
 * - **收藏时间**: 2024-01-15
 *
 * ---
 * ```
 */
export function exportToMarkdown(bookmarks: Bookmark[]): string {
  const lines: string[] = []
  const now = Date.now()

  // 文件头：一级标题，加导出时间与收藏总数的引用块
  lines.push(MARKDOWN_HEADER)
  lines.push('')
  lines.push(`> 导出时间：${formatDateTime(now)}`)
  lines.push(`> 共 ${bookmarks.length} 个收藏`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // 逐条收藏：## 标题行 + 字段列表
  for (const b of bookmarks) {
    const title = `## [${b.owner}/${b.repo}](${b.url})`
    lines.push(title)
    lines.push('')

    lines.push(`- **描述**: ${b.description || '（无描述）'}`)

    const metaParts = [`**Star**: ${formatNumber(b.stars)}`, `**Fork**: ${formatNumber(b.forks)}`]
    if (b.language) {
      metaParts.push(`**语言**: ${b.language}`)
    }
    lines.push(`- ${metaParts.join(' | ')}`)

    if (b.category) {
      lines.push(`- **分类**: ${b.category}`)
    }

    if (b.tags.length > 0) {
      const tagsStr = b.tags.map((t) => `\`${t}\``).join(' ')
      lines.push(`- **标签**: ${tagsStr}`)
    }

    if (b.summary) {
      lines.push(`- **摘要**: ${b.summary}`)
    }

    lines.push(`- **收藏时间**: ${formatDate(b.createdAt)}`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

// ─── 导入 ──────────────────────────────────────────────────

/** 匹配仓库标题行：## [owner/repo](url) */
const TITLE_RE = /^##\s*\[([^\]]+)\/([^\]]+)\]\(([^)]+)\)/

/** 从一行中提取字段值：- **字段名**: 值 */
function extractField(line: string, fieldName: string): string | null {
  const re = new RegExp(`^-\\s*\\*\\*${fieldName}\\*\\*\\s*:\\s*(.+)$`)
  const match = line.match(re)
  return match ? match[1].trim() : null
}

/** 从标签行提取标签数组：`tag1` `tag2` → ["tag1", "tag2"] */
function parseTags(value: string): string[] {
  const tags: string[] = []
  const re = /`([^`]+)`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    tags.push(m[1].trim())
  }
  return tags
}

/** 从 Star | Fork | 语言 行中解析元数据 */
function parseMetaLine(value: string): {
  stars: number
  forks: number
  language: string | null
} {
  const starsMatch = value.match(/\*\*Star\*\*:\s*([\d,]+)/)
  const forksMatch = value.match(/\*\*Fork\*\*:\s*([\d,]+)/)
  const langMatch = value.match(/\*\*语言\*\*:\s*(.+?)(?:\s*\||$)/)

  return {
    stars: starsMatch ? parseInt(starsMatch[1].replace(/,/g, ''), 10) : 0,
    forks: forksMatch ? parseInt(forksMatch[1].replace(/,/g, ''), 10) : 0,
    language: langMatch ? langMatch[1].trim() : null,
  }
}

/** 解析日期字符串（YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）为时间戳 */
function parseDate(value: string): number {
  // 尝试 YYYY-MM-DD
  const d = new Date(value)
  if (!isNaN(d.getTime())) return d.getTime()
  return Date.now()
}

/**
 * 从 Markdown 文本中解析收藏列表。
 * 与 exportToMarkdown 互逆，但也容错处理手动编辑的文件。
 */
export function importFromMarkdown(text: string): Bookmark[] {
  const lines = text.split('\n')
  const bookmarks: Bookmark[] = []

  let current: Partial<Bookmark> | null = null
  let currentUrl = ''

  for (const line of lines) {
    const titleMatch = line.match(TITLE_RE)

    // 遇到新仓库标题 → 保存上一个，开始新的
    if (titleMatch) {
      if (current && currentUrl) {
        bookmarks.push(finalizeBookmark(current, currentUrl))
      }
      currentUrl = titleMatch[3].trim()
      current = {
        owner: titleMatch[1].trim(),
        repo: titleMatch[2].trim(),
        url: currentUrl,
      }
      continue
    }

    if (!current || !currentUrl) continue

    const desc = extractField(line, '描述')
    if (desc !== null) {
      current.description = desc === '（无描述）' ? '' : desc
      continue
    }

    if (line.includes('**Star**') || line.includes('**Fork**')) {
      const meta = parseMetaLine(line)
      current.stars = meta.stars
      current.forks = meta.forks
      current.language = meta.language
      continue
    }

    const category = extractField(line, '分类')
    if (category !== null) {
      current.category = category
      continue
    }

    const tagsValue = extractField(line, '标签')
    if (tagsValue !== null) {
      current.tags = parseTags(tagsValue)
      continue
    }

    const summary = extractField(line, '摘要')
    if (summary !== null) {
      current.summary = summary
      continue
    }

    const dateValue = extractField(line, '收藏时间')
    if (dateValue !== null) {
      current.createdAt = parseDate(dateValue)
      continue
    }
  }

  // 循环里只在遇到下一条标题时才落笔，最后一条在这里补上
  if (current && currentUrl) {
    bookmarks.push(finalizeBookmark(current, currentUrl))
  }

  return bookmarks
}

/** 把逐行累积出的残缺字段补成完整收藏 */
function finalizeBookmark(
  partial: Partial<Bookmark>,
  url: string,
): Bookmark {
  const now = Date.now()
  return {
    id: bookmarkId(url),
    url,
    owner: partial.owner ?? '',
    repo: partial.repo ?? '',
    description: partial.description ?? '',
    stars: partial.stars ?? 0,
    forks: partial.forks ?? 0,
    language: partial.language ?? null,
    topics: [],
    summary: partial.summary ?? '',
    category: partial.category ?? null,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
  }
}
