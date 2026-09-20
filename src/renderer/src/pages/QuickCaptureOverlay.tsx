import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Languages,
  Loader2,
  Save,
  ScanText,
  X
} from 'lucide-react'
import { getApi } from '@renderer/lib/ipc'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

const LANGUAGES = [
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
  { code: 'ru', label: 'Русский (Russian)' }
]

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur'])

function toRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

export function QuickCaptureOverlay() {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const [committedRect, setCommittedRect] = useState<Rect | null>(null)
  const [croppedBase64, setCroppedBase64] = useState<string | null>(null)

  // Floating panel & actions state
  const [activeTab, setActiveTab] = useState<'none' | 'ocr' | 'translate'>('none')
  const [ocrText, setOcrText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [targetLang, setTargetLang] = useState('en')
  const [loadingOcr, setLoadingOcr] = useState(false)
  const [loadingTranslate, setLoadingTranslate] = useState(false)
  const [savingImage, setSavingImage] = useState(false)
  const [copied, setCopied] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  const cancel = useCallback(() => {
    void getApi().quickCaptureCancel?.()
  }, [])

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  // Clear toast after 3 seconds
  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(t)
  }, [toastMessage])

  // Mouse drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setDragging(true)
    setCommittedRect(null)
    setCroppedBase64(null)
    setActiveTab('none')
    setOcrText('')
    setTranslatedText('')
    setError(null)
    setStart({ x: e.clientX, y: e.clientY })
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  const onMouseUp = async (e: React.MouseEvent) => {
    if (!dragging || !start) return
    setDragging(false)
    const end = { x: e.clientX, y: e.clientY }
    const rect = toRect(start, end)

    // Ignore tiny accidental clicks
    if (rect.width < 15 || rect.height < 15) {
      setStart(null)
      setCurrent(null)
      setCommittedRect(null)
      return
    }

    setCommittedRect(rect)
    try {
      const cropRes = await getApi().quickCaptureCrop(rect)
      if (cropRes.ok) {
        setCroppedBase64(cropRes.imageBase64)
      } else {
        setError(cropRes.error || 'فشل في قص لقطة الشاشة')
      }
    } catch (err: any) {
      setError(err?.message || 'فشل في قص لقطة الشاشة')
    }
  }

  // Action: OCR (تحويل الصورة إلى نص)
  const handleOcr = async () => {
    if (!croppedBase64 || loadingOcr) return
    setActiveTab('ocr')
    if (ocrText) {
      // Already extracted, copy again
      await copyToClipboard(ocrText)
      return
    }

    setLoadingOcr(true)
    setError(null)
    try {
      const res = await getApi().ocrImage({ imageBase64: croppedBase64 })
      if (res.ok) {
        const text = res.text.trim()
        setOcrText(text)
        if (text) {
          await copyToClipboard(text)
          setToastMessage('Text extracted & copied to clipboard ✓')
        } else {
          setOcrText('No text detected in selected area')
        }
      } else {
        setError(res.error || 'Failed to recognize text')
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to recognize text')
    } finally {
      setLoadingOcr(false)
    }
  }

  // Action: Translate
  const handleTranslate = async (lang = targetLang) => {
    if (!croppedBase64 || loadingTranslate) return
    setActiveTab('translate')
    setLoadingTranslate(true)
    setError(null)

    try {
      let text = ocrText
      if (!text) {
        const ocrRes = await getApi().ocrImage({ imageBase64: croppedBase64 })
        if (!ocrRes.ok) throw new Error(ocrRes.error || 'Failed to extract text for translation')
        text = ocrRes.text.trim()
        setOcrText(text)
      }

      if (!text) {
        setTranslatedText('No text detected to translate')
        return
      }

      const transRes = await getApi().translateText({ text, from: 'auto', to: lang })
      if (transRes.ok) {
        setTranslatedText(transRes.text)
        await copyToClipboard(transRes.text)
        setToastMessage('Translation copied to clipboard ✓')
      } else {
        setError(transRes.error || 'Translation failed')
      }
    } catch (err: any) {
      setError(err?.message || 'Translation failed')
    } finally {
      setLoadingTranslate(false)
    }
  }

  // Action: Save
  const handleSave = async () => {
    if (!croppedBase64 || savingImage) return
    setSavingImage(true)
    setError(null)
    try {
      const res = await getApi().quickCaptureSaveImage(croppedBase64)
      if (res.ok) {
        setToastMessage('Screenshot saved & copied to clipboard ✓')
        setTimeout(() => {
          cancel()
        }, 1200)
      } else if (res.error) {
        setError(res.error)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save screenshot')
    } finally {
      setSavingImage(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // Currently drawn or committed selection
  const currentSel = dragging && start && current ? toRect(start, current) : committedRect

  // Toolbar positioning
  const getToolbarPosition = () => {
    if (!committedRect) return { top: 0, left: 0 }
    const tbWidth = 380
    const tbHeight = 46
    const margin = 8

    // Prefer below selection; if overflowing viewport bottom, put above selection
    let top = committedRect.y + committedRect.height + margin
    if (top + tbHeight + 10 > window.innerHeight) {
      top = Math.max(10, committedRect.y - tbHeight - margin)
    }

    // Align rightwards relative to selection box (matching reference picture)
    let left = committedRect.x + committedRect.width - tbWidth
    if (left < 10) left = Math.max(10, committedRect.x)
    if (left + tbWidth > window.innerWidth - 10) {
      left = window.innerWidth - tbWidth - 10
    }

    return { top, left }
  }

  const tbPos = getToolbarPosition()

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 select-none overflow-hidden"
      style={{
        cursor: dragging ? 'crosshair' : committedRect ? 'default' : 'crosshair',
        background: 'rgba(0, 0, 0, 0.42)',
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Hint banner when no selection yet */}
      {!dragging && !committedRect && (
        <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
          <div
            className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-medium text-white shadow-2xl"
            style={{ background: 'rgba(20, 20, 24, 0.92)', backdropFilter: 'blur(10px)' }}
          >
            <span>Drag to select a screen region</span>
            <span className="text-zinc-400">· ESC to cancel</span>
          </div>
        </div>
      )}

      {/* Floating Toast */}
      {toastMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-2xl animate-fade-in">
            <Check className="h-4 w-4" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Selection Box & Cutout */}
      {currentSel && currentSel.width > 0 && currentSel.height > 0 && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: currentSel.x,
            top: currentSel.y,
            width: currentSel.width,
            height: currentSel.height,
            border: '2px solid #0284c7',
            background: 'rgba(2, 132, 199, 0.03)',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.42)',
            zIndex: 10
          }}
        >
          {/* Dimensions label pill at top-left (e.g. 670 × 521) */}
          <div
            className="absolute rounded-md px-2 py-0.5 text-xs font-mono font-medium text-white shadow-md select-none"
            style={{
              top: currentSel.y < 30 ? 4 : -26,
              left: 0,
              background: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              letterSpacing: '0.02em'
            }}
          >
            {Math.round(currentSel.width)} × {Math.round(currentSel.height)}
          </div>

          {/* 8 Anchor Handles (4 corners + 4 midpoints like the reference image) */}
          {[
            { id: 'tl', top: -4, left: -4 },
            { id: 'tc', top: -4, left: 'calc(50% - 4px)' },
            { id: 'tr', top: -4, right: -4 },
            { id: 'ml', top: 'calc(50% - 4px)', left: -4 },
            { id: 'mr', top: 'calc(50% - 4px)', right: -4 },
            { id: 'bl', bottom: -4, left: -4 },
            { id: 'bc', bottom: -4, left: 'calc(50% - 4px)' },
            { id: 'br', bottom: -4, right: -4 }
          ].map((h) => (
            <span
              key={h.id}
              style={{
                position: 'absolute',
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: '#0284c7',
                border: '1.5px solid #ffffff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                ...h
              }}
            />
          ))}
        </div>
      )}

      {/* ── Floating Mini Toolbar ("بار صغير") ── */}
      {committedRect && (
        <div
          className="pointer-events-auto absolute flex flex-col items-end gap-2"
          style={{
            top: tbPos.top,
            left: tbPos.left,
            zIndex: 40
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Main Toolbar Bar */}
          <div
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white/95 px-2.5 py-1.5 shadow-2xl backdrop-blur-md dark:border-zinc-700/90 dark:bg-zinc-900/95"
          >
            {/* 1. Translate Button */}
            <button
              type="button"
              onClick={() => void handleTranslate()}
              disabled={loadingTranslate || !croppedBase64}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition select-none ${
                activeTab === 'translate'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
              } disabled:opacity-50`}
              title="Translate text in captured region"
            >
              {loadingTranslate ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              ) : (
                <Languages className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              )}
              <span>Translate</span>
            </button>

            {/* 2. Image to Text (OCR) Button */}
            <button
              type="button"
              onClick={() => void handleOcr()}
              disabled={loadingOcr || !croppedBase64}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition select-none ${
                activeTab === 'ocr'
                  ? 'bg-[#00007B] text-white shadow-sm'
                  : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
              } disabled:opacity-50`}
              title="Convert image to text (OCR)"
            >
              {loadingOcr ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              ) : (
                <ScanText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              )}
              <span>Image to Text</span>
            </button>

            {/* 3. Save Button */}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={savingImage || !croppedBase64}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition select-none hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50"
              title="Save image to file and copy to clipboard"
            >
              {savingImage ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
              ) : (
                <Save className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>Save</span>
            </button>

            {/* Separator */}
            <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

            {/* Close / Cancel Button */}
            <button
              type="button"
              onClick={cancel}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Active Result Popover Card (OCR or Translate) ── */}
          {activeTab !== 'none' && (
            <div
              className="w-96 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {activeTab === 'ocr' ? 'Extracted Text (OCR)' : 'Translation'}
                  </span>
                  {activeTab === 'translate' && (
                    <select
                      value={targetLang}
                      onChange={(e) => {
                        const next = e.target.value
                        setTargetLang(next)
                        void handleTranslate(next)
                      }}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      void copyToClipboard(activeTab === 'ocr' ? ocrText : translatedText)
                    }
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('none')}
                    className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Popover Content */}
              <div className="mt-2">
                {activeTab === 'ocr' && (
                  <>
                    {loadingOcr ? (
                      <div className="flex h-24 items-center justify-center gap-2 text-xs text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                        <span>Extracting text from image...</span>
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto rounded-lg bg-zinc-50 p-2.5 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-200 whitespace-pre-wrap select-text">
                        {ocrText || (
                          <span className="italic text-zinc-400">No text detected in selected area</span>
                        )}
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'translate' && (
                  <>
                    {loadingTranslate ? (
                      <div className="flex h-24 items-center justify-center gap-2 text-xs text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        <span>Translating...</span>
                      </div>
                    ) : (
                      <div
                        dir={RTL_LANGS.has(targetLang) ? 'rtl' : 'ltr'}
                        className="max-h-48 overflow-y-auto rounded-lg bg-zinc-50 p-2.5 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-200 whitespace-pre-wrap select-text"
                      >
                        {translatedText || (
                          <span className="italic text-zinc-400">No translation available</span>
                        )}
                      </div>
                    )}
                  </>
                )}

                {error && (
                  <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top right cancel button */}
      <button
        type="button"
        onClick={cancel}
        className="pointer-events-auto absolute right-5 top-5 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
        style={{ background: 'rgba(20, 20, 24, 0.75)', zIndex: 20 }}
      >
        Cancel (Esc)
      </button>
    </div>
  )
}

