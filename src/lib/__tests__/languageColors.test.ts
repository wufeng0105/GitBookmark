import { describe, it, expect } from 'vitest'
import { languageColor, LANGUAGE_COLORS } from '@/lib/languageColors'

describe('languageColor', () => {
  it('LC-01: 收录语言返回 GitHub Linguist 官方色值', () => {
    expect(languageColor('TypeScript')).toBe('#3178c6')
    expect(languageColor('Dart')).toBe('#00B4AB')
    expect(languageColor('Clojure')).toBe('#db5855')
    expect(languageColor('Jupyter Notebook')).toBe('#DA5B0B')
  })

  it('LC-02: null 与未收录语言返回 undefined（调用方据此不渲染，避免透明色点）', () => {
    expect(languageColor(null)).toBeUndefined()
    expect(languageColor('COBOL')).toBeUndefined()
  })

  it('LC-03: 全部色值为 6 位合法 hex', () => {
    for (const [lang, hex] of Object.entries(LANGUAGE_COLORS)) {
      expect(hex, lang).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
