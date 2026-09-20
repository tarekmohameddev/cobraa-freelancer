import type { MouseAction } from './types'

/** Same signatures the physical iTing.AI mouse emits (VID 248A / PID CA08). */
export const SIM_BUTTONS: Array<{
  key: 1 | 2 | 3 | 4
  action: MouseAction
  label: string
  hint: string
  signature: string
}> = [
  { key: 1, action: 'ai', label: 'Cobraa AI', hint: 'Click · Hold voice · Double overlay', signature: 'hid:248A:CA08:st26:1' },
  { key: 2, action: 'translate', label: 'Translate', hint: 'Click / double', signature: 'hid:248A:CA08:st26:2' },
  { key: 3, action: 'ocr', label: 'OCR', hint: 'Click / double', signature: 'hid:248A:CA08:st26:3' },
  { key: 4, action: 'voice', label: 'Voice', hint: 'Click or hold', signature: 'hid:248A:CA08:st26:4' }
]

export const SIM_SIGNATURES: Record<1 | 2 | 3 | 4, string> = {
  1: SIM_BUTTONS[0].signature,
  2: SIM_BUTTONS[1].signature,
  3: SIM_BUTTONS[2].signature,
  4: SIM_BUTTONS[3].signature
}

export const DEFAULT_SIM_BINDINGS: Record<string, MouseAction> = {
  ...Object.fromEntries(SIM_BUTTONS.map((b) => [b.signature, b.action])),
  'llkbd:F8': 'voice'
}

export const SIM_PORT = Number(process.env.COBRAA_SIM_PORT || 17321)
