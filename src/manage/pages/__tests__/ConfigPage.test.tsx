import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/lib/messaging', () => ({
  sendMessage: vi.fn().mockResolvedValue(null),
}))

import ConfigPage from '@/manage/pages/ConfigPage'
import { DEFAULT_SETTINGS } from '@/shared/constants'
import type { Bookmark } from '@/lib/types'

function renderPage(settingsOverrides = {}) {
  const handlers = {
    onSave: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn().mockResolvedValue(undefined),
  }
  const bookmarks: Bookmark[] = []
  const utils = render(
    <ConfigPage
      bookmarks={bookmarks}
      settings={{ ...DEFAULT_SETTINGS, ...settingsOverrides }}
      version="1.0.0"
      {...handlers}
    />,
  )
  return { handlers, ...utils }
}

describe('ConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('CF-01: 渲染六个模块与页脚版本号', () => {
    renderPage()

    for (const title of [
      'GitHub Token',
      'DeepSeek AI',
      '批量添加',
      '导入收藏',
      '导出收藏',
      '云端备份',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('设置与数据')).toBeInTheDocument()
  })

  it('CF-02: 模型名称可自由输入', () => {
    renderPage({ deepseekModel: 'deepseek-v4-flash' })

    const input = screen.getByLabelText('模型名称') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'deepseek-v99-experimental' } })

    expect(input.value).toBe('deepseek-v99-experimental')
  })

  it('CF-03: 点击预设标签填充模型输入框', () => {
    renderPage({ deepseekModel: '' })

    fireEvent.click(screen.getByText('deepseek-reasoner'))

    expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe(
      'deepseek-reasoner',
    )
  })

  it('CF-04: 无改动时保存禁用；改动后启用并只提交该模块字段', () => {
    const { handlers } = renderPage({
      deepseekApiKey: 'sk-old',
      deepseekModel: 'deepseek-v4-flash',
    })

    // DeepSeek 模块的保存按钮初始禁用（同模块内第一个保存按钮是 Token 模块的）
    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    expect(saveButtons[0]).toBeDisabled() // Token 未改动
    expect(saveButtons[1]).toBeDisabled() // DeepSeek 未改动

    fireEvent.change(screen.getByLabelText('模型名称'), {
      target: { value: 'deepseek-v4-pro' },
    })
    expect(saveButtons[1]).toBeEnabled()

    fireEvent.click(saveButtons[1])
    expect(handlers.onSave).toHaveBeenCalledWith({ deepseekModel: 'deepseek-v4-pro' })
  })

  it('CF-05: 标题行 meta 展示收藏数与配置状态', () => {
    renderPage({ deepseekApiKey: 'sk-x', gistId: 'abc' })

    expect(screen.getByText(/DeepSeek 已配置/)).toBeInTheDocument()
    expect(screen.getByText(/已配置 Gist 备份/)).toBeInTheDocument()
  })
})
