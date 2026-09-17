import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { QuickCaptureOverlay } from './pages/QuickCaptureOverlay'
import { QuickCaptureResult } from './pages/QuickCaptureResult'
import './global.css'

const windowType = new URLSearchParams(window.location.search).get('window')
const rootEl = document.getElementById('root')!

if (windowType === 'overlay') {
  // Transparent background for snipping overlay
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
  document.body.style.overflow = 'hidden'
  ReactDOM.createRoot(rootEl).render(<QuickCaptureOverlay />)
} else if (windowType === 'result') {
  // Dark theme for the result popup
  document.documentElement.classList.add('dark')
  ReactDOM.createRoot(rootEl).render(<QuickCaptureResult />)
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

