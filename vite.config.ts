import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import path from 'path'

/**
 * Chrome 扩展中 Vite 默认的 crossorigin 属性和 modulepreload 标签
 * 会导致 "cross-world extension resource mismatch" 警告，
 * 且预加载的模块实际不可用。此插件在构建时移除这些属性。
 */
function stripCrossOrigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html: string) {
      return html
        .replace(/\s+crossorigin(="")?/g, '')
        .replace(
          /<link\s+rel="modulepreload"[^>]*>\s*/g,
          '',
        )
    },
  }
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), stripCrossOrigin()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    modulePreload: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
