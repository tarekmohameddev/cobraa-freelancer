import React, { useEffect, useRef, useState } from 'react'
import { Check, Save } from 'lucide-react'
import { getApi, type AppSettings } from '@renderer/lib/ipc'

const RECOGNIZE_LANGS = [
  { code: 'ar-SA', label: 'العربية — Arabic (ar-SA)' },
  { code: 'en-US', label: 'English — USA (en-US)' },
  { code: 'en-GB', label: 'English — UK (en-GB)' },
  { code: 'zh-CN', label: '中文 — Chinese Simplified (zh-CN)' },
  { code: 'zh-TW', label: '中文 — Chinese Traditional (zh-TW)' },
  { code: 'fr-FR', label: 'Français — French (fr-FR)' },
  { code: 'de-DE', label: 'Deutsch — German (de-DE)' },
  { code: 'es-ES', label: 'Español — Spanish (es-ES)' },
  { code: 'it-IT', label: 'Italiano — Italian (it-IT)' },
  { code: 'ja-JP', label: '日本語 — Japanese (ja-JP)' },
  { code: 'ko-KR', label: '한국어 — Korean (ko-KR)' },
  { code: 'ru-RU', label: 'Русский — Russian (ru-RU)' },
  { code: 'pt-BR', label: 'Português — Portuguese (pt-BR)' },
  { code: 'tr-TR', label: 'Türkçe — Turkish (tr-TR)' }
]

const VOICE_LANGS = [
  { code: 'en-US', label: 'English — USA (en-US)' },
  { code: 'en-GB', label: 'English — UK (en-GB)' },
  { code: 'ar-SA', label: 'العربية — Arabic (ar-SA)' },
  { code: 'zh-CN', label: '中文 — Chinese Simplified (zh-CN)' },
  { code: 'zh-TW', label: '中文 — Chinese Traditional (zh-TW)' },
  { code: 'fr-FR', label: 'Français — French (fr-FR)' },
  { code: 'de-DE', label: 'Deutsch — German (de-DE)' },
  { code: 'es-ES', label: 'Español — Spanish (es-ES)' },
  { code: 'it-IT', label: 'Italiano — Italian (it-IT)' },
  { code: 'ja-JP', label: '日本語 — Japanese (ja-JP)' },
  { code: 'ko-KR', label: '한국어 — Korean (ko-KR)' },
  { code: 'ru-RU', label: 'Русский — Russian (ru-RU)' },
  { code: 'pt-BR', label: 'Português — Portuguese (pt-BR)' },
  { code: 'tr-TR', label: 'Türkçe — Turkish (tr-TR)' }
]

const TRAN_LANGS = [
  { code: 'English', label: 'English' },
  { code: 'Arabic', label: 'العربية — Arabic' },
  { code: 'Chinese', label: '中文 — Chinese' },
  { code: 'French', label: 'Français — French' },
  { code: 'German', label: 'Deutsch — German' },
  { code: 'Spanish', label: 'Español — Spanish' },
  { code: 'Italian', label: 'Italiano — Italian' },
  { code: 'Japanese', label: '日本語 — Japanese' },
  { code: 'Korean', label: '한국어 — Korean' },
  { code: 'Russian', label: 'Русский — Russian' },
  { code: 'Portuguese', label: 'Português — Portuguese' },
  { code: 'Turkish', label: 'Türkçe — Turkish' }
]

const SELECT_CLS =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00007B]/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({ recognizeLan: 'ar-SA', tranLan: 'English', voiceLan: 'en-US' })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void getApi()
      .settingsGet()
      .then((s) => {
        setSettings(s)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    try {
      await getApi().settingsSet(settings)
      setSaved(true)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      console.error('Failed to save settings:', e)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white dark:bg-zinc-950">
        <div className="text-sm text-zinc-400 dark:text-zinc-600">Loading settings…</div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-white dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-xl p-6 flex flex-col gap-6">

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Settings</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Configure languages for the Translate button and the Voice Dictation button.
          </p>
        </div>

        {/* Voice Translation Settings Card */}
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 flex flex-col gap-5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00007B]/10 text-[#00007B] dark:bg-[#00007B]/20 dark:text-blue-300 shrink-0">
              <span className="text-lg">🎙️</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Voice Translation</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Hold the Translate button on the mouse to speak and auto-translate
              </div>
            </div>
          </div>

          {/* recognizeLan */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              recognizeLan — لغة الكلام (Spoken Language)
            </label>
            <select
              value={settings.recognizeLan}
              onChange={(e) => setSettings((prev) => ({ ...prev, recognizeLan: e.target.value }))}
              className={SELECT_CLS}
            >
              {RECOGNIZE_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              اللغة اللي هتتكلم بيها في الميكروفون — The language you will speak in the microphone.
            </p>
          </div>

          {/* tranLan */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              tranLan — لغة الترجمة (Translation Target)
            </label>
            <select
              value={settings.tranLan}
              onChange={(e) => setSettings((prev) => ({ ...prev, tranLan: e.target.value }))}
              className={SELECT_CLS}
            >
              {TRAN_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              النص المترجم هيتكتب في الحقل اللي واقف عليه — Translated text will be typed at your cursor.
            </p>
          </div>
        </div>

        {/* Voice Dictation Settings Card */}
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 flex flex-col gap-5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00007B]/10 text-[#00007B] dark:bg-[#00007B]/20 dark:text-blue-300 shrink-0">
              <span className="text-lg">🎤</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Voice Dictation</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Hold the Voice button or F8 to speak and type at your cursor
              </div>
            </div>
          </div>

          {/* voiceLan */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              voiceLan — Dictation Language
            </label>
            <select
              value={settings.voiceLan}
              onChange={(e) => setSettings((prev) => ({ ...prev, voiceLan: e.target.value }))}
              className={SELECT_CLS}
            >
              {VOICE_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              The language you will speak in — text will be typed directly at your cursor in any app.
            </p>
          </div>
        </div>

        {/* How-to guide */}
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-5 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">🖱️ Button Guide</div>
          <div className="flex flex-col gap-2.5">
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Translate Button</div>
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center rounded-lg bg-[#34d399]/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                Click
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Translates current clipboard text (Ctrl+C text) and saves the translation back to the clipboard — then Ctrl+V anywhere to paste.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center rounded-lg bg-[#00007B]/10 px-2.5 py-1 text-xs font-bold text-[#00007B] dark:text-blue-300 shrink-0 whitespace-nowrap">
                Hold ≥0.5s
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Opens the microphone — speak in <strong>{settings.recognizeLan}</strong>, translates to{' '}
                <strong>{settings.tranLan}</strong>, and types the result directly at your cursor in any app.
              </span>
            </div>

            <div className="mt-1 border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
              <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Voice Button / F8</div>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center rounded-lg bg-[#00007B]/10 px-2.5 py-1 text-xs font-bold text-[#00007B] dark:text-blue-300 shrink-0 whitespace-nowrap">
                Hold ≥0.5s
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Opens the microphone — speak in <strong>{settings.voiceLan}</strong> and the transcript is typed directly at your cursor in any app (no translation).
              </span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#00007B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#00007B]/20 transition hover:bg-[#000060]"
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
