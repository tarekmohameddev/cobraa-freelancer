import { useEffect, useRef } from 'react'
import { getApi } from '@renderer/lib/ipc'

function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function useGlobalVoiceDictation() {
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const silentGainRef = useRef<GainNode | null>(null)
  const isRecordingRef = useRef(false)

  const stopAudio = () => {
    if (!isRecordingRef.current) return
    isRecordingRef.current = false

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
      void audioCtxRef.current?.close()
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

  const startAudio = async () => {
    if (isRecordingRef.current) return
    isRecordingRef.current = true

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
    } catch {
      isRecordingRef.current = false
      return
    }

    let audioCtx: AudioContext
    try {
      audioCtx = new AudioContext({ sampleRate: 16000 })
    } catch {
      audioCtx = new AudioContext()
    }
    audioCtxRef.current = audioCtx

    try {
      const source = audioCtx.createMediaStreamSource(stream)
      sourceRef.current = source

      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const silentGain = audioCtx.createGain()
      silentGain.gain.value = 0
      silentGainRef.current = silentGain

      processor.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return
        try {
          const input = event.inputBuffer.getChannelData(0)
          const pcm16 = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
          }
          const audioBase64 = pcm16ToBase64(pcm16)
          void getApi().speechChunk({ audioBase64 })
        } catch {
          // ignore
        }
      }

      source.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(audioCtx.destination)
    } catch {
      stopAudio()
    }
  }

  useEffect(() => {
    const unsubStart = getApi().onVoiceDictationStartRecording(() => {
      void startAudio()
    })

    const unsubStop = getApi().onVoiceDictationStopRecording(() => {
      stopAudio()
    })

    return () => {
      unsubStart()
      unsubStop()
      stopAudio()
    }
  }, [])
}
