import { X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { readToken } from '@/lib/cssVar'
import { useUiStore } from '@/store/uiStore'

/** Brief messages such as "Copied" or "That file isn't a Chalkline diagram". */
export function Notice() {
  const notice = useUiStore((s) => s.notice)
  const dismiss = useUiStore((s) => s.dismissNotice)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(dismiss, readToken('--cl-toast-duration', 5000))
    return () => window.clearTimeout(timer)
  }, [notice, dismiss])

  return (
    <div aria-live="polite" className="flex justify-center px-4">
      {notice && (
        <Panel role="status" className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full py-0 pr-1 pl-4 shadow-lg">
          <span className="min-w-0 text-sm">{notice.text}</span>
          <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={dismiss} className="rounded-full">
            <X />
          </Button>
        </Panel>
      )}
    </div>
  )
}
