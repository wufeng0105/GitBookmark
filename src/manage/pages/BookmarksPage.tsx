import { useState, useEffect } from 'react'
import { Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { sendMessage } from '@/lib/messaging'
import type { Bookmark } from '@/lib/types'
import { useBookmarkFilter } from '@/hooks/useBookmarks'
import { useSelection } from '@/hooks/useSelection'
import { cn } from '@/lib/utils'
import { PAGE_CONTAINER } from '@/lib/layout'
import RepoCard from '../components/RepoCard'
import EditModal from '../components/EditModal'
import BatchToolbar from '../components/BatchToolbar'
import PageToolbar from '../components/PageToolbar'
import FilterChips from '../components/FilterChips'
import AddBookmarkDialog from '../components/AddBookmarkDialog'

interface BookmarksPageProps {
  bookmarks: Bookmark[]
  onRefresh: () => Promise<void>
  editTarget: Bookmark | null
  onEditComplete: () => void
  filter: ReturnType<typeof useBookmarkFilter>
}

/** 每页渲染的卡片数；超出后出现「加载更多」，避免大数据量下一次性全量渲染 */
const PAGE_SIZE = 90

export default function BookmarksPage({
  bookmarks,
  onRefresh,
  editTarget,
  onEditComplete,
  filter,
}: BookmarksPageProps) {
  const {
    search,
    setSearch,
    activeTop,
    setActiveTop,
    activeSub,
    setActiveSub,
    activeLanguage,
    setActiveLanguage,
    sortBy,
    setSortBy,
    allLanguages,
    groups,
    filtered,
    hasActiveFilters,
    clearFilters,
  } = filter

  const [editOpen, setEditOpen] = useState(false)
  const [editBookmark, setEditBookmark] = useState<Bookmark | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [visibleBudget, setVisibleBudget] = useState(PAGE_SIZE)

  // 筛选条件变化时重置分页预算（等价状态重置）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleBudget(PAGE_SIZE)
  }, [search, activeTop, activeSub, activeLanguage])

  // 批量勾选：筛选条件拼接串作 resetKey，任一筛选变化自动清空勾选
  const resetKey = `${search}|${activeTop ?? ''}|${activeSub ?? ''}|${activeLanguage ?? ''}`
  const {
    selected,
    toggle: toggleSelect,
    clear: clearSelection,
    allSelected,
    toggleAll: toggleSelectAll,
  } = useSelection(filtered, resetKey)

  // App 传入的 editTarget 变化时打开编辑弹窗（Popup ?edit= 直达的跨组件联动；提升弹窗状态可消除，属专门迭代）
  useEffect(() => {
    if (editTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditBookmark(editTarget)
      setEditOpen(true)
    }
  }, [editTarget])

  const handleEdit = (bookmark: Bookmark) => {
    setEditBookmark(bookmark)
    setEditOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await sendMessage('DELETE_BOOKMARK', { id })
      toast.success('已删除')
      await onRefresh()
    } catch (err) {
      toast.error('删除失败', { description: (err as Error).message })
    }
  }

  const handleBatchDelete = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    try {
      await sendMessage('DELETE_BOOKMARK', { ids })
      toast.success(`已删除 ${ids.length} 项`)
      clearSelection()
      await onRefresh()
    } catch (err) {
      toast.error('批量删除失败', { description: (err as Error).message })
    }
  }

  const handleReanalyze = async (ids: string[]) => {
    setReanalyzing(true)
    try {
      const result = await sendMessage('REANALYZE', { ids })
      if (result.reanalyzed > 0) {
        toast.success(`已重新分析 ${result.reanalyzed} 个仓库`)
      }
      if (result.failed.length > 0) {
        toast.warning(`${result.failed.length} 个仓库重新分析失败`, {
          description: result.failed
            .slice(0, 5)
            .map(
              (f) =>
                `${f.url.replace('https://github.com/', '')}：${f.error}`,
            )
            .join('\n'),
        })
      }
      await onRefresh()
      // 重新分析成功后清空勾选：结果已刷新，排序可能变化，避免勾选与可视状态脱节
      clearSelection()
    } catch (err) {
      toast.error('重新分析失败', { description: (err as Error).message })
    } finally {
      setReanalyzing(false)
    }
  }

  const handleBatchReanalyze = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    handleReanalyze(ids)
  }

  // 标题：选中某小类显示小类，仅选大类显示大类，否则全部收藏
  const title = activeSub ?? activeTop ?? '全部收藏'
  const titleCount = filtered.length

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Package className="h-10 w-10 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-medium">还没有收藏</p>
          <p className="mt-1 text-xs text-muted-foreground">
            在 GitHub 页面点击插件图标，或点击右上角「添加收藏」
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：搜索 / 语言 / 排序 / 添加 */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-6 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className={PAGE_CONTAINER}>
          <PageToolbar
            search={search}
            onSearch={setSearch}
            languages={allLanguages}
            activeLanguage={activeLanguage}
            onLanguage={setActiveLanguage}
            sortBy={sortBy}
            onSort={setSortBy}
            onAdd={() => setAddOpen(true)}
          />
        </div>
      </header>

      {/* 标题与生效筛选 */}
      <section className="border-b border-border/60 px-6 pb-3 pt-4">
        <div className={PAGE_CONTAINER}>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
              <span className="font-mono text-xs text-muted-foreground">
                {titleCount} 个收藏
              </span>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                清除筛选
              </button>
            )}
          </div>
          <FilterChips
            activeTop={activeTop}
            activeSub={activeSub}
            activeLanguage={activeLanguage}
            matchCount={filtered.length}
            hasActiveFilters={hasActiveFilters}
            onRemoveTop={() => setActiveTop(null)}
            onRemoveSub={() => setActiveSub(null)}
            onRemoveLanguage={() => setActiveLanguage(null)}
          />
        </div>
      </section>

      {/* 卡片区 */}
      <div className="flex-1 overflow-y-auto">
        <div className={PAGE_CONTAINER + " py-4 pb-24"}>
          {reanalyzing && (
            <div
              aria-live="polite"
              className="mb-4 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在重新分析…
            </div>
          )}

          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-xs text-muted-foreground">没有匹配的收藏</p>
            </div>
          ) : (
            <>
              {(() => {
                // 按组顺序消耗分页预算：先满足靠前的分组，再顺延到后续分组
                let budget = visibleBudget
                const paged = groups
                  .map((group) => {
                    const items = group.items.slice(0, Math.max(0, budget))
                    budget -= items.length
                    return { ...group, items }
                  })
                  .filter((group) => group.items.length > 0)
                const shown = paged.reduce((n, g) => n + g.items.length, 0)
                const remaining = filtered.length - shown
                return (
                  <>
                    {paged.map((group) => (
                      <section
                        key={group.top ?? '__filtered'}
                        className={cn('mb-8', group.top === null && 'mb-0')}
                      >
                        {group.top !== null && (
                          <h2 className="mb-3 flex items-baseline gap-2 text-xs font-semibold tracking-tight">
                            {group.top}
                            <span className="font-mono text-[11px] font-normal text-muted-foreground">
                              {group.items.length}
                            </span>
                          </h2>
                        )}
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {group.items.map((b) => (
                            <RepoCard
                              key={b.id}
                              bookmark={b}
                              selected={selected.has(b.id)}
                              onToggleSelect={toggleSelect}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                              onReanalyze={handleReanalyze}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                    {remaining > 0 && (
                      <div className="mt-8 mb-12 flex justify-center">
                        <button
                          onClick={() => setVisibleBudget((v) => v + PAGE_SIZE)}
                          className="h-8 rounded-md border border-border bg-background px-4 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted"
                        >
                          加载更多（剩余 {remaining} 个）
                        </button>
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}
        </div>
      </div>

      {/* 批量操作条（悬浮） */}
      <BatchToolbar
        selectedCount={selected.size}
        allSelected={allSelected}
        onToggleSelectAll={toggleSelectAll}
        onReanalyze={handleBatchReanalyze}
        onDelete={handleBatchDelete}
        onClear={clearSelection}
      />

      {/* 编辑弹窗 */}
      <EditModal
        bookmark={editBookmark}
        open={editOpen}
        onClose={() => {
          setEditOpen(false)
          onEditComplete()
        }}
        onSaved={onRefresh}
      />

      {/* 添加收藏 */}
      <AddBookmarkDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  )
}
