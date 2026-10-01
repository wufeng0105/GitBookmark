import '@testing-library/jest-dom'

// 测试环境的 chrome.* API 替身
const chromeMock = {
  storage: {
    local: {
      data: {} as Record<string, unknown>,
      async get(keys: string | string[]) {
        const keyArr = Array.isArray(keys) ? keys : [keys]
        const result: Record<string, unknown> = {}
        for (const k of keyArr) {
          if (k in this.data) result[k] = this.data[k]
        }
        return result
      },
      async set(items: Record<string, unknown>) {
        Object.assign(this.data, items)
      },
      clear() {
        this.data = {}
      },
    },
  },
  runtime: {
    lastError: undefined as chrome.runtime.LastError | undefined,
    sendMessage(_msg: unknown, callback?: (resp: unknown) => void) {
      if (callback) callback({ success: true, data: undefined })
    },
    openOptionsPage() {},
    getURL(path: string) {
      return `chrome-extension://test-id/${path}`
    },
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  },
  tabs: {
    query: async () => [{ url: 'https://github.com/facebook/react' }],
    create: (_props: unknown) => {},
  },
  contextMenus: {
    create: () => {},
    onClicked: { addListener: () => {} },
  },
}

;(globalThis as unknown as Record<string, unknown>).chrome = chromeMock
