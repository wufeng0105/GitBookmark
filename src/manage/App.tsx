import { useState, useEffect, useCallback } from 'react'
import { Loader2, Bookmark as BookmarkIcon, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { sendMessage } from '@/lib/messaging'
import type { Bookmark, Settings } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/shared/constants'
import { useBookmarkFilter } from '@/hooks/useBookmarks'
import Sidebar from './components/Sidebar'
import BookmarksPage from './pages/BookmarksPage'
import ConfigPage from './pages/ConfigPage'

type PageId = 'bookmarks' | 'config'

interface NavItem {
  id: string
  label: string
  Icon: LucideIcon
}

/** 导航项由 App 统一定义并下发侧栏，避免两处各写一份导致名称漂移 */
const MENU_ITEMS: NavItem[] = [
  { id: 'bookmarks', label: '收藏', Icon: BookmarkIcon },
  { id: 'config', label: '设置与数据', Icon: SettingsIcon },
]

export default function App() {
  const [page, setPage] = useState<PageId>('bookmarks')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Bookmark | null>(null)
  const filter = useBookmarkFilter(bookmarks)

  const refreshBookmarks = useCallback(async () => {
    try {
      const data = await sendMessage('GET_BOOKMARKS')
      setBookmarks(data)
    } catch (err) {
      toast.error('加载收藏失败', {
        description: (err as Error).message,
      })
    }
  }, [])

  const refreshSettings = useCallback(async () => {
    try {
      const data = await sendMessage('GET_SETTINGS')
      setSettings(data)
    } catch (err) {
      toast.error('加载设置失败', {
        description: (err as Error).message,
      })
    }
  }, [])

  useEffect(() => {
    // 进入页面拉取初始数据：setState 均发生在回调中，数据获取惯用法豁免
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([refreshBookmarks(), refreshSettings()]).finally(() =>
      setLoading(false),
    )
  }, [refreshBookmarks, refreshSettings])

  // 支持从 ?edit=<收藏 id> 直达该条收藏的编辑弹窗；处理即清参，避免刷新页面重弹
  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get('edit')
    if (!editId) return
    window.history.replaceState(null, '', chrome.runtime.getURL('manage.html'))

    let cancelled = false
    ;(async () => {
      try {
        const all = await sendMessage('GET_BOOKMARKS')
        if (cancelled) return
        const target = all.find((b) => b.id === editId)
        if (target) {
          setEditTarget(target)
          setPage('bookmarks')
        } else {
          toast.warning('未找到要编辑的收藏，可能已被删除')
        }
      } catch (err) {
        toast.error('加载收藏失败', { description: (err as Error).message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSaveSettings = async (patch: Partial<Settings>) => {
    try {
      const updated = await sendMessage('UPDATE_SETTINGS', { patch })
      setSettings(updated)
      toast.success('设置已保存')
    } catch (err) {
      toast.error('保存设置失败', { description: (err as Error).message })
    }
  }

  const version =
    typeof chrome !== 'undefined' && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : 'dev'

  // 离开收藏页时重置筛选态，避免回来时停留在莫名的过滤视图
  const handleNavigate = (id: string) => {
    setPage(id as PageId)
    if (id !== 'bookmarks') filter.clearFilters()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        items={MENU_ITEMS}
        activePage={page}
        onNavigate={handleNavigate}
        totalCount={bookmarks.length}
        tree={filter.categoryTree}
        activeTop={filter.activeTop}
        activeSub={filter.activeSub}
        hasActiveFilters={filter.hasActiveFilters}
        onSelectTop={filter.setActiveTop}
        onSelectSub={filter.setActiveSub}
        onClearFilters={filter.clearFilters}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {page === 'bookmarks' ? (
          <BookmarksPage
            bookmarks={bookmarks}
            onRefresh={refreshBookmarks}
            editTarget={editTarget}
            onEditComplete={() => setEditTarget(null)}
            filter={filter}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <ConfigPage
              bookmarks={bookmarks}
              settings={settings}
              version={version}
              onSave={handleSaveSettings}
              onRefresh={refreshBookmarks}
            />
          </div>
        )}
      </main>
    </div>
  )
}
