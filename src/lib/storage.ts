import { STORAGE_KEYS, DEFAULT_SETTINGS, SETTINGS_AUDIT_MAX } from '@/shared/constants'
import type { Bookmark, Settings } from '@/lib/types'

// ─── Bookmarks ────────────────────────────────────────────

/** 读取全部收藏 */
export async function getBookmarks(): Promise<Bookmark[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS)
  return (result[STORAGE_KEYS.BOOKMARKS] as Bookmark[]) ?? []
}

/** 全量覆盖写入收藏列表：只在队列内调用 */
async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.BOOKMARKS]: bookmarks })
}

/** 收藏 ID：仓库 URL 去掉尾部斜杠并统一小写，调用方需先归一化子路径形态 */
export function bookmarkId(url: string): string {
  return url.replace(/\/$/, '').toLowerCase()
}

/**
 * 写入串行化队列工厂。后台会并发处理多条消息，收藏列表又是整份读写，
 * 「读全量→改→写全量」交错时后完成者会拿旧快照覆盖先完成者的写入，
 * 因此所有列表写操作都排进同一队列串行执行。
 */
function createWriteQueue() {
  let queue: Promise<unknown> = Promise.resolve()
  return <T>(op: () => Promise<T>): Promise<T> => {
    const result = queue.then(op)
    queue = result.catch(() => {})
    return result
  }
}

const enqueueBookmarkWrite = createWriteQueue()
const enqueueSettingsWrite = createWriteQueue()

/**
 * 批量添加收藏：已存在则合并覆盖，不存在则插入到头部。
 * 单次存储写入，优于逐条调用。
 */
export function addBookmarksBatch(newBookmarks: Bookmark[]): Promise<Bookmark[]> {
  return enqueueBookmarkWrite(async () => {
    if (newBookmarks.length === 0) return getBookmarks()

    const bookmarks = await getBookmarks()
    const idMap = new Map<string, number>()
    bookmarks.forEach((b, i) => idMap.set(b.id, i))

    // 逆序插入，保持 newBookmarks 顺序
    for (let i = newBookmarks.length - 1; i >= 0; i--) {
      const bookmark = newBookmarks[i]
      const idx = idMap.get(bookmark.id)
      if (idx !== undefined) {
        bookmarks[idx] = { ...bookmarks[idx], ...bookmark }
      } else {
        bookmarks.unshift(bookmark)
        // 重建索引映射（unshift 后所有索引偏移）
        idMap.clear()
        bookmarks.forEach((b, j) => idMap.set(b.id, j))
      }
    }

    await saveBookmarks(bookmarks)
    return bookmarks
  })
}

/** 批量更新收藏：按 id 给每条打补丁，单次存储写入 */
export function updateBookmarksBatch(
  updates: Array<{ id: string; patch: Partial<Bookmark> }>,
): Promise<Bookmark[]> {
  return enqueueBookmarkWrite(async () => {
    if (updates.length === 0) return getBookmarks()

    const bookmarks = await getBookmarks()
    const idSet = new Set(updates.map((u) => u.id))
    const now = Date.now()

    for (let i = 0; i < bookmarks.length; i++) {
      if (idSet.has(bookmarks[i].id)) {
        const update = updates.find((u) => u.id === bookmarks[i].id)
        if (update) {
          bookmarks[i] = { ...bookmarks[i], ...update.patch, updatedAt: now }
        }
      }
    }

    await saveBookmarks(bookmarks)
    return bookmarks
  })
}

/** 更新单个收藏 */
export function updateBookmark(
  id: string,
  patch: Partial<Bookmark>,
): Promise<Bookmark[]> {
  return enqueueBookmarkWrite(async () => {
    const bookmarks = await getBookmarks()
    const idx = bookmarks.findIndex((b) => b.id === id)
    if (idx >= 0) {
      bookmarks[idx] = { ...bookmarks[idx], ...patch, updatedAt: Date.now() }
      await saveBookmarks(bookmarks)
    }
    return bookmarks
  })
}

/** 删除单个收藏 */
export function deleteBookmark(id: string): Promise<Bookmark[]> {
  return enqueueBookmarkWrite(async () => {
    const bookmarks = await getBookmarks()
    const filtered = bookmarks.filter((b) => b.id !== id)
    await saveBookmarks(filtered)
    return filtered
  })
}

/** 批量删除收藏 */
export function deleteBookmarks(ids: string[]): Promise<Bookmark[]> {
  return enqueueBookmarkWrite(async () => {
    const idSet = new Set(ids)
    const bookmarks = await getBookmarks()
    const filtered = bookmarks.filter((b) => !idSet.has(b.id))
    await saveBookmarks(filtered)
    return filtered
  })
}

/** 全量替换收藏列表：导入替换与云端恢复的入口 */
export function replaceBookmarks(bookmarks: Bookmark[]): Promise<void> {
  return enqueueBookmarkWrite(() => saveBookmarks(bookmarks))
}

// ─── Settings ─────────────────────────────────────────────

/** 废弃模型名 → 现行模型名，读取存储时换算 */
const MODEL_MIGRATION: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
}

/** 按上表换算废弃取值；纯函数，不写存储 */
function migrateSettings(settings: Settings): Settings {
  const model = MODEL_MIGRATION[settings.deepseekModel]
  return {
    ...settings,
    deepseekModel: model ?? settings.deepseekModel,
  }
}

/** 读取设置：缺失字段用默认值补齐，废弃取值只在内存中换算，不回写存储 */
export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
  const stored = result[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined
  return migrateSettings({ ...DEFAULT_SETTINGS, ...stored })
}

/** 设置写入审计条目：只记来源与字段名，不含字段值，避免密钥明文落盘 */
interface SettingsAuditEntry {
  at: number
  source: string
  fields: string[]
}

/** 追加一条写入审计，超出 SETTINGS_AUDIT_MAX 的旧记录被丢弃 */
async function appendSettingsAudit(source: string, fields: string[]): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS_AUDIT)
  const audit = (result[STORAGE_KEYS.SETTINGS_AUDIT] as SettingsAuditEntry[] | undefined) ?? []
  audit.unshift({ at: Date.now(), source, fields })
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS_AUDIT]: audit.slice(0, SETTINGS_AUDIT_MAX),
  })
}

/**
 * 合并式更新设置：设置的唯一写入入口。
 * 调用方只提交变更字段，队列内完成读-合并-写并返回完整设置；
 * 若整对象提交，长期停留在旧页面的调用方会把别处刚写入的值覆盖回去。
 * source 为写入来源（消息 action 名），每次写入落一条审计，用于追查覆盖发生的成因。
 */
export function updateSettings(
  patch: Partial<Settings>,
  source = 'unknown',
): Promise<Settings> {
  return enqueueSettingsWrite(async () => {
    const merged = migrateSettings({ ...(await getSettings()), ...patch })
    await saveSettings(merged)
    await appendSettingsAudit(source, Object.keys(patch)).catch((err: unknown) => {
      console.warn('[GitBookmark] 设置写入审计记录失败', err)
    })
    return merged
  })
}

/** 设置的底层写入原语：只在队列内调用，外部一律走 updateSettings */
async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings })
}
