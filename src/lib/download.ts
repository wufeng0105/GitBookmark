/** 触发浏览器下载一份文本文件（用于导出与替换前快照） */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'application/json',
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
