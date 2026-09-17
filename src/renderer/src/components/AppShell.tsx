import React, { useCallback, useEffect, useState } from 'react'
import { Bug, Camera, LogOut, Moon, Mouse, Sun } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { Sidebar } from '@renderer/components/Sidebar'
import { DebugPanel } from '@renderer/components/DebugPanel'
import { MouseButtonsPanel } from '@renderer/components/MouseButtonsPanel'
import { ChatPage } from '@renderer/pages/ChatPage'
import { TranslatePage } from '@renderer/pages/TranslatePage'
import { OcrPage } from '@renderer/pages/OcrPage'
import { useDebugLog } from '@renderer/hooks/useDebugLog'
import { useMouseStatus } from '@renderer/hooks/useMouseStatus'
import { getApi, type MouseButtonEvent } from '@renderer/lib/ipc'

export type AppView = 'chat' | 'translate' | 'ocr'

const PAGE_INFO: Record<AppView, { title: string; subtitle: string }> = {
  chat: {
    title: 'AI Assistant Chat',
    subtitle: 'Mic: EN / AR · replies appear in this thread'
  },
  translate: {
    title: 'Translate',
    subtitle: 'AI-powered text translation'
  },
  ocr: {
    title: 'Image to Text',
    subtitle: 'Drop, paste or pick an image to extract its text'
  }
}

export function AppShell({
  theme,
  setTheme
}: {
  theme: 'light' | 'dark'
  setTheme: (t: 'light' | 'dark') => void
}) {
  const { session, logout } = useAuth()
  const [view, setView] = useState<AppView>('chat')
  const [debugOpen, setDebugOpen] = useState(false)
  const [mouseOpen, setMouseOpen] = useState(false)
  const { events: debugEvents, clear: clearDebug } = useDebugLog()
  const mouseStatus = useMouseStatus()
  const [translateSeed, setTranslateSeed] = useState({ text: '', token: 0, auto: false })
  const [lastMouse, setLastMouse] = useState<MouseButtonEvent | null>(null)
  const [mock, setMock] = useState(false)

  useEffect(() => {
    void getApi()
      .apiMode()
      .then((res) => setMock(Boolean(res.mock)))
      .catch(() => {})
  }, [])

  const goToTranslate = useCallback((text: string) => {
    setTranslateSeed((prev) => ({ text, token: prev.token + 1, auto: false }))
    setView('translate')
  }, [])

  useEffect(() => {
    return getApi().onMouseButton((evt) => {
      setLastMouse(evt)
      if (evt.action === 'translate' && (evt.gesture === 'click' || evt.gesture === 'double')) {
        setTranslateSeed((prev) => ({
          text: evt.clipboardText || '',
          token: prev.token + 1,
          auto: evt.gesture === 'double'
        }))
        setView('translate')
      } else if (evt.action === 'ai' && (evt.gesture === 'click' || evt.gesture === 'double')) {
        setView('chat')
      } else if (evt.action === 'ocr' && evt.gesture === 'click') {
        void getApi().quickCaptureStart()
      } else if (evt.action === 'ocr' && evt.gesture === 'double') {
        setView('ocr')
      } else if (evt.action === 'voice' && (evt.gesture === 'click' || evt.gesture === 'double' || evt.gesture === 'long')) {
        setView('chat')
      }
    })
  }, [])

  const { title, subtitle } = PAGE_INFO[view]
  const userLabel = session?.email ? session.email : `User #${session?.userId ?? ''}`

  return (
    <div className="h-full flex">
      <Sidebar view={view} setView={setView} userLabel={userLabel} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Shared top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/70 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">{title}</div>
              {mock ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  Mock APIs
                </span>
              ) : null}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {subtitle}
              {lastMouse ? (
                <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                  {lastMouse.action} {lastMouse.gesture}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-xl border transition',
                debugOpen
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900'
              ].join(' ')}
              title={debugOpen ? 'Hide debug panel' : 'Show debug panel'}
            >
              <Bug className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setMouseOpen(true)}
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-xl border transition',
                mouseStatus?.learning
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900'
              ].join(' ')}
              title="Map mouse extra buttons"
            >
              <Mouse className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => void getApi().quickCaptureStart()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/70"
              title="Quick Capture — select screen region to OCR + translate"
            >
              <Camera className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>

        {/* Page content */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={view === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <ChatPage />
          </div>
          <div className={view === 'translate' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <TranslatePage
              initialText={translateSeed.text}
              initToken={translateSeed.token}
              autoTranslate={translateSeed.auto}
            />
          </div>
          {view === 'ocr' && <OcrPage onSendToTranslate={goToTranslate} />}
        </div>
      </div>

      {mouseOpen ? (
        <MouseButtonsPanel
          status={
            mouseStatus ?? {
              running: false,
              error: 'Waiting for mouse listener…',
              devices: [],
              bindings: {},
              learning: null,
              lastEvent: null,
              lastRawSignature: null
            }
          }
          onClose={() => setMouseOpen(false)}
        />
      ) : null}

      {debugOpen && (
        <DebugPanel events={debugEvents} onClose={() => setDebugOpen(false)} onClear={clearDebug} />
      )}
    </div>
  )
}
