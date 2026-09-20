import { useEffect, useMemo, useRef, useState } from 'react'
import { getApi, type SpeechEvent } from '@renderer/lib/ipc'

function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function useSpeech() {
  const [micActive, setMicActive] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const finalBufferRef = useRef<string>('')
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const silentGainRef = useRef<GainNode | null>(null)

  useEffect(() => {
    const unsubscribe = getApi().onSpeechEvent((evt: SpeechEvent) => {
      if (evt.type === 'partial') {
        setTranscript(evt.value)
      } else if (evt.type === 'final') {
        finalBufferRef.current = (finalBufferRef.current + ' ' + evt.value).trim()
        setTranscript('')
      } else if (evt.type === 'error') {
        setError(evt.value)
      }
    })
    return unsubscribe
  }, [])

  const start = async ({ language }: { language?: string }) => {
    if (micActive) return
    setError(null)
    finalBufferRef.current = ''
    setTranscript('')

    const res = await getApi().speechStart({ language })
    if (!res.ok) {
      setError(res.error)
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
    } catch (e: any) {
      await getApi().speechStop().catch(() => {})
      setError(e?.message || 'Microphone permission denied')
      return
    }

    let audioCtx: AudioContext
    try {
      audioCtx = new AudioContext({ sampleRate: 16000 })
    } catch {
      audioCtx = new AudioContext()
    }
    audioCtxRef.current = audioCtx

    const source = audioCtx.createMediaStreamSource(stream)
    sourceRef.current = source

    // ScriptProcessorNode is deprecated, but still supported in Chromium and is simplest for MVP.
    const processor = audioCtx.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    // Keep the processing graph "alive" without playing audio back to the user (prevents echo).
    const silentGain = audioCtx.createGain()
    silentGain.gain.value = 0
    silentGainRef.current = silentGain

    processor.onaudioprocess = (event) => {
      try {
        const input = event.inputBuffer.getChannelData(0)
        const pcm16 = new Int16Array(input.length)
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        const audioBase64 = pcm16ToBase64(pcm16)
        void getApi().speechChunk({ audioBase64 })
      } catch (e: any) {
        setError(e?.message || 'Audio processing failed')
      }
    }

    source.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(audioCtx.destination)

    setMicActive(true)
  }

  const stop = async () => {
    if (!micActive) return
    setMicActive(false)

    try {
      await getApi().speechStop()
    } catch (e: any) {
      setError(e?.message || 'Stopping speech failed')
    }

    try {
      processorRef.current?.disconnect()
      sourceRef.current?.disconnect()
      silentGainRef.current?.disconnect()
      processorRef.current = null
      sourceRef.current = null
      silentGainRef.current = null
    } catch {
      // ignore
    }

    try {
      await audioCtxRef.current?.close()
    } catch {
      // ignore
    } finally {
      audioCtxRef.current = null
    }

    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      // ignore
    } finally {
      streamRef.current = null
    }
  }

  const flushIntoInput = () => {
    const text = [finalBufferRef.current, transcript].filter(Boolean).join(' ').trim()
    finalBufferRef.current = ''
    setTranscript('')
    return text
  }

  const state = useMemo(
    () => ({
      micActive,
      transcript,
      error,
      start,
      stop,
      flushIntoInput
    }),
    [micActive, transcript, error]
  )

  return state
}

