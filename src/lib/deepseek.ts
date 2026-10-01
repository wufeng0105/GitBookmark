import {
  DEEPSEEK_API_URL,
  DEEPSEEK_API_TIMEOUT,
  DEEPSEEK_MAX_TOKENS,
  README_MAX_LENGTH,
  ANALYZE_CONCURRENCY,
} from '@/shared/constants'
import { mapWithLimit } from '@/lib/concurrency'
import type {
  RepoMeta,
  AIAnalysisResult,
  Settings,
  Bookmark,
  BatchAnalyzeOutput,
} from '@/lib/types'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string }
  }>
}

/**
 * 语言规范指令，所有 prompt 共用。
 * 摘要、分类、标签必须用简体中文，专有名词保留英文。
 */
const LANGUAGE_DIRECTIVE = `重要：所有输出内容（摘要、分类名称、标签）必须使用简体中文。
专有名词、技术术语、库名、框架名保留英文原文（如 React、TypeScript、LLM、Docker）。
例如：正确示范「React 是一个用于构建用户界面的 JavaScript 库」，错误示范「React is a JavaScript library for building UI」。`

// ─── 类型安全辅助函数 ──────────────────────────────────────

/** 检查值是否为对象 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** 校验 DeepSeek API 响应结构 */
function isChatCompletionResponse(data: unknown): data is ChatCompletionResponse {
  if (!isObject(data)) return false
  if (!Array.isArray(data.choices)) return false
  if (data.choices.length === 0) return false
  const first = data.choices[0] as Record<string, unknown>
  if (!isObject(first) || !isObject(first.message)) return false
  return typeof first.message.content === 'string'
}

/** 从 unknown 中安全提取字符串 */
function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** 从 unknown 中安全提取字符串数组 */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((item): item is string => typeof item === 'string')
}

/** 调用 DeepSeek Chat Completion */
async function chat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  temperature = 0.3,
): Promise<string> {
  let res: Response
  try {
    res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: DEEPSEEK_MAX_TOKENS,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(DEEPSEEK_API_TIMEOUT),
    })
  } catch (err: unknown) {
    // 包装 fetch 网络错误（超时、断网等）为用户友好的中文提示，cause 保留原始错误供排查
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('DeepSeek API 响应超时，请重试（V4 thinking 模式可能需要更长推理时间）', { cause: err })
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('DeepSeek API 请求被中断，请重试', { cause: err })
    }
    throw new Error('DeepSeek API 网络请求失败，请检查网络后重试', { cause: err })
  }

  if (res.status === 400) {
    const text = await res.text().catch(() => '')
    let hint = '请检查请求参数'
    // DeepSeek 实际返回 "Model Not Exist"（大写 M），需大小写不敏感匹配
    if (text.toLowerCase().includes('model')) {
      hint = '当前模型名不被支持，请在「设置」页切换模型后重试'
    }
    console.error('[GitBookmark] DeepSeek 400 详情:', text)
    throw new Error(`DeepSeek API 请求无效: ${hint}`)
  }
  if (res.status === 401) {
    throw new Error('DeepSeek API Key 无效，请在设置中检查')
  }
  if (res.status === 429) {
    throw new Error('DeepSeek API 调用频率超限，请稍后重试')
  }
  if (res.status >= 500) {
    throw new Error('DeepSeek 服务暂时不可用，请稍后重试')
  }
  if (!res.ok) {
    throw new Error(`DeepSeek API 错误: ${res.status}`)
  }

  const data: unknown = await res.json()
  if (!isChatCompletionResponse(data)) {
    throw new Error('DeepSeek API 返回数据格式异常')
  }
  return data.choices[0].message.content
}

/**
 * 从 AI 输出中提取 JSON。
 * 候选链：整体解析 → 逐个 ``` 围栏内容 → 首尾大括号截取。
 * 先整体解析的原因：JSON 字符串值内部可能合法地含有三反引号，
 * 围栏正则会把它误判为代码块边界导致截断。
 */
export function extractJSON<T>(raw: string): T {
  const candidates: string[] = [raw]
  for (const match of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    candidates.push(match[1])
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1))
  }

  for (const text of candidates) {
    try {
      return JSON.parse(text) as T
    } catch {
      // 该候选不是合法 JSON 就换下一个，全部候选都失败才报错
    }
  }
  throw new Error('AI 返回内容无法解析为 JSON，请重试')
}

/**
 * 校验并规范化单个 AI 分析结果：字段缺失或类型不对时收敛为可用的空值，
 * 不让模型输出的形制问题传导到存储层和界面。
 */
function normalizeAnalysisResult(item: unknown): AIAnalysisResult {
  if (!isObject(item)) {
    return { summary: '', category: '', suggestedTags: [] }
  }
  return {
    summary: asString(item.summary),
    category: asString(item.category),
    // 兼容 AI 可能返回 "tags" 而非 "suggestedTags"
    suggestedTags: asStringArray(item.suggestedTags ?? item.tags),
  }
}

/**
 * 固定两级分类体系：大类 + 每个大类允许的小类，分类的唯一权威来源。
 * AI 只能整表选用、禁止自造，从根上避免收藏页分类碎片化。
 * 调整分类只需改这张表：prompt 由它生成，历史数据不受影响。
 *
 * 大类按 GitHub 仓库生态划分（8 个，依据高星仓库 topics 聚合校准）；
 * AI 相关小类保留较多细分，其余大类按用途归并。
 */
export const CATEGORY_TAXONOMY: Record<string, string[]> = {
  'AI 智能体与模型': [
    'Agent 框架',
    '智能体应用',
    'GUI 智能体',
    '运行时与沙箱',
    '技能包',
    '提示词工具',
    '评测与安全',
    '示例与教程',
    '模型网关',
    '连接器与集成',
    '远程控制端',
  ],
  '编程与开发工具': ['代码理解与检索', '开发工作流'],
  '内容与媒体': ['内容工具', '创作技能', '运营与变现', '录屏', '视频剪辑', '编程式生成'],
  '数据采集与解析': ['采集与抓取', '下载工具', '代理与网络', '文档解析', 'OCR', 'Office 自动化'],
  '可视化与数据平台': ['BI 与仪表盘', '监控与态势', '图表渲染', '低代码平台'],
  '编辑器与笔记': ['Markdown 编辑器', '笔记插件'],
  '桌面与系统工具': ['剪贴板管理', '输入与语音', '系统定制', '安装与镜像'],
  '服务与基础设施': ['自托管服务', '数据 API'],
}

/** 固定分类体系渲染为 prompt 用的多行清单 */
function taxonomyPrompt(): string {
  return Object.entries(CATEGORY_TAXONOMY)
    .map(([top, subs], i) => `${i + 1}. ${top}：${subs.join('、')}`)
    .join('\n')
}

/** 单一摘要规格：2-3 句覆盖核心信息，正好填满收藏卡片的三行 */
const SUMMARY_DIRECTIVE =
  '摘要为 2-3 句（80-150 字），一段话连续写完，覆盖：\n' +
  '1. 项目是什么、解决什么问题\n' +
  '2. 核心能力（1-2 个最关键的）\n' +
  '3. 技术栈或形态（语言、框架、部署方式）\n' +
  '4. 适用场景\n' +
  '示例：「Vite 是新一代前端构建工具，基于原生 ESM 实现闪电级冷启动和 HMR。' +
  '内置 Rollup 打包、CSS 预处理器支持和 TypeScript 开箱即用，适用于现代 Web 项目开发。」\n' +
  '硬约束：\n' +
  '- 严格基于本次提供的 README 和描述，不得引入 README 没有的信息\n' +
  '- 禁止营销腔（「强大」「极致」「一站式」）和「README 提到」这类元话语\n' +
  '- 专有名词保留英文，不要在末尾附加免责声明或补充说明'

// ─── 单仓库分析 ───────────────────────────────────────────

/**
 * system prompt：分类规则、摘要规则与语言规范，单仓库分析与批量分析共用一份。
 */
function buildSystemPrompt(): string {
  return `你是一个专业的技术项目分析师。用户正在收藏 GitHub 仓库，你需要：
1. 为仓库生成智能摘要——基于 README 内容和描述，准确概括项目核心功能、技术栈和适用场景
2. 从固定分类体系中选择分类
3. 为仓库推荐标签

分类规则：
- 必须先从下方固定分类体系中选一个大类，再从该大类的小类表里选一个小类，组成「大类 / 小类」（如「AI 智能体与模型 / GUI 智能体」）
- 绝对禁止创建新分类，禁止使用固定体系之外的任何分类名；没有完美匹配时选语义最接近的
- 禁止使用「其他」「未分类」「工具」等笼统兜底词

固定分类体系：
${taxonomyPrompt()}

摘要规则：
${SUMMARY_DIRECTIVE}

标签规则：
- 推荐 1-3 个标签，只保留高区分度的特征词（技术名、平台、形态、领域），如 tldraw、Obsidian、自托管、语音输入
- 禁止无区分度的废话标签（如「开源」「工具」「AI」「效率」）

请返回严格的 JSON 格式，不要添加任何额外文本。

${LANGUAGE_DIRECTIVE}`
}

/** 为单个仓库构建 user prompt：元数据、README 片段、已有分类与标签，末尾给出期望的 JSON 结构 */
function buildSingleUserPrompt(meta: RepoMeta, existingCategories: string[], existingTags: string[]): string {
  const readmeSection = meta.readmeContent
    ? `\nREADME 摘要：\n${meta.readmeContent.slice(0, README_MAX_LENGTH)}`
    : 'README：（无）'

  return `请分析以下 GitHub 仓库：

${meta.owner}/${meta.repo}
描述：${meta.description || '（无描述）'}
语言：${meta.language || '未知'}
Topics：${meta.topics.join(', ') || '无'}
Star：${meta.stars}
${readmeSection}

${
  existingCategories.length > 0
    ? `用户已有的分类（「大类 / 小类」格式）：${existingCategories.join('、')}\n（这些分类均来自上方固定体系，请优先复用其中与仓库最匹配的）`
    : '用户还没有任何分类，请直接从固定分类体系中选择。'
}
${existingTags.length > 0 ? `\n用户已有的标签：${existingTags.join('、')}` : ''}

返回 JSON 对象：
{
  "summary": "简体中文摘要内容",
  "category": "固定体系中的「大类 / 小类」分类名",
  "suggestedTags": ["简体中文标签1", "简体中文标签2"]
}`
}

/**
 * 分析单个仓库：独立调用 DeepSeek API，生成摘要、分类、标签。
 * 失败时抛出异常，由调用方决定如何处理。
 */
async function analyzeSingleRepo(
  meta: RepoMeta,
  settings: Settings,
  existingCategories: string[],
  existingTags: string[],
): Promise<AIAnalysisResult> {
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildSingleUserPrompt(meta, existingCategories, existingTags)

  const raw = await chat(
    settings.deepseekApiKey,
    settings.deepseekModel,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    0.3,
  )

  const parsed = extractJSON<unknown>(raw)

  // 兼容单对象和 { results: [单对象] } 两种结构
  const item = isObject(parsed) && Array.isArray(parsed.results)
    ? parsed.results[0]
    : parsed

  return normalizeAnalysisResult(item)
}

// ─── 分类归一化 ───────────────────────────────────────────

/**
 * 分类名的去重 key：去掉所有空白并转小写。
 * 「前端框架」「前端 框架」视为同一分类。
 */
function canonicalCategoryKey(category: string): string {
  return category.replace(/\s/g, '').toLowerCase()
}

/**
 * 分类名的规范展示值：全角斜杠、无空格半角斜杠统一收敛为「 / 」分隔，
 * 两级分类（大类 / 小类）各段去除首尾空白。
 */
function canonicalCategoryValue(category: string): string {
  const parts = category.split(/[/／]/)
  if (parts.length >= 2) {
    const top = parts[0].trim()
    const sub = parts.slice(1).join('/').trim()
    return `${top} / ${sub}`
  }
  return category.trim()
}

/**
 * 将相似分类名归一化为同一名称。
 * 例如「前端框架」和「前端 框架」→ 统一为「前端框架」
 *
 * 同时把「大类 / 小类」的分隔符收敛为统一写法（全角斜杠、无空格半角斜杠 → 「 / 」），
 * 避免同一分类因格式差异在收藏页裂成多个分组。
 *
 * 策略：对每个分类名生成一个简化 key（去空格、转小写），
 * 如果 key 已存在，则使用先出现的分类名。
 */
function normalizeCategories(results: AIAnalysisResult[]): AIAnalysisResult[] {
  const categoryMap = new Map<string, string>()

  // 第一轮：收集所有分类名，建立归一化映射
  for (const r of results) {
    if (!r.category) continue
    const key = canonicalCategoryKey(r.category)
    if (!categoryMap.has(key)) {
      categoryMap.set(key, canonicalCategoryValue(r.category))
    }
  }

  // 第二轮：用归一化后的分类名替换
  return results.map((r) => {
    if (!r.category) return r
    const key = canonicalCategoryKey(r.category)
    const normalized = categoryMap.get(key)
    return normalized ? { ...r, category: normalized } : r
  })
}

// ─── 批量分析（并发调度） ──────────────────────────────────

/**
 * 批量分析多个仓库：每个仓库独立并发调用 DeepSeek API，部分失败不影响整体。
 *
 * @param metas 多个仓库的元数据（含 README 内容）
 * @param existingBookmarks 已有收藏（用于参考已有分类和标签）
 * @param settings 用户设置（用于 API Key、模型等）
 * @returns results 与 metas 等长（失败项为空结果）；failures 为失败清单（含下标）
 */
export async function batchAnalyzeRepos(
  metas: RepoMeta[],
  existingBookmarks: Bookmark[],
  settings: Settings,
): Promise<BatchAnalyzeOutput> {
  if (metas.length === 0) return { results: [], failures: [] }

  const existingCategories = Array.from(
    new Set(
      existingBookmarks
        .map((b) => b.category)
        .filter((c): c is string => c !== null && c !== ''),
    ),
  )

  const existingTags = Array.from(
    new Set(existingBookmarks.flatMap((b) => b.tags)),
  )

  const settled = await mapWithLimit(metas, ANALYZE_CONCURRENCY, (meta) =>
    analyzeSingleRepo(meta, settings, existingCategories, existingTags),
  )

  const failures: BatchAnalyzeOutput['failures'] = []
  const results: AIAnalysisResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') {
      return s.value
    }
    const meta = metas[i]
    const error = s.reason instanceof Error ? s.reason.message : String(s.reason)
    failures.push({
      index: i,
      repo: `${meta.owner}/${meta.repo}`,
      error,
    })
    console.error(`[GitBookmark] AI 分析失败 ${meta.owner}/${meta.repo}:`, error)
    return { summary: '', category: '', suggestedTags: [] }
  })

  if (failures.length > 0) {
    console.warn(
      `[GitBookmark] ${failures.length}/${metas.length} 个仓库 AI 分析失败: ${failures.map((f) => f.repo).join(', ')}`,
    )
  }

  // 后处理：分类名归一化，确保相似分类合并
  return { results: normalizeCategories(results), failures }
}
