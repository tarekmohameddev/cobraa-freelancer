import React, { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Loader2, X } from 'lucide-react'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic (عربي)' },
  { code: 'zh', label: 'Chinese (中文)' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'ru', label: 'Russian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'tr', label: 'Turkish' }
]

const RTL = new Set(['ar', 'he', 'fa', 'ur'])

type ResultData = {
  loading: boolean
  imageBase64: string
  ocrText: string
  translatedText: string
  toLang: string
  error: string | null
}

type CobraaAPI = {
  onQuickCaptureResult?: (cb: (data: ResultData) => void) => (() => void)
  quickCaptureGetData?: () => Promise<ResultData | null>
  quickCaptureRetranslate?: (input: { text: string; from: string; to: string }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
  quickCaptureClose?: () => void
}

function useApi(): CobraaAPI {
  return (window as any).api as CobraaAPI ?? {}
}

export function QuickCaptureResult() {
  const api = useApi()

  const [data, setData] = useState<ResultData>({
    loading: true,
    imageBase64: '',
    ocrText: '',
    translatedText: '',
    toLang: 'en',
    error: null
  })
  const [toLang, setToLang] = useState('en')
  const [retranslating, setRetranslating] = useState(false)
  const [copiedOcr, setCopiedOcr] = useState(false)
  const [copiedTrans, setCopiedTrans] = useState(false)

  // Subscribe to live pushes AND fetch current state on mount
  useEffect(() => {
    const unsub = api.onQuickCaptureResult?.((d) => {
      setData(d)
      if (d.toLang) setToLang(d.toLang)
    })
    void api.quickCaptureGetData?.().then((d) => {
      if (d) {
        setData(d)
        if (d.toLang) setToLang(d.toLang)
      }
    })
    return () => unsub?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetranslate = useCallback(
    async (lang: string) => {
      if (!data.ocrText.trim() || retranslating) return
      setRetranslating(true)
      try {
        const res = await api.quickCaptureRetranslate?.({ text: data.ocrText, from: 'auto', to: lang })
        if (res?.ok) {
          setData((prev) => ({ ...prev, translatedText: res.text, error: null }))
        } else if (res && !res.ok) {
          setData((prev) => ({ ...prev, error: res.error }))
        }
      } catch (e: any) {
        setData((prev) => ({ ...prev, error: e?.message || 'Translation failed' }))
      } finally {
        setRetranslating(false)
      }
    },
    [data.ocrText, retranslating, api]
  )

  const onLangChange = (lang: string) => {
    setToLang(lang)
    void handleRetranslate(lang)
  }

  const copyText = async (text: string, setFlag: (v: boolean) => void) => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setFlag(true)
    setTimeout(() => setFlag(false), 2000)
  }

  const close = () => api.quickCaptureClose?.()

  const isTransRtl = RTL.has(toLang)
  const isLoading = data.loading
  const hasOcr = !isLoading && !!data.ocrText

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-zinc-900 text-zinc-100"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* ── Title bar (draggable) ── */}
      <div
        className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold tracking-wide text-zinc-300">Quick Capture</span>
        </div>
        <button
          type="button"
          onClick={close}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-700 hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            <span>{data.imageBase64 ? 'Extracting text…' : 'Capturing screen…'}</span>
          </div>
        )}

        {/* Fatal error (no OCR text at all) */}
        {!isLoading && data.error && !data.ocrText && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">
            {data.error}
          </div>
        )}

        {/* Captured image thumbnail */}
        {!isLoading && data.imageBase64 && (
          <img
            src={`data:image/png;base64,${data.imageBase64}`}
            alt="Captured region"
            className="max-h-36 w-full shrink-0 rounded-lg border border-zinc-700 object-contain"
          />
        )}

        {/* OCR text */}
        {!isLoading && (
          <Section
            label="Original Text"
            onCopy={() => void copyText(data.ocrText, setCopiedOcr)}
            copied={copiedOcr}
            copyDisabled={!data.ocrText}
          >
            <div className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
              {data.ocrText || (
                <span className="italic text-zinc-600">No text detected in this area</span>
              )}
            </div>
          </Section>
        )}

        {/* Translation */}
        {hasOcr && (
          <Section
            label="Translation"
            onCopy={() => void copyText(data.translatedText, setCopiedTrans)}
            copied={copiedTrans}
            copyDisabled={!data.translatedText || retranslating}
            headerExtra={
              <select
                value={toLang}
                onChange={(e) => onLangChange(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            }
          >
            <div
              dir={isTransRtl ? 'rtl' : 'ltr'}
              className={[
                'max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed',
                retranslating ? 'animate-pulse text-zinc-500' : 'text-zinc-200'
              ].join(' ')}
            >
              {retranslating ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Translating…
                </div>
              ) : data.translatedText ? (
                data.translatedText
              ) : (
                <span className="italic text-zinc-600">
                  {data.error ?? 'No translation available'}
                </span>
              )}
            </div>
          </Section>
        )}

        {/* Non-fatal translation error (OCR worked, translation didn't) */}
        {!isLoading && data.error && data.ocrText && (
          <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-400">
            Translation error: {data.error}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small reusable section card ──────────────────────────────────────────────

function Section({
  label,
  headerExtra,
  children,
  onCopy,
  copied,
  copyDisabled
}: {
  label: string
  headerExtra?: React.ReactNode
  children: React.ReactNode
  onCopy: () => void
  copied: boolean
  copyDisabled: boolean
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {label}
          </span>
          {headerExtra}
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={copyDisabled}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-40"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <div className="rounded-lg border border-zinc-700/80 bg-zinc-800/50 p-2.5">
        {children}
      </div>
    </div>
  )
}
