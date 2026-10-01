import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RepoDetailCard from '@/components/RepoDetailCard'
import { SUMMARY_COLLAPSE_THRESHOLD } from '@/shared/constants'

function renderCard(overrides: Partial<Parameters<typeof RepoDetailCard>[0]> = {}) {
  const props = {
    owner: 'facebook',
    repo: 'react',
    description: 'The library for web and native user interfaces.',
    stars: 220000,
    forks: 45000,
    language: 'JavaScript',
    summary: 'React 是一个用于构建用户界面的 JavaScript 库。',
    category: '前端框架',
    tags: ['React', 'UI库'],
    ...overrides,
  }
  return render(<RepoDetailCard {...props} />)
}

describe('RepoDetailCard', () => {
  it('RD-01: 渲染仓库标题与描述', () => {
    renderCard()

    expect(screen.getByText('facebook/react')).toBeInTheDocument()
    expect(
      screen.getByText('The library for web and native user interfaces.'),
    ).toBeInTheDocument()
  })

  it('RD-02: 显示 Star/Fork 缩写与语言 Badge', () => {
    renderCard({ stars: 220000, forks: 45000 })

    expect(screen.getByText('220.0k')).toBeInTheDocument()
    expect(screen.getByText('45.0k')).toBeInTheDocument()
    expect(screen.getByText('JavaScript')).toBeInTheDocument()
  })

  it('RD-03: Star/Fork 为 0 且语言为空时省略对应元素', () => {
    renderCard({ stars: 0, forks: 0, language: null })

    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('RD-04: 超长摘要折叠并可展开/收起', () => {
    const longSummary = '长'.repeat(SUMMARY_COLLAPSE_THRESHOLD + 20)
    renderCard({ summary: longSummary })

    const truncated = longSummary.slice(0, SUMMARY_COLLAPSE_THRESHOLD) + '…'
    expect(screen.getByText(truncated)).toBeInTheDocument()
    expect(screen.queryByText(longSummary)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('展开全部'))
    expect(screen.getByText(longSummary)).toBeInTheDocument()

    fireEvent.click(screen.getByText('收起'))
    expect(screen.getByText(truncated)).toBeInTheDocument()
  })

  it('RD-05: 短摘要不显示展开按钮', () => {
    renderCard({ summary: '短摘要' })
    expect(screen.queryByText('展开全部')).not.toBeInTheDocument()
    expect(screen.getByText('短摘要')).toBeInTheDocument()
  })

  it('RD-06: 分类与标签渲染为 Badge，标签最多展示 8 个', () => {
    renderCard({
      category: '前端框架',
      tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    })

    expect(screen.getByText('前端框架')).toBeInTheDocument()
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument()
    }
    expect(screen.queryByText('9')).not.toBeInTheDocument()
    expect(screen.queryByText('10')).not.toBeInTheDocument()
  })

  it('RD-07: 空描述/空摘要/空分类/空标签时不渲染对应区块', () => {
    renderCard({ description: '', summary: '', category: null, tags: [] })

    expect(screen.queryByText('AI 摘要')).not.toBeInTheDocument()
    expect(screen.queryByText('前端框架')).not.toBeInTheDocument()
  })
})
