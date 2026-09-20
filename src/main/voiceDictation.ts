import { BrowserWindow, clipboard } from 'electron'
import { debugLog } from './debug'
import {
  getForegroundHwnd,
  getLastExternalHwnd,
  isInternalHwnd,
  pasteTextIntoActiveWindow,
  updateLastExternalHwnd
} from './windowsTextInsertion'
import {
  closeVoiceOverlay,
  openVoiceOverlay,
  updateVoiceOverlay
} from './voiceOverlay'
import { addSpeechListener, speechStart, speechStop } from './speech'
import { getSettings, updateSettings } from './settings'
import { translateText } from './translate'

let mainWin: BrowserWindow | null = null
let isDictating = false
let isTranslatingVoice = false
let targetHwnd: unknown = null
let currentLanguage = 'en-US'
let targetTranLan = 'English'
let targetRecognizeLan = 'ar-SA'
let finalBuffer = ''
let partialTranscript = ''
let finishTimeout: ReturnType<typeof setTimeout> | null = null

addSpeechListener((evt) => {
  handleSpeechEventForDictation(evt)
})

export function setVoiceDictationMainWindow(win: BrowserWindow | null) {
  mainWin = win
}

export function getVoiceLanguage(): string {
  const settings = getSettings()
  return settings.voiceLan || currentLanguage
}

export function setVoiceLanguage(lang: string) {
  currentLanguage = lang.trim()
  updateSettings({ voiceLan: currentLanguage })
  updateVoiceOverlay({ language: currentLanguage })
}

export function toggleVoiceLanguage(): string {
  const settings = getSettings()
  const current = settings.voiceLan || currentLanguage
  const next = current.startsWith('en') ? 'ar-SA' : 'en-US'
  currentLanguage = next
  updateSettings({ voiceLan: next })
  debugLog('voice:toggleLang', { language: currentLanguage })
  updateVoiceOverlay({ language: currentLanguage })
  return currentLanguage
}

export function isVoiceDictating(): boolean {
  return isDictating
}

export function isVoiceTranslating(): boolean {
  return isTranslatingVoice
}

export function handleSpeechEventForDictation(evt: { type: string; value?: any }) {
  if (!isDictating) return

  if (evt.type === 'partial' && typeof evt.value === 'string') {
    partialTranscript = evt.value
    const combined = [finalBuffer, partialTranscript].filter(Boolean).join(' ').trim()
    updateVoiceOverlay({
      transcript: combined,
      status: 'listening',
      language: isTranslatingVoice ? `${targetRecognizeLan} → ${targetTranLan}` : currentLanguage
    })
  } else if (evt.type === 'final' && typeof evt.value === 'string') {
    finalBuffer = (finalBuffer ? `${finalBuffer} ${evt.value}` : evt.value).trim()
    partialTranscript = ''
    updateVoiceOverlay({
      transcript: finalBuffer,
      status: 'listening',
      language: isTranslatingVoice ? `${targetRecognizeLan} → ${targetTranLan}` : currentLanguage
    })
  }
}

export async function startVoiceDictation(): Promise<void> {
  if (isDictating) return

  // 1. Capture the target window BEFORE opening overlay or touching anything
  const fg = getForegroundHwnd()
  if (fg && !isInternalHwnd(fg)) {
    targetHwnd = fg
    updateLastExternalHwnd(fg)
  } else {
    targetHwnd = getLastExternalHwnd()
  }

  // Load voice language from persisted settings
  const settings = getSettings()
  if (settings.voiceLan && settings.voiceLan.trim()) {
    currentLanguage = settings.voiceLan.trim()
  }

  isDictating = true
  isTranslatingVoice = false
  finalBuffer = ''
  partialTranscript = ''
  if (finishTimeout) {
    clearTimeout(finishTimeout)
    finishTimeout = null
  }

  debugLog('voice:dictation-start', {
    targetHwnd: String(targetHwnd),
    language: currentLanguage
  })

  // 2. Open floating non-activating overlay
  openVoiceOverlay({ language: currentLanguage, transcript: '' })

  // 3. Start speech backend session
  try {
    await speechStart({ language: currentLanguage })
  } catch (e: any) {
    debugLog('voice:speechStart-err', { message: e?.message || String(e) })
  }

  // 4. Request main window renderer to start capturing microphone audio
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('voiceDictation:startRecording', {
      language: currentLanguage
    })
  }
}

export async function stopVoiceDictation(): Promise<void> {
  if (!isDictating) return
  isDictating = false
  isTranslatingVoice = false

  debugLog('voice:dictation-stop', {
    collectedLength: finalBuffer.length,
    targetHwnd: String(targetHwnd)
  })

  updateVoiceOverlay({ status: 'processing' })

  // 1. Tell renderer to stop audio stream
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('voiceDictation:stopRecording')
  }

  // 2. Stop speech session and wait briefly for any final packets
  try {
    await speechStop()
  } catch {
    // ignore
  }

  // Short delay to allow any pending 'final' speech event to arrive
  await new Promise((resolve) => setTimeout(resolve, 200))

  const textToInsert = [finalBuffer, partialTranscript].filter(Boolean).join(' ').trim()
  debugLog('voice:inserting', { text: textToInsert, targetHwnd: String(targetHwnd) })

  if (textToInsert) {
    updateVoiceOverlay({ status: 'done', transcript: textToInsert })
    // Insert text into the target application window
    await pasteTextIntoActiveWindow(textToInsert, targetHwnd)
  }

  // Close overlay after a short confirmation
  finishTimeout = setTimeout(() => {
    closeVoiceOverlay()
    finishTimeout = null
  }, 500)
}

/**
 * Voice Translation: hold Translate button to speak, transcribe, translate to tranLan,
 * and automatically paste into the active window at the cursor.
 */
export async function startVoiceTranslation(): Promise<void> {
  if (isDictating) return

  const fg = getForegroundHwnd()
  if (fg && !isInternalHwnd(fg)) {
    targetHwnd = fg
    updateLastExternalHwnd(fg)
  } else {
    targetHwnd = getLastExternalHwnd()
  }

  const settings = getSettings()
  targetRecognizeLan = settings.recognizeLan || 'ar-SA'
  targetTranLan = settings.tranLan || 'English'

  isDictating = true
  isTranslatingVoice = true
  finalBuffer = ''
  partialTranscript = ''
  if (finishTimeout) {
    clearTimeout(finishTimeout)
    finishTimeout = null
  }

  debugLog('voice:translation-start', {
    targetHwnd: String(targetHwnd),
    recognizeLan: targetRecognizeLan,
    tranLan: targetTranLan
  })

  openVoiceOverlay({
    language: `🎙️ ${targetRecognizeLan} → ${targetTranLan}`,
    transcript: ''
  })

  try {
    await speechStart({
      language: targetRecognizeLan,
      tranLan: targetTranLan,
      translate: true
    })
  } catch (e: any) {
    debugLog('voice:translation-speechStart-err', { message: e?.message || String(e) })
  }

  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('voiceDictation:startRecording', {
      language: targetRecognizeLan
    })
  }
}

export async function stopVoiceTranslation(): Promise<void> {
  if (!isDictating && !isTranslatingVoice) return
  isDictating = false
  isTranslatingVoice = false

  debugLog('voice:translation-stop', {
    collectedLength: finalBuffer.length,
    targetHwnd: String(targetHwnd),
    tranLan: targetTranLan
  })

  updateVoiceOverlay({ status: 'processing', transcript: 'Translating...' })

  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('voiceDictation:stopRecording')
  }

  try {
    await speechStop()
  } catch {
    // ignore
  }

  await new Promise((resolve) => setTimeout(resolve, 250))

  const spokenText = [finalBuffer, partialTranscript].filter(Boolean).join(' ').trim()
  debugLog('voice:translation-spoken', { spokenText })

  if (spokenText) {
    try {
      // Translate the spoken speech to the configured target translation language
      const translated = await translateText({
        text: spokenText,
        from: targetRecognizeLan,
        to: targetTranLan
      })

      debugLog('voice:translation-result', { spokenText, translated })

      if (translated) {
        // Also save to clipboard so user has it handy
        try {
          clipboard.writeText(translated)
        } catch {
          // ignore
        }

        updateVoiceOverlay({
          status: 'done',
          transcript: `${spokenText}\n↳ ${translated}`
        })

        // Paste directly into the active window at the cursor!
        await pasteTextIntoActiveWindow(translated, targetHwnd)
      } else {
        await pasteTextIntoActiveWindow(spokenText, targetHwnd)
      }
    } catch (e: any) {
      debugLog('voice:translation-err', { error: e?.message || String(e) })
      // If translation fails, paste the spoken text
      await pasteTextIntoActiveWindow(spokenText, targetHwnd)
    }
  }

  finishTimeout = setTimeout(() => {
    closeVoiceOverlay()
    finishTimeout = null
  }, 600)
}

export function cancelVoiceDictation(): void {
  if (!isDictating) return
  isDictating = false
  isTranslatingVoice = false
  if (finishTimeout) {
    clearTimeout(finishTimeout)
    finishTimeout = null
  }
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('voiceDictation:stopRecording')
  }
  void speechStop().catch(() => {})
  closeVoiceOverlay()
}
