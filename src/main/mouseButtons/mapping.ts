import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { MouseAction, MouseBindingMap } from './types'
import { DEFAULT_SIM_BINDINGS } from './simSignatures'

const EMPTY: MouseBindingMap = { version: 1, bindings: { ...DEFAULT_SIM_BINDINGS } }

function filePath() {
  return path.join(app.getPath('userData'), 'mouse-button-map.json')
}

export function loadBindings(): MouseBindingMap {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as MouseBindingMap
    if (parsed?.version === 1 && parsed.bindings && typeof parsed.bindings === 'object') {
      const cleaned: Record<string, MouseAction> = {}
      for (const [sig, action] of Object.entries(parsed.bindings)) {
        // Accidental keyboard-letter maps from learn-while-typing.
        if (/^llkbd:/.test(sig)) continue
        cleaned[sig] = action
      }
      const merged = { ...DEFAULT_SIM_BINDINGS, ...cleaned }
      return { version: 1, bindings: merged }
    }
  } catch {
    // first run
  }
  return { version: 1, bindings: { ...EMPTY.bindings } }
}

export function saveBindings(map: MouseBindingMap) {
  fs.writeFileSync(filePath(), JSON.stringify(map, null, 2), 'utf8')
}

export function actionLabel(action: MouseAction) {
  switch (action) {
    case 'translate':
      return 'Translate'
    case 'ai':
      return 'AI chat'
    case 'voice':
      return 'Voice'
    case 'ocr':
      return 'OCR'
  }
}
