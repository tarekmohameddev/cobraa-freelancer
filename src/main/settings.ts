import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { debugLog } from './debug'

export type AppSettings = {
  recognizeLan: string
  tranLan: string
  voiceLan: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  recognizeLan: 'ar-SA',
  tranLan: 'English',
  voiceLan: 'en-US'
}

function settingsPath(): string {
  try {
    return path.join(app.getPath('userData'), 'settings.json')
  } catch {
    return path.join(process.cwd(), 'settings.json')
  }
}

let cachedSettings: AppSettings | null = null

export function getSettings(): AppSettings {
  if (cachedSettings) return { ...cachedSettings }
  try {
    const file = settingsPath()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8')
      const parsed = JSON.parse(raw)
      cachedSettings = {
        recognizeLan: typeof parsed?.recognizeLan === 'string' && parsed.recognizeLan.trim() ? parsed.recognizeLan.trim() : DEFAULT_SETTINGS.recognizeLan,
        tranLan: typeof parsed?.tranLan === 'string' && parsed.tranLan.trim() ? parsed.tranLan.trim() : DEFAULT_SETTINGS.tranLan,
        voiceLan: typeof parsed?.voiceLan === 'string' && parsed.voiceLan.trim() ? parsed.voiceLan.trim() : DEFAULT_SETTINGS.voiceLan
      }
      return { ...cachedSettings }
    }
  } catch (e: any) {
    debugLog('settings.load-error', { error: e?.message })
  }

  cachedSettings = { ...DEFAULT_SETTINGS }
  return { ...cachedSettings }
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next: AppSettings = {
    recognizeLan: partial.recognizeLan?.trim() || current.recognizeLan,
    tranLan: partial.tranLan?.trim() || current.tranLan,
    voiceLan: partial.voiceLan?.trim() || current.voiceLan
  }
  cachedSettings = next
  try {
    const file = settingsPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
    debugLog('settings.saved', next)
  } catch (e: any) {
    debugLog('settings.save-error', { error: e?.message })
  }
  return { ...next }
}
