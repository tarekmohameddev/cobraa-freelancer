import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Box,
  ChevronDown,
  Globe,
  Image as ImageIcon,
  Mic,
  MicOff,
  Paperclip,
  Check
} from 'lucide-react'

export type SpeechLang = 'en' | 'ar'

const AVAILABLE_MODELS = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gpt-4o', label: 'GPT-4o' }
]

export function ChatInput({
  value,
  onChange,
  onSend,
  sending,
  micActive,
  onToggleMic,
  transcript,
  speechLang = 'en',
  onSpeechLangChange = () => {},
  webSearch = false,
  onWebSearchChange = () => {},
  focusToken = 0
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  sending: boolean
  micActive: boolean
  onToggleMic: () => void
  transcript?: string
  speechLang?: SpeechLang
  onSpeechLangChange?: (lang: SpeechLang) => void
  webSearch?: boolean
  onWebSearchChange?: (enabled: boolean) => void
  focusToken?: number
}) {
  const canSend = useMemo(() => value.trim().length > 0 && !sending, [value, sending])
  const isArabic = speechLang === 'ar'
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('cobraa:selectedModel') || 'gemini-3.1-flash-lite'
  })
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false)
      }
    }
    if (modelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modelDropdownOpen])

  useEffect(() => {
    if (!focusToken) return
    composerRef.current?.focus()
    const timer = setTimeout(() => {
      composerRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [focusToken])

  // Auto-resize textarea
  useEffect(() => {
    if (!composerRef.current) return
    composerRef.current.style.height = 'auto'
    composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 180)}px`
  }, [value])

  const handleModelSelect = (id: string) => {
    setSelectedModel(id)
    localStorage.setItem('cobraa:selectedModel', id)
    setModelDropdownOpen(false)
  }

  const currentModelLabel = useMemo(() => {
    return AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.label || 'Gemini 3.1 Flash-Lite'
  }, [selectedModel])

  return (
    <div className="w-full">
      {/* Transcript or mic active badge */}
      {micActive || transcript ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#00007B]/20 bg-[#00007B]/5 px-3 py-2 text-xs text-[#00007B] dark:border-[#00007B]/40 dark:bg-[#00007B]/20 dark:text-blue-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00007B] opacity-75 dark:bg-blue-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00007B] dark:bg-blue-400" />
            </span>
            <span className={`truncate ${isArabic ? 'text-right' : ''}`} dir={isArabic ? 'rtl' : 'ltr'}>
              {micActive ? (isArabic ? 'جاري الاستماع…' : 'Listening…') : isArabic ? 'النص' : 'Transcript'}
              {transcript ? `: ${transcript}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onSpeechLangChange(speechLang === 'en' ? 'ar' : 'en')}
              className="rounded-lg border border-zinc-200/60 bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {speechLang.toUpperCase()}
            </button>
          </div>
        </div>
      ) : null}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            onChange(value ? `${value}\n[Attached: ${file.name}]` : `[Attached: ${file.name}]`)
          }
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            onChange(value ? `${value}\n[Image attached: ${file.name}]` : `[Image attached: ${file.name}]`)
          }
        }}
      />

      {/* Main Composer Card */}
      <div className="relative rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-sm transition-all focus-within:border-zinc-300 focus-within:shadow-md dark:border-zinc-800 dark:bg-zinc-900/90 dark:focus-within:border-zinc-700">
        {/* Text Input */}
        <textarea
          ref={composerRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSend) onSend()
            }
          }}
          rows={1}
          dir={isArabic ? 'rtl' : 'ltr'}
          placeholder={isArabic ? 'اسأل Cobraa AI…' : 'Ask Cobraa AI'}
          className="w-full resize-none bg-transparent px-1 pt-1 pb-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
          style={{ minHeight: '44px' }}
        />

        {/* Bottom Controls Bar */}
        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800/60">
          {/* Left Controls: Model Pill & Search Pill */}
          <div className="flex items-center gap-2">
            {/* Model Selector Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setModelDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-zinc-50/80 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Box className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                <span className="font-normal">{currentModelLabel}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {modelDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 z-50">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Select Model
                  </div>
                  {AVAILABLE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModelSelect(m.id)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <span>{m.label}</span>
                      {selectedModel === m.id && <Check className="h-3.5 w-3.5 text-[#00007B] dark:text-blue-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Pill Toggle */}
            <button
              type="button"
              onClick={() => onWebSearchChange(!webSearch)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                webSearch
                  ? 'border-[#00007B]/30 bg-[#00007B]/10 text-[#00007B] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'border-zinc-200/90 bg-zinc-50/80 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Search</span>
              {/* Switch pill */}
              <span
                className={`relative inline-block h-3.5 w-6 rounded-full transition-colors ${
                  webSearch ? 'bg-[#00007B] dark:bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform ${
                    webSearch ? 'translate-x-2.5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Right Controls: Image, Attach, Mic, Divider, Send */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Add image"
            >
              <ImageIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onToggleMic}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
                micActive
                  ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 animate-pulse'
                  : 'text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
              }`}
              title={micActive ? 'Stop mic' : isArabic ? 'ميكروفون عربي' : 'Dictate with mic'}
            >
              {micActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <div className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

            {/* Circular Send Arrow Button */}
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
                canSend
                  ? 'bg-[#00007B] text-white shadow-sm shadow-[#00007B]/30 hover:bg-[#000060] dark:bg-[#00007B] dark:text-white dark:hover:bg-[#000095]'
                  : 'bg-zinc-100 text-zinc-300 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600'
              }`}
              title="Send message"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
