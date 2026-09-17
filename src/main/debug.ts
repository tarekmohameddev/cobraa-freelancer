export type DebugEvent = {
  ts: string
  category: string
  data: unknown
}

let emit: ((evt: DebugEvent) => void) | null = null

export function setDebugEmitter(fn: ((evt: DebugEvent) => void) | null) {
  emit = fn
}

export function isDebugEnabled() {
  // Always on so the in-app debug panel always shows request/response
  return true
}

function safeStringify(value: unknown) {
  const seen = new WeakSet<object>()
  return JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v as object)) return '[Circular]'
        seen.add(v as object)
      }
      return v
    },
    2
  )
}

function redactString(s: string) {
  if (s.length <= 12) return '[redacted]'
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}

export function redactSecrets(input: unknown): unknown {
  if (input == null) return input
  if (typeof input === 'string') return input
  if (typeof input === 'number' || typeof input === 'boolean') return input
  if (Array.isArray(input)) return input.map(redactSecrets)

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase()
      if (key.includes('password')) out[k] = '[redacted]'
      else if (key === 'token' || key.includes('authorization')) out[k] = typeof v === 'string' ? redactString(v) : '[redacted]'
      else if (key === 'sign') out[k] = typeof v === 'string' ? redactString(v) : '[redacted]'
      else out[k] = redactSecrets(v)
    }
    return out
  }

  return input
}

export function debugLog(category: string, data: unknown) {
  if (!isDebugEnabled()) return
  const evt: DebugEvent = { ts: new Date().toISOString(), category, data: redactSecrets(data) }
  // Terminal / main-process output
  console.log(`[Cobraa Debug] ${evt.ts} ${category}\n${safeStringify(evt.data)}`)
  // Renderer panel (if hooked)
  emit?.(evt)
}

