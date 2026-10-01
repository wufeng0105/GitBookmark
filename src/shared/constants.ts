/** chrome.storage.local 的三个键：收藏列表、设置、设置写入审计 */
export const STORAGE_KEYS = {
  BOOKMARKS: 'gitbookmark_bookmarks',
  SETTINGS: 'gitbookmark_settings',
  SETTINGS_AUDIT: 'gitbookmark_settings_audit',
} as const

/** 设置写入审计保留的条目数上限 */
export const SETTINGS_AUDIT_MAX = 20

/** DeepSeek Chat Completion 端点 */
export const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

/** DeepSeek 开放平台首页：设置页「获取 API Key」的跳转地址 */
export const DEEPSEEK_PLATFORM_URL = 'https://platform.deepseek.com'

/** GitHub REST API 根地址 */
export const GITHUB_API_URL = 'https://api.github.com'

/** GitHub Token 创建页：repo 覆盖公共与私有仓库读取，gist 用于云端备份；必须是经典 token，fine-grained token 不支持 Gist */
export const GITHUB_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo,gist&description=GitBookmark'

/** Gist 备份文件名 */
export const GIST_FILENAME = 'gitbookmark-backup.json'

/** Gist 备份描述 */
export const GIST_DESCRIPTION = 'GitBookmark Cloud Backup'

/** 默认设置 */
export const DEFAULT_SETTINGS = {
  deepseekApiKey: '',
  githubToken: '',
  deepseekModel: 'deepseek-v4-flash',
  gistId: '',
}

/** Markdown 导出文件的一级标题 */
export const MARKDOWN_HEADER = '# GitBookmark 收藏列表'

/** Chrome 消息超时基线 (ms) — 覆盖单仓最坏耗时（DEEPSEEK_API_TIMEOUT + GITHUB_API_TIMEOUT）外加余量；
 *  批量分析/重新分析的发送端超时按仓库数在此基线上放大，规则见 messaging.ts */
export const MESSAGE_TIMEOUT = 180_000

/** GitHub API 请求超时 (ms) */
export const GITHUB_API_TIMEOUT = 15_000

/** DeepSeek API 请求超时 (ms) — V4 thinking 模式默认开启，推理时间较长，需 120s */
export const DEEPSEEK_API_TIMEOUT = 120_000

// ─── 内容截取与展示限制 ───────────────────────────────────

/** 送入 prompt 的 README 长度上限：够 AI 把握项目核心，又不撑爆上下文 */
export const README_MAX_LENGTH = 2000

/** 单次批量分析的仓库数上限：每个仓库独立调用 API，靠上限压住限流风险 */
export const BATCH_ANALYZE_MAX = 100

/** 批量分析的外部请求并发上限（GitHub 元数据与 DeepSeek AI 共用，防限流） */
export const ANALYZE_CONCURRENCY = 6

/** DeepSeek API 单次响应最大 token 数 */
export const DEEPSEEK_MAX_TOKENS = 4096

/** Popup 摘要折叠阈值（超过此字数时折叠，点击展开看全部） */
export const SUMMARY_COLLAPSE_THRESHOLD = 80

/** Star 数格式化阈值（≥ 此值时显示为 k 单位） */
export const STAR_FORMAT_THRESHOLD = 1000

/** Gist ID 预览截断长度 */
export const GIST_ID_PREVIEW_LENGTH = 12

/** 字段最大长度限制（防止导入数据过大） */
export const FIELD_MAX_LENGTH = {
  SUMMARY: 5000,
  CATEGORY: 100,
  TAG: 50,
  DESCRIPTION: 1000,
} as const

/** 标签最大数量限制 */
export const MAX_TAGS_COUNT = 20
