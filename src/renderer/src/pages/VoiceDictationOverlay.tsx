import React, { useEffect, useState } from 'react'
import { Mic, CheckCircle2, Loader2, Globe } from 'lucide-react'
import { getApi } from '@renderer/lib/ipc'

interface VoiceOverlayState {
  status: 'idle' | 'listening' | 'processing' | 'done'
  language: string
  transcript: string
}

export function VoiceDictationOverlay() {
  const [data, setData] = useState<VoiceOverlayState>({
    status: 'listening',
    language: 'en',
    transcript: ''
  })

  useEffect(() => {
    // Initial fetch
    void getApi()
      .voiceOverlayGetData()
      .then((res) => {
        if (res) setData(res)
      })
      .catch(() => {})

    // Listen for real-time updates
    return getApi().onVoiceOverlayData((next) => {
      setData((prev) => ({ ...prev, ...next }))
    })
  }, [])

  const isAr = data.language?.toLowerCase().startsWith('ar')
  const status = data.status

  return (
    <div className="w-full h-full flex items-center justify-center p-1 select-none overflow-hidden font-sans">
      <div className="relative flex items-center gap-3 w-full max-w-[360px] h-[58px] px-4 py-2 rounded-2xl bg-zinc-950/90 text-white border border-zinc-700/60 shadow-[0_12px_40px_rgba(0,0,0,0.65)] backdrop-blur-xl transition-all">
        {/* Animated Mic icon / Status */}
        <div className="relative shrink-0 flex items-center justify-center">
          {status === 'listening' ? (
            <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/20 text-rose-400">
              <span className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
              <Mic className="w-4 h-4 relative z-10 animate-pulse text-rose-400" />
            </div>
          ) : status === 'processing' ? (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Live transcript or prompt */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div
            className={`text-xs font-medium truncate ${
              data.transcript ? 'text-zinc-100' : 'text-zinc-400'
            }`}
            dir="auto"
          >
            {data.transcript ? (
              data.transcript
            ) : status === 'listening' ? (
              <span>Listening... Speak now</span>
            ) : status === 'processing' ? (
              <span>Processing audio...</span>
            ) : (
              <span>Text inserted!</span>
            )}
          </div>

          <div className="text-[10px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Release button to insert text</span>
          </div>
        </div>

        {/* Language Badge */}
        <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-[11px] font-semibold text-zinc-300">
          <Globe className="w-3 h-3 text-zinc-400" />
          <span>{isAr ? 'AR' : 'EN'}</span>
        </div>
      </div>
    </div>
  )
}
