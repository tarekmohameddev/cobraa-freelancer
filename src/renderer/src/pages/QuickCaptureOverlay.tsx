import React, { useCallback, useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

function toRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

export function QuickCaptureOverlay() {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const api = (window as any).api as
    | { quickCaptureCancel?: () => void; quickCaptureRegionSelected?: (r: Rect) => void }
    | undefined

  const sel = start && current ? toRect(start, current) : null
  const hasSelection = sel && sel.width > 5 && sel.height > 5

  const cancel = useCallback(() => {
    api?.quickCaptureCancel?.()
  }, [api])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setDragging(true)
    setStart({ x: e.clientX, y: e.clientY })
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  const onMouseUp = (e: React.MouseEvent) => {
    if (!dragging || !start) return
    setDragging(false)
    const end = { x: e.clientX, y: e.clientY }
    const rect = toRect(start, end)
    if (rect.width < 5 || rect.height < 5) {
      setStart(null)
      setCurrent(null)
      return
    }
    api?.quickCaptureRegionSelected?.(rect)
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 select-none overflow-hidden"
      style={{
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.38)',
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Hint banner */}
      {!dragging && (
        <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
          <div
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-xl"
            style={{ background: 'rgba(24, 24, 27, 0.88)', backdropFilter: 'blur(8px)' }}
          >
            Drag to select a region
            <span className="ml-3 text-zinc-400">· ESC to cancel</span>
          </div>
        </div>
      )}

      {/* Overlay cutout — box-shadow technique creates dark vignette outside selection */}
      {sel && sel.width > 0 && sel.height > 0 && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: sel.x,
            top: sel.y,
            width: sel.width,
            height: sel.height,
            border: '2px solid #10b981',
            background: 'rgba(16, 185, 129, 0.04)',
            // Spread the dark shadow outside the selection, removing the underlying dark overlay visually
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.0)',
            zIndex: 5
          }}
        >
          {/* Corner handles */}
          {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
            <span
              key={pos}
              style={{
                position: 'absolute',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#10b981',
                top: pos[0] === 't' ? -5 : 'auto',
                bottom: pos[0] === 'b' ? -5 : 'auto',
                left: pos[1] === 'l' ? -5 : 'auto',
                right: pos[1] === 'r' ? -5 : 'auto'
              }}
            />
          ))}

          {/* Size label */}
          {sel.width > 70 && sel.height > 26 && (
            <span
              style={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                background: 'rgba(24, 24, 27, 0.85)',
                color: '#d4d4d8',
                fontSize: 11,
                padding: '1px 5px',
                borderRadius: 4
              }}
            >
              {Math.round(sel.width)} × {Math.round(sel.height)}
            </span>
          )}
        </div>
      )}

      {/* Cancel button (top-right) */}
      <button
        type="button"
        onClick={cancel}
        className="pointer-events-auto absolute right-5 top-5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700/60"
        style={{ background: 'rgba(24,24,27,0.7)', zIndex: 20 }}
      >
        Cancel
      </button>
    </div>
  )
}
