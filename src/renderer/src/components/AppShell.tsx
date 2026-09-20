import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bug, Camera, LogOut, MessageSquare, Moon, Mouse, Settings as SettingsIcon, Sun } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { Sidebar } from '@renderer/components/Sidebar'
import { DebugPanel } from '@renderer/components/DebugPanel'
import { MouseButtonsPanel } from '@renderer/components/MouseButtonsPanel'
import { ChatPage } from '@renderer/pages/ChatPage'
import { TranslatePage } from '@renderer/pages/TranslatePage'
import { OcrPage } from '@renderer/pages/OcrPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { HistoryPage } from '@renderer/pages/HistoryPage'
import { ChatProvider } from '@renderer/context/ChatContext'
import { useDebugLog } from '@renderer/hooks/useDebugLog'
import { useMouseStatus } from '@renderer/hooks/useMouseStatus'
import { getApi, type MouseButtonEvent } from '@renderer/lib/ipc'

export type AppView =
  | 'chat'
  | 'translate'
  | 'ocr'
  | 'quick-ocr'
  | 'voice'
  | 'history'
  | 'faq'
  | 'settings'

const PAGE_INFO: Record<AppView, { title: string; subtitle: string }> = {
  chat: {
    title: 'Cobraa AI',
    subtitle: 'Mic: EN / AR · replies appear in this thread'
  },
  translate: {
    title: 'Translate',
    subtitle: 'AI-powered text translation'
  },
  ocr: {
    title: 'Image to Text',
    subtitle: 'Drop, paste or pick an image to extract its text'
  },
  'quick-ocr': {
    title: 'OCR',
    subtitle: 'Screen region capture & instant optical character recognition'
  },
  voice: {
    title: 'Voice',
    subtitle: 'Real-time voice dictation & speech recognition'
  },
  history: {
    title: 'History',
    subtitle: 'Your conversation history and generated documents'
  },
  faq: {
    title: 'FAQ',
    subtitle: 'Frequently asked questions, help, and user documentation'
  },
  settings: {
    title: 'Settings',
    subtitle: 'System preferences, shortcuts and model configurations'
  }
}

function InnerAppShell({
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
  const [translateSeed, setTranslateSeed] = useState({
    text: '',
    token: 0,
    auto: false,
    result: '',
    from: '',
    to: ''
  })
  const [lastMouse, setLastMouse] = useState<MouseButtonEvent | null>(null)
  const [mock, setMock] = useState(false)

  useEffect(() => {
    void getApi()
      .apiMode()
      .then((res) => setMock(Boolean(res.mock)))
      .catch(() => {})
  }, [])

  const goToTranslate = useCallback((text: string) => {
    setTranslateSeed((prev) => ({ text, token: prev.token + 1, auto: false, result: '', from: '', to: '' }))
    setView('translate')
  }, [])

  useEffect(() => {
    return getApi().onMouseButton((evt) => {
      setLastMouse(evt)
      if (evt.action === 'translate' && (evt.gesture === 'click' || evt.gesture === 'double')) {
        const source = evt.originalText || evt.clipboardText || ''
        const translated = evt.translatedText || ''
        setTranslateSeed((prev) => ({
          text: source,
          token: prev.token + 1,
          auto: !translated,
          result: translated,
          from: evt.from || '',
          to: evt.to || ''
        }))
        setView('translate')
      } else if (evt.action === 'ai' && (evt.gesture === 'click' || evt.gesture === 'double' || evt.gesture === 'long')) {
        setView('chat')
      } else if (evt.action === 'ocr' && evt.gesture === 'click') {
        void getApi().quickCaptureStart()
      } else if (evt.action === 'ocr' && evt.gesture === 'double') {
        setView('ocr')
      }
    })
  }, [])

  useEffect(() => {
    return getApi().onChatAutoSend(() => {
      setView('chat')
    })
  }, [])

  const { title, subtitle } = PAGE_INFO[view]
  const userLabel = session?.email ? session.email : `User #${session?.userId ?? ''}`

  return (
    <div className="h-full flex">
      <Sidebar view={view} setView={setView} userLabel={userLabel} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Shared top bar */}
        <div
          className="relative flex h-10 shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white px-4 pr-36 select-none dark:border-zinc-800 dark:bg-zinc-950"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {view !== 'chat' && (
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold">{title}</div>
                {mock ? (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    Mock APIs
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Full-width bottom border line */}
          <div
            className="absolute inset-x-0 bottom-0 h-px bg-zinc-200 dark:bg-zinc-800 pointer-events-none"
            aria-hidden="true"
          />

          {/* Vertical divider line immediately to the left of '-' window control button */}
          <div
            className="absolute right-[140px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-800 pointer-events-none"
            aria-hidden="true"
          />

          {/* Top-bar action buttons commented out as requested */}
          {/*
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#00007B]/20 bg-[#00007B]/5 text-[#00007B] transition hover:bg-[#00007B]/10 dark:border-[#00007B]/40 dark:bg-[#00007B]/20 dark:text-blue-300 dark:hover:bg-[#00007B]/30"
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
          */}
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
              initialResult={translateSeed.result}
              initialFrom={translateSeed.from}
              initialTo={translateSeed.to}
            />
          </div>
          {view === 'ocr' && <OcrPage onSendToTranslate={goToTranslate} />}

          {view === 'quick-ocr' && (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-white dark:bg-zinc-950 select-none">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#00007B]/10 border border-[#00007B]/20 text-[#00007B] dark:text-blue-300 mb-5 shadow-sm">
                <Camera className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
                Quick Screen OCR
              </h2>
              <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                Capture any screen region to extract text instantly with AI optical recognition.
              </p>
              <button
                type="button"
                onClick={() => void getApi().quickCaptureStart()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#00007B] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#00007B]/25 transition hover:bg-[#000060]"
              >
                <Camera className="h-4 w-4" />
                <span>Start Screen Capture</span>
              </button>
            </div>
          )}

          {view === 'voice' && (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-white dark:bg-zinc-950 select-none">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#00007B]/10 border border-[#00007B]/20 text-[#00007B] dark:text-blue-300 mb-5 shadow-sm">
                <span className="text-2xl">🎙️</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
                Voice Assistant & Dictation
              </h2>
              <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                Use your AI mouse or hotkeys to dictate in Arabic and English, transcribe audio, or talk directly with Cobraa AI.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView('settings')}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <SettingsIcon className="h-4 w-4" />
                  <span>Voice Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView('chat')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#00007B] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#00007B]/25 transition hover:bg-[#000060]"
                >
                  <span>Open Cobraa AI Chat</span>
                </button>
              </div>
            </div>
          )}

          {view === 'settings' && <SettingsPage />}

          {view === 'history' && <HistoryPage onOpenChat={() => setView('chat')} />}

          {/* Fallback view for other suite tools */}
          {view !== 'chat' && view !== 'translate' && view !== 'ocr' && view !== 'quick-ocr' && view !== 'voice' && view !== 'settings' && view !== 'history' && (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-white dark:bg-zinc-950 select-none">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#00007B]/5 dark:bg-[#00007B]/20 border border-[#00007B]/15 text-[#00007B] dark:text-blue-300 mb-4 shadow-sm">
                <span className="text-xl font-bold">{title.charAt(0)}</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
                {title}
              </h2>
              <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                {subtitle}
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#00007B]/20 bg-[#00007B]/5 px-3.5 py-1.5 text-xs font-semibold text-[#00007B] dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300">
                <span className="h-2 w-2 rounded-full bg-[#00007B] dark:bg-blue-400 animate-pulse" />
                <span>Feature in active development for Cobraa</span>
              </div>
            </div>
          )}
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

export function AppShell({
  theme,
  setTheme
}: {
  theme: 'light' | 'dark'
  setTheme: (t: 'light' | 'dark') => void
}) {
  return (
    <ChatProvider>
      <InnerAppShell theme={theme} setTheme={setTheme} />
    </ChatProvider>
  )
}

