import {
  MESSAGE_TIMEOUT,
  GITHUB_API_TIMEOUT,
  DEEPSEEK_API_TIMEOUT,
  ANALYZE_CONCURRENCY,
} from '@/shared/constants'
import type { MessageAction, MessageResponse, MessagePayloadMap, MessageReturnMap } from '@/lib/types'

/**
 * 批量分析/重新分析在后台是两轮受限并发（GitHub 元数据 + AI 分析），总耗时随仓库数线性增长，
 * 固定超时会在大批量时先于后台完成而误报「消息超时」——因此按「波数 × 单仓最坏耗时」放大，
 * 其余消息沿用 MESSAGE_TIMEOUT 基线。
 */
function timeoutFor(action: MessageAction, payload: unknown): number {
  const count =
    action === 'BATCH_ANALYZE'
      ? (payload as MessagePayloadMap['BATCH_ANALYZE'] | undefined)?.urls.length ?? 0
      : action === 'REANALYZE'
        ? (payload as MessagePayloadMap['REANALYZE'] | undefined)?.ids.length ?? 0
        : 0
  if (count === 0) return MESSAGE_TIMEOUT
  const waves = Math.ceil(count / ANALYZE_CONCURRENCY)
  return waves * (GITHUB_API_TIMEOUT + DEEPSEEK_API_TIMEOUT) + MESSAGE_TIMEOUT
}

/** 向 background service worker 发送消息并等待响应 */
export function sendMessage<K extends MessageAction>(
  action: K,
  ...args: MessagePayloadMap[K] extends undefined ? [] : [payload: MessagePayloadMap[K]]
): Promise<MessageReturnMap[K]> {
  const payload = args[0]

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('消息超时，请重试'))
    }, timeoutFor(action, payload))

    chrome.runtime.sendMessage(
      { action, payload },
      (response: MessageResponse<MessageReturnMap[K]>) => {
        clearTimeout(timer)
        if (chrome.runtime.lastError) {
          const enMsg = chrome.runtime.lastError.message || ''
          // Chrome MV3 常见英文错误 → 中文提示
          let cnMsg: string
          if (enMsg.includes('message port closed')) {
            cnMsg = '后台服务连接中断，请重试'
          } else if (enMsg.includes('Could not establish connection')) {
            cnMsg = '无法连接后台服务，请刷新页面后重试'
          } else {
            cnMsg = `后台通信错误: ${enMsg}`
          }
          reject(new Error(cnMsg))
          return
        }
        if (!response) {
          reject(new Error('未收到响应'))
          return
        }
        if (!response.success) {
          reject(new Error(response.error ?? '未知错误'))
          return
        }
        resolve(response.data as MessageReturnMap[K])
      },
    )
  })
}
