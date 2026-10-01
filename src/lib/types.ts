/** 一条收藏：GitHub 仓库元数据，加上 AI 生成的摘要、分类与标签 */
export interface Bookmark {
  /** 唯一 ID，由归一化后的仓库 URL 生成 */
  id: string
  /** 仓库主页 URL，如 https://github.com/facebook/react */
  url: string
  /** 仓库所有者，如 facebook */
  owner: string
  /** 仓库名，如 react */
  repo: string
  /** GitHub 上的原始描述，保留原文语言不做翻译 */
  description: string
  /** Star 数 */
  stars: number
  /** Fork 数 */
  forks: number
  /** 主要编程语言 */
  language: string | null
  /** GitHub Topics */
  topics: string[]
  /** AI 生成的简体中文摘要 */
  summary: string
  /** AI 建议的简体中文分类 */
  category: string | null
  /** 简体中文标签，专有名词保留英文 */
  tags: string[]
  /** 收藏时间戳 (ms) */
  createdAt: number
  /** 最后更新时间戳 (ms) */
  updatedAt: number
}

/** 用户设置 */
export interface Settings {
  /** DeepSeek API Key，未填写时任何分析动作都会被拒绝 */
  deepseekApiKey: string
  /** GitHub Token：提高 GitHub API 速率上限并读写云端备份 Gist，需 repo + gist 权限的经典 token */
  githubToken: string
  /** 分析用的 DeepSeek 模型名 */
  deepseekModel: string
  /** 云端备份所在 Gist 的 ID，首次备份后写入 */
  gistId: string
}

/**
 * 摘要规格唯一：2-3 句覆盖核心信息（见 deepseek.ts 的 SUMMARY_DIRECTIVE），
 * 不再分档——UI 消费场景（卡片 3 行 / Popup 80 字截断）放不下更长的档位。
 */

/** 从 GitHub API 取回的仓库元数据，含清洗后的 README 文本 */
export interface RepoMeta {
  url: string
  owner: string
  repo: string
  description: string
  stars: number
  forks: number
  language: string | null
  topics: string[]
  /** 清洗并截取后的 README 原文，AI 分析的主要依据 */
  readmeContent: string
}

/** 单个仓库的 AI 分析产出 */
export interface AIAnalysisResult {
  /** 简体中文摘要 */
  summary: string
  /** 简体中文分类 */
  category: string
  /** 简体中文标签 */
  suggestedTags: string[]
}

/** 云端备份的当前状态，供「设置与数据」页展示 */
export interface BackupInfo {
  /** 备份所在 Gist 的 ID */
  gistId: string
  /** Gist 网页地址 */
  gistUrl: string
  /** 最后备份时间 (ISO 字符串) */
  lastBackupAt: string
  /** 备份内的收藏数量 */
  bookmarkCount: number
  /** Gist 描述 */
  description: string
}

/** 本地 JSON 导出与云端 Gist 备份共用的负载格式，两侧产出的文件可互相导入 */
export interface BackupPayload {
  version: number
  exportedAt: string
  bookmarkCount: number
  bookmarks: Bookmark[]
}

// ─── 消息通信类型映射 ─────────────────────────────────────

/**
 * action → payload 的对应表。与下面的 MessageReturnMap 配对：
 * 新增消息必须同时补进两张表，sendMessage 才能推断出参数与返回类型。
 */
export interface MessagePayloadMap {
  BATCH_ANALYZE: { urls: string[] }
  REANALYZE: { ids: string[] }
  ANALYZE_CURRENT: { url: string }
  SAVE_BOOKMARK: { bookmark: Bookmark }
  CHECK_BOOKMARKED: { url: string }
  GET_BOOKMARKS: undefined
  DELETE_BOOKMARK: { id?: string; ids?: string[] }
  UPDATE_BOOKMARK: { id: string; patch: Partial<Bookmark> }
  GET_SETTINGS: undefined
  UPDATE_SETTINGS: { patch: Partial<Settings> }
  EXPORT_JSON: undefined
  IMPORT_JSON: { text: string; mode: 'merge' | 'replace' }
  CLOUD_BACKUP: undefined
  CLOUD_RESTORE: undefined
  CLOUD_BACKUP_INFO: undefined
}

/** 全部后台消息 action 的联合类型 */
export type MessageAction = keyof MessagePayloadMap

/** action → 返回值 的对应表，与 MessagePayloadMap 一一对应 */
export interface MessageReturnMap {
  BATCH_ANALYZE: BatchAnalyzeResult
  REANALYZE: ReanalyzeResult
  ANALYZE_CURRENT: AnalyzeCurrentResult
  SAVE_BOOKMARK: Bookmark[]
  CHECK_BOOKMARKED: CheckBookmarkedResult
  GET_BOOKMARKS: Bookmark[]
  DELETE_BOOKMARK: Bookmark[]
  UPDATE_BOOKMARK: Bookmark[]
  GET_SETTINGS: Settings
  UPDATE_SETTINGS: Settings
  EXPORT_JSON: string
  IMPORT_JSON: Bookmark[]
  CLOUD_BACKUP: BackupInfo
  CLOUD_RESTORE: Bookmark[]
  CLOUD_BACKUP_INFO: BackupInfo | null
}

/** service worker 的统一响应包装，界面层按 success 决定 resolve 还是抛出 error */
export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** 失败清单里的一条：某个仓库 URL 及其失败原因 */
export interface BatchFailure {
  /** 仓库 URL */
  url: string
  /** 简体中文失败原因 */
  error: string
}

/** AI 分析阶段的失败项，用下标回溯到输入的 metas */
export interface AnalyzeFailure {
  /** 在 metas 数组中的下标 */
  index: number
  /** owner/repo 标识 */
  repo: string
  /** 简体中文失败原因 */
  error: string
}

/** 批量分析的产出：与输入等长同序的结果数组，加一份失败清单 */
export interface BatchAnalyzeOutput {
  /** 与 metas 等长同序，失败项为空结果 */
  results: AIAnalysisResult[]
  /** 失败清单，含可用于回溯的下标 */
  failures: AnalyzeFailure[]
}

/** 批量分析的返回：本次写入的收藏、全部收藏、失败清单 */
export interface BatchAnalyzeResult {
  newBookmarks: Bookmark[]
  allBookmarks: Bookmark[]
  /** 元数据获取或 AI 分析未成功的仓库 */
  failed: BatchFailure[]
}

/** 重新分析的返回 */
export interface ReanalyzeResult {
  /** 实际被更新的收藏数 */
  reanalyzed: number
  allBookmarks: Bookmark[]
  /** 元数据获取或 AI 分析未成功的仓库 */
  failed: BatchFailure[]
}

/** 分析当前仓库的返回：Popup 据此渲染详情卡片 */
export interface AnalyzeCurrentResult {
  meta: RepoMeta
  analysis: AIAnalysisResult
}

/** 收藏检测的返回：命中该收藏，未收藏时为 null */
export type CheckBookmarkedResult = Bookmark | null
