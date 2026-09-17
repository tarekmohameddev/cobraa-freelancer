import React from 'react'
import { Image, Languages, MessageSquare } from 'lucide-react'
import type { AppView } from '@renderer/components/AppShell'

const NAV_ITEMS: { id: AppView; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'chat', label: 'AI Chat', Icon: MessageSquare },
  { id: 'translate', label: 'Translate', Icon: Languages },
  { id: 'ocr', label: 'Image to Text', Icon: Image }
]

export function Sidebar({
  view,
  setView,
  userLabel
}: {
  view: AppView
  setView: (v: AppView) => void
  userLabel: string
}) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-white/60 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
      {/* App title + user */}
      <div className="px-5 pb-3 pt-5">
        <div className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Cobraa
        </div>
        <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{userLabel}</div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={[
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              view === id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
            ].join(' ')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer label */}
      <div className="px-4 py-4">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          Powered by Otek / MiMouse AI
        </div>
      </div>
    </div>
  )
}
