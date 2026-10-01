import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FieldRow from '@/manage/components/FieldRow'

describe('FieldRow', () => {
  it('FR-01: 行式排布：标签与控件通过 htmlFor 关联', () => {
    render(
      <FieldRow label="Token" htmlFor="tok">
        <input id="tok" />
      </FieldRow>,
    )

    expect(screen.getByLabelText('Token')).toBeInTheDocument()
  })

  it('FR-02: stacked 模式标签在上、控件全宽', () => {
    const { container } = render(
      <FieldRow label="粘贴 URL" htmlFor="urls" stacked>
        <textarea id="urls" />
      </FieldRow>,
    )

    expect(container.querySelector('.flex-col')).toBeInTheDocument()
    expect(screen.getByLabelText('粘贴 URL')).toBeInTheDocument()
  })

  it('FR-03: hint 落在控件列下方，窄标签列只放标签', () => {
    const { container } = render(
      <FieldRow label="Token" htmlFor="tok" hint="提高 API 速率限制，私有仓库收藏必需">
        <input id="tok" />
      </FieldRow>,
    )

    const labelCol = container.querySelector('.w-32')!
    expect(labelCol.textContent).toBe('Token')
    expect(screen.getByText('提高 API 速率限制，私有仓库收藏必需')).toBeInTheDocument()
  })
})
