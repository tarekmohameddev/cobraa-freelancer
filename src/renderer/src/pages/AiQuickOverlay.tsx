import React, { useEffect, useRef, useState } from 'react'
import { getApi } from '@renderer/lib/ipc'
import { ArrowUp, Sparkles, X } from 'lucide-react'

export function AiQuickOverlay() {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    // Load initial data (clipboard text)
    getApi()
      .aiOverlayGetData()
      .then((data) => {
        if (data?.text) {
          setText(data.text)
        }
      })
      .catch(() => {})

    // Listen for data if window was already open
    const unsub = getApi().onAiOverlayData((data) => {
      if (data?.text) {
        setText(data.text)
      }
    })

    return unsub
  }, [])

  useEffect(() => {
    // Focus textarea on mount
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.value.length
        textareaRef.current.selectionEnd = textareaRef.current.value.length
      }
    }, 60)
    return () => clearTimeout(timer)
  }, [])

  const handleClose = () => {
    void getApi().aiOverlayClose()
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    void getApi().aiOverlaySend(trimmed)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
  }

  return (
    <div className="h-screen w-screen p-2.5 flex flex-col select-none bg-transparent">
      <div className="relative flex flex-col h-full rounded-2xl border border-white/80 bg-white/50 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.18)] overflow-hidden p-3.5 text-zinc-900">
        {/* Header (draggable) */}
        <div
          className="flex items-center justify-between pb-2 border-b border-zinc-900/10"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-zinc-900">
            <Sparkles className="h-3.5 w-3.5 text-[#00007B]" />
            <span>Cobraa AI</span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 hover:bg-black/10 hover:text-zinc-900 transition"
            title="إغلاق (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Text Area */}
        <div className="flex flex-1 flex-col my-2 min-h-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="اكتب سؤالك أو اترك النص المنسوخ هنا…"
            dir="auto"
            className="w-full flex-1 resize-none bg-white/40 border border-white/70 rounded-xl p-3 text-sm text-zinc-900 placeholder-zinc-500 font-medium focus:border-[#00007B]/70 focus:bg-white/65 focus:ring-2 focus:ring-[#00007B]/15 outline-none transition leading-relaxed shadow-sm"
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between pt-1 text-[11px] text-zinc-600"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-[10px] text-zinc-500 font-medium select-none">
            Enter للإرسال · Esc للإغلاق
          </span>

          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#00007B] hover:bg-[#000099] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-[#00007B]/30 transition"
          >
            <span>إرسال</span>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
