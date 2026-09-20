import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ImageIcon, Loader2, Languages, X } from 'lucide-react'
import { getApi } from '@renderer/lib/ipc'

const OCR_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic (عربي)' },
  { code: 'zh', label: 'Chinese (中文)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'ru', label: 'Russian' }
]

const SELECT_CLS =
  'rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00007B]/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

const MAX_BYTES = 8 * 1024 * 1024

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function OcrPage({ onSendToTranslate }: { onSendToTranslate: (text: string) => void }) {
  const [ocrLang, setOcrLang] = useState('en')
  const [dragging, setDragging] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Run OCR whenever image or language changes
  useEffect(() => {
    if (!imageBase64) return
    let cancelled = false

    const run = async () => {
      setProcessing(true)
      setError(null)
      setExtractedText('')
      try {
        const res = await getApi().ocrImage({ imageBase64, language: ocrLang })
        if (cancelled) return
        if (res.ok) {
          setExtractedText(res.text)
        } else {
          setError(res.error)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'OCR failed')
      } finally {
        if (!cancelled) setProcessing(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [imageBase64, ocrLang])

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image is too large (max 8 MB). Please choose a smaller image.')
      return
    }
    setError(null)
    setExtractedText('')
    try {
      const base64 = await fileToBase64(file)
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)
      setImageBase64(base64)
    } catch {
      setError('Could not read image file.')
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    setImageBase64(null)
    setExtractedText('')
    setError(null)
  }

  // Clipboard paste (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imgItem = items.find((i) => i.type.startsWith('image/'))
      if (imgItem) {
        const file = imgItem.getAsFile()
        if (file) void handleFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

  const copyText = async () => {
    if (!extractedText) return
    await navigator.clipboard.writeText(extractedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      {/* Language selector */}
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Language:</span>
        <select
          value={ocrLang}
          onChange={(e) => setOcrLang(e.target.value)}
          className={SELECT_CLS}
        >
          {OCR_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {imageBase64 && (
          <button
            type="button"
            onClick={clearImage}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X className="h-3.5 w-3.5" />
            Clear image
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Drop zone */}
      {!imageBase64 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          className={[
            'flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors select-none',
            dragging
              ? 'border-[#00007B]/50 bg-[#00007B]/5 dark:border-[#00007B]/60 dark:bg-[#00007B]/20'
              : 'border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 hover:bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-900/20 dark:hover:border-zinc-600'
          ].join(' ')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <ImageIcon className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Drop an image here
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              or click to browse · Ctrl+V to paste from clipboard
            </p>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-600">
              Supports PNG, JPG, WEBP · max 8 MB
            </p>
          </div>
        </div>
      ) : (
        /* Image + result grid */
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4" style={{ minHeight: 280 }}>
          {/* Image preview */}
          <div className="relative flex min-h-0 items-start overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
            <img
              src={imagePreview!}
              alt="Selected image"
              className="h-full w-full object-contain"
            />
          </div>

          {/* Extracted text */}
          <div className="flex min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
              {processing ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting text…
                </div>
              ) : extractedText ? (
                <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
                  {extractedText}
                </pre>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
                  No text found in this image
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void copyText()}
                disabled={!extractedText}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#00007B] dark:text-blue-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onSendToTranslate(extractedText)}
                disabled={!extractedText}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#00007B] px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-[#00007B]/20 transition hover:bg-[#000060] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Languages className="h-3.5 w-3.5" />
                Translate this
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
