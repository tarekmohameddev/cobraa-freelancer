import type { MouseAction, MouseButtonEvent, MouseGesture } from './types'

const LONG_MS = 500
const DOUBLE_MS = 340
const REPEAT_MS = 90

const HOLD_ACTIONS = new Set<MouseAction>(['voice', 'ai', 'translate'])

type Slot = {
  action: MouseAction
  signature: string
  downAt: number
  lastDownAt: number
  isDown: boolean
  longTimer: ReturnType<typeof setTimeout> | null
  pendingClick: ReturnType<typeof setTimeout> | null
  longFired: boolean
}

function usesHold(action: MouseAction) {
  return HOLD_ACTIONS.has(action)
}

export function createGestureDetector(emit: (evt: MouseButtonEvent) => void) {
  const slots = new Map<string, Slot>()

  function clearLong(slot: Slot) {
    if (slot.longTimer) {
      clearTimeout(slot.longTimer)
      slot.longTimer = null
    }
  }

  function clearPending(slot: Slot) {
    if (slot.pendingClick) {
      clearTimeout(slot.pendingClick)
      slot.pendingClick = null
    }
  }

  function fire(action: MouseAction, gesture: MouseGesture, signature: string) {
    emit({ action, gesture, signature })
  }

  function finish(signature: string) {
    const slot = slots.get(signature)
    if (!slot) return
    clearLong(slot)
    clearPending(slot)
    slots.delete(signature)
  }

  return {
    onEdge(action: MouseAction, signature: string, down: boolean) {
      const now = Date.now()
      let slot = slots.get(signature)

      if (down) {
        if (slot && now - slot.lastDownAt < REPEAT_MS) {
          return
        }

        if (slot?.pendingClick) {
          clearPending(slot)
          clearLong(slot)
          fire(action, 'double', signature)
          finish(signature)
          return
        }

        if (slot?.isDown && usesHold(action)) {
          return
        }

        if (!slot) {
          slot = {
            action,
            signature,
            downAt: now,
            lastDownAt: now,
            isDown: true,
            longTimer: null,
            pendingClick: null,
            longFired: false
          }
          slots.set(signature, slot)
        } else {
          slot.action = action
          slot.downAt = now
          slot.lastDownAt = now
          slot.isDown = true
          slot.longFired = false
        }

        if (usesHold(action)) {
          fire(action, 'down', signature)
          clearLong(slot)
          slot.longTimer = setTimeout(() => {
            slot!.longFired = true
            fire(action, 'long', signature)
          }, LONG_MS)
          return
        }

        // Pulse buttons (Translate / AI / OCR) often send down with no matching
        // up. Treat each debounced down as a tap and wait for a second tap.
        slot.pendingClick = setTimeout(() => {
          fire(action, 'click', signature)
          finish(signature)
        }, DOUBLE_MS)
        return
      }

      if (!slot) return
      if (!usesHold(action)) return
      if (!slot.isDown) return

      slot.isDown = false
      clearLong(slot)
      fire(action, 'up', signature)

      if (slot.longFired) {
        finish(signature)
        return
      }

      slot.pendingClick = setTimeout(() => {
        fire(action, 'click', signature)
        finish(signature)
      }, DOUBLE_MS)
    },

    reset() {
      for (const signature of [...slots.keys()]) finish(signature)
    }
  }
}
