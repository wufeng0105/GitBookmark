import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 下划线前缀 = 有意不使用（如 onMessage 的 _sender），与 tsc 的 noUnusedParameters 口径一致
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 管理页存在「组件文件同时导出类型/常量」的惯用法，不作强制
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['*.config.js', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
)
