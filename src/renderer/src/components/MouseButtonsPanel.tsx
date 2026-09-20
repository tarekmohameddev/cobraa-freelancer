import React from 'react'
import { Mouse, Trash2, X } from 'lucide-react'
import { getApi, type MouseAction, type MouseServiceStatus } from '@renderer/lib/ipc'

const ACTIONS: Array<{ id: MouseAction; label: string; hint: string }> = [
  { id: 'translate', label: 'Translate', hint: 'Click: open Translate with clipboard · Double: translate clipboard' },
  { id: 'ai', label: 'Cobraa AI', hint: 'Click: open Cobraa AI · Long press: hold to talk · Double: quick prompt overlay' },
  { id: 'voice', label: 'Voice', hint: 'Hold button (or F8 anywhere) to talk into active app · Release to insert · Double: switch EN/AR' },
  { id: 'ocr', label: 'OCR', hint: 'Click: quick capture · Double: open Image to Text' }
]

function signatureFor(status: MouseServiceStatus, action: MouseAction) {
  return Object.entries(status.bindings).find(([, mapped]) => mapped === action)?.[0] ?? null
}

export function MouseButtonsPanel({
  status,
  onClose
}: {
  status: MouseServiceStatus
  onClose: () => void
}) {
  const deviceName = status.devices[0]?.name ?? 'No AI mouse detected'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Mouse className="h-4 w-4" />
            <div className="text-sm font-semibold">Mouse extra buttons</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="font-medium text-zinc-800 dark:text-zinc-200">{deviceName}</div>
            <div className="mt-1 text-zinc-500 dark:text-zinc-400">
              {status.running
                ? status.error
                  ? status.error
                  : status.learning
                    ? 'Waiting for the extra mouse button. Press only that one extra button — not left/right, and do not type.'
                    : 'Click Map, then press that physical extra button — or use the always-on-top mouse-sim app (npm run mouse-sim).'
                : 'Listener is not running. Restart the app after connecting the mouse.'}
            </div>
            {status.lastRawSignature ? (
              <div className="mt-1 font-mono text-[11px] text-zinc-500">Last signal: {status.lastRawSignature}</div>
            ) : null}
          </div>

          {ACTIONS.map((a) => {
            const sig = signatureFor(status, a.id)
            const mapping = status.learning === a.id
            return (
              <div key={a.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{a.label}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{a.hint}</div>
                    <div className="mt-1 font-mono text-[11px] text-zinc-500">
                      {mapping ? 'Press the extra button now…' : sig ? sig : 'Not mapped'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        mapping ? void getApi().mouseCancelLearn() : void getApi().mouseStartLearn(a.id)
                      }
                      className={[
                        'rounded-lg border px-3 py-1.5 text-xs font-medium',
                        mapping
                          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900'
                      ].join(' ')}
                    >
                      {mapping ? 'Listening…' : 'Map'}
                    </button>
                    {sig ? (
                      <button
                        type="button"
                        onClick={() => void getApi().mouseClearBinding(a.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                        title="Clear mapping"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => void getApi().mouseClearAll()}
            className="text-xs text-zinc-500 underline-offset-2 hover:underline"
          >
            Clear all mappings
          </button>
        </div>
      </div>
    </div>
  )
}
