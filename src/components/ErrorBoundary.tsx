import React from 'react'
import { Button } from '@/components/ui/button'

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GitBookmark] 渲染错误:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-5xl opacity-50">😵</div>
          <div>
            <p className="text-sm font-medium text-foreground">页面出了点问题</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {this.state.error?.message || '未知错误'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            重试
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
