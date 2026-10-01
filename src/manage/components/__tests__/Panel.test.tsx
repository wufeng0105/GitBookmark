import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Key } from 'lucide-react'
import Panel from '@/manage/components/Panel'

describe('Panel', () => {
  it('PN-01: 渲染图标、标题、说明、内容与底部操作区', () => {
    render(
      <Panel
        icon={Key}
        title="GitHub Token"
        description="API 调用与备份共用"
        secondary={<button>从文件读取</button>}
        primary={<button>保存</button>}
      >
        <p>表单内容</p>
      </Panel>,
    )

    expect(screen.getByText('GitHub Token')).toBeInTheDocument()
    expect(screen.getByText('API 调用与备份共用')).toBeInTheDocument()
    expect(screen.getByText('表单内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '从文件读取' })).toBeInTheDocument()
  })

  it('PN-02: 单列模块：无通栏网格类，模块头/内容/尾部结构完整', () => {
    const { container } = render(
      <Panel title="批量添加" primary={<button>开始</button>}>
        <p>内容</p>
      </Panel>,
    )

    const section = container.firstElementChild!
    expect(section).not.toHaveClass('xl:col-span-2')
    expect(section.querySelector('header')).toBeInTheDocument()
    expect(section.querySelector('footer')).toBeInTheDocument()
  })

  it('PN-03: 落位约定——主操作靠右、辅助靠左', () => {
    const { container } = render(
      <Panel title="导入收藏" secondary={<button>辅助</button>} primary={<button>主操作</button>}>
        <p>内容</p>
      </Panel>,
    )

    const footer = container.querySelector('footer')!
    const groups = footer.querySelectorAll(':scope > div')
    expect(groups).toHaveLength(2)
    expect(groups[0]).not.toHaveClass('ml-auto')
    expect(groups[1]).toHaveClass('ml-auto')
  })

  it('PN-04: 无操作槽时不渲染模块尾', () => {
    const { container } = render(
      <Panel title="纯展示">
        <p>内容</p>
      </Panel>,
    )

    expect(container.querySelector('footer')).not.toBeInTheDocument()
  })
})
