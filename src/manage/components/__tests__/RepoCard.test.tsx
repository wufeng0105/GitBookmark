import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RepoCard from '@/manage/components/RepoCard'
import type { Bookmark } from '@/lib/types'

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const url = overrides.url ?? 'https://github.com/a/b'
  return {
    id: url.toLowerCase(),
    url,
    owner: 'a',
    repo: 'b',
    description: '仓库描述',
    stars: 100,
    forks: 10,
    language: 'TypeScript',
    topics: ['react'],
    summary: 'AI 生成的摘要',
    category: '测试分类',
    tags: ['标签一'],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  }
}

function renderCard(overrides: Partial<Bookmark> = {}, selected = false) {
  const handlers = {
    onToggleSelect: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onReanalyze: vi.fn(),
  }
  const bookmark = makeBookmark(overrides)
  const utils = render(
    <RepoCard bookmark={bookmark} selected={selected} {...handlers} />,
  )
  return { bookmark, handlers, ...utils }
}

describe('RepoCard', () => {
  it('RC-01: 渲染仓库名、摘要与分类徽标，不再渲染标签徽章', () => {
    renderCard()

    expect(screen.getByText('a/b')).toBeInTheDocument()
    expect(screen.getByText('AI 生成的摘要')).toBeInTheDocument()
    expect(screen.getByText('测试分类')).toBeInTheDocument()
    // 标签/topics 徽章行已移除：数据仍存于存储，仅不再占卡片视觉位
    expect(screen.queryByText('标签一')).not.toBeInTheDocument()
    expect(screen.queryByText('react')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '在 GitHub 打开 a/b' }),
    ).toHaveAttribute('href', 'https://github.com/a/b')
  })

  it('RC-02: 编辑/重新分析/删除按钮触发对应回调', () => {
    const { bookmark, handlers } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: /编辑 a\/b/ }))
    fireEvent.click(screen.getByRole('button', { name: /重新分析 a\/b/ }))
    fireEvent.click(screen.getByRole('button', { name: /删除 a\/b/ }))

    expect(handlers.onEdit).toHaveBeenCalledWith(bookmark)
    expect(handlers.onReanalyze).toHaveBeenCalledWith([bookmark.id])
    expect(handlers.onDelete).toHaveBeenCalledWith(bookmark.id)
  })

  it('RC-03: 勾选选择框触发 onToggleSelect', () => {
    const { handlers } = renderCard()

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 a/b' }))

    expect(handlers.onToggleSelect).toHaveBeenCalledWith(
      'https://github.com/a/b',
    )
  })

  it('RC-04: selected 时展示选中态（primary 边框 + 选择框勾选）', () => {
    const { container } = renderCard({}, true)

    expect(container.firstChild).toHaveClass('border-primary')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('RC-05: 摘要缺失时回退原始描述', () => {
    renderCard({ topics: [], summary: '' })

    expect(screen.getByText('仓库描述')).toBeInTheDocument()
  })

  it('RC-06: 语言色点仅在有官方色值时渲染，并带 title', () => {
    // 已收录语言：渲染色点且可悬停查看语言名
    const dart = renderCard({ language: 'Dart' })
    expect(dart.getByTitle('Dart')).toBeInTheDocument()

    // 未收录语言：不渲染（不再出现透明隐形点）
    const cobol = renderCard({ language: 'COBOL' })
    expect(cobol.queryByTitle('COBOL')).not.toBeInTheDocument()

    // 无主语言：不渲染
    const nullLang = renderCard({ language: null })
    expect(nullLang.container.querySelector('span[title]')).toBeNull()
  })
})
