import { STAR_FORMAT_THRESHOLD } from '@/shared/constants'

/** Star/Fork 数格式化：≥ STAR_FORMAT_THRESHOLD 时显示为 x.xk，否则原样输出 */
export function formatStars(n: number): string {
  if (n >= STAR_FORMAT_THRESHOLD) {
    return `${(n / STAR_FORMAT_THRESHOLD).toFixed(1)}k`
  }
  return String(n)
}
