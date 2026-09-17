import React from 'react'
import type { DebugEvent } from '@renderer/lib/ipc'

function formatJson(v: unknown) {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export function DebugPanel({
  events,
  onClose,
  onClear
}: {
  events: DebugEvent[]
  onClose: () => void
  onClear: () => void
}) {
  return (
    <div className="flex h-full w-[420px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="text-sm font-semibold">Debug (API)</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Close
            </button>
          </div>
        </div>

        <div className="h-[calc(100%-52px)] overflow-auto p-3">
          {events.length === 0 ? (
            <div className="p-3 text-sm text-zinc-500 dark:text-zinc-400">No debug events yet.</div>
          ) : (
            <div className="space-y-3">
              {events
                .slice()
                .reverse()
                .map((e, idx) => (
                  <div key={`${e.ts}-${idx}`} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
                      <div className="min-w-0 truncate font-medium">{e.category}</div>
                      <div className="shrink-0 text-zinc-500 dark:text-zinc-400">{new Date(e.ts).toLocaleTimeString()}</div>
                    </div>
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {formatJson(e.data)}
                    </pre>
                  </div>
                ))}
            </div>
          )}
        </div>
    </div>
  )
}

