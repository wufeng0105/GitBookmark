/** 常用编程语言的 GitHub 语言色（GitHub Linguist 官方色值） */
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Go: '#00ADD8',
  Rust: '#dea584',
  Python: '#3572A5',
  Java: '#b07219',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Shell: '#89e051',
  Vue: '#41b883',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Lua: '#000080',
  Zig: '#ec915c',
  // 以下为按收藏数据与常见语言补充
  Dart: '#00B4AB',
  Clojure: '#db5855',
  'Jupyter Notebook': '#DA5B0B',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
  Scala: '#c22d40',
  Makefile: '#427819',
  Dockerfile: '#384d54',
  PowerShell: '#012456',
  Markdown: '#083fa1',
  'Objective-C': '#438eff',
  R: '#198CE7',
}

/** 未收录语言返回 undefined，调用方需降级为不渲染色点（而非渲染透明色点） */
export function languageColor(language: string | null): string | undefined {
  return language ? LANGUAGE_COLORS[language] : undefined
}
