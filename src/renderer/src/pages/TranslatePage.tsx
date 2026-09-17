import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Check, Copy, Loader2 } from 'lucide-react'
import { getApi } from '@renderer/lib/ipc'

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
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

const TARGET_LANGS = LANGUAGES.filter((l) => l.code !== 'auto')
const RTL = new Set(['ar', 'he', 'fa', 'ur'])

const SELECT_CLS =
  'rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 min-w-[160px]'

const BTN_GHOST =
  'inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'

export function TranslatePage({
  initialText = '',
  initToken = 0,
  autoTranslate = false
}: {
  initialText?: string
  initToken?: number
  autoTranslate?: boolean
}) {
  const [fromLang, setFromLang] = useState('en')
  const [toLang, setToLang] = useState('ar')
  const [sourceText, setSourceText] = useState('')
  const [result, setResult] = useState('')
  const [translating, setTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fromLangRef = useRef(fromLang)
  const toLangRef = useRef(toLang)
  fromLangRef.current = fromLang
  toLangRef.current = toLang

  const runTranslate = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setTranslating(true)
    setError(null)
    try {
      const res = await getApi().translateText({
        text: trimmed,
        from: fromLangRef.current === 'auto' ? 'auto' : fromLangRef.current,
        to: toLangRef.current
      })
      if (res.ok) {
        setResult(res.text)
      } else {
        setError(res.error)
      }
    } catch (e: any) {
      setError(e?.message || 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }, [])

  const appliedTokenRef = useRef(0)
  useEffect(() => {
    if (!initToken || initToken === appliedTokenRef.current) return
    appliedTokenRef.current = initToken
    setSourceText(initialText)
    setResult('')
    setError(null)
    if (autoTranslate) void runTranslate(initialText)
  }, [initToken, initialText, autoTranslate, runTranslate])

  const swap = () => {
    if (fromLang === 'auto') return
    setFromLang(toLang)
    setToLang(fromLang === 'auto' ? 'en' : fromLang)
    setSourceText(result)
    setResult(sourceText)
  }

  const handleTranslate = useCallback(async () => {
    await runTranslate(sourceText)
  }, [runTranslate, sourceText])

  // Ctrl+Enter shortcut
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      void handleTranslate()
    }
  }

  const copyResult = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isSourceRtl = RTL.has(fromLang)
  const isTargetRtl = RTL.has(toLang)

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      {/* Language controls */}
      <div className="flex shrink-0 items-center gap-3">
        <select
          value={fromLang}
          onChange={(e) => setFromLang(e.target.value)}
          className={SELECT_CLS}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={swap}
          disabled={fromLang === 'auto'}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Swap languages"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>

        <select
          value={toLang}
          onChange={(e) => setToLang(e.target.value)}
          className={SELECT_CLS}
        >
          {TARGET_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error ? (
        <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {/* Two columns */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4" style={{ minHeight: 280 }}>
        {/* Source */}
        <div className="flex flex-col gap-2">
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            onKeyDown={onKeyDown}
            dir={isSourceRtl ? 'rtl' : 'ltr'}
            placeholder="Enter text to translate… (Ctrl+Enter to translate)"
            maxLength={5000}
            className="min-h-0 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
          <div className="flex shrink-0 items-center justify-between">
            <span className="text-xs text-zinc-400 dark:text-zinc-600">
              {sourceText.length}/5000
            </span>
            <button
              type="button"
              onClick={() => void handleTranslate()}
              disabled={!sourceText.trim() || translating}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {translating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {translating ? 'Translating…' : 'Translate'}
            </button>
          </div>
        </div>

        {/* Result */}
        <div className="flex flex-col gap-2">
          <div
            dir={isTargetRtl ? 'rtl' : 'ltr'}
            className={[
              'min-h-0 flex-1 overflow-auto rounded-xl border p-3 text-sm leading-relaxed',
              translating
                ? 'animate-pulse border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-900/60'
                : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40'
            ].join(' ')}
          >
            {result ? (
              <span className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{result}</span>
            ) : (
              <span className="text-zinc-400 dark:text-zinc-600">
                {translating ? 'Translating…' : 'Translation will appear here'}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end">
            <button
              type="button"
              onClick={() => void copyResult()}
              disabled={!result}
              className={BTN_GHOST}
              title="Copy translation"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
