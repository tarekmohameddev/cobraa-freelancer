import React, { useState } from 'react'
import {
  CircleHelp,
  History as HistoryIcon,
  Image,
  Languages,
  MessageSquare,
  Mic,
  Plus,
  ScanText,
  Settings as SettingsIcon,
  Trash2
} from 'lucide-react'
import type { AppView } from '@renderer/components/AppShell'
import logoUrl from '@renderer/assets/logo.png'
import { useChat } from '@renderer/context/ChatContext'

function SidebarToggleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <path d="M9 3v18" />
      <path d="M6 8h1" />
      <path d="M6 12h1" />
    </svg>
  )
}

interface NavItem {
  id: AppView
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

const MAIN_NAV_ITEMS: NavItem[] = [
  { id: 'chat', label: 'Cobraa AI', Icon: MessageSquare },
  { id: 'translate', label: 'Translate', Icon: Languages },
  { id: 'ocr', label: 'Image to Text', Icon: Image },
  { id: 'quick-ocr', label: 'OCR', Icon: ScanText },
  { id: 'voice', label: 'Voice', Icon: Mic }
]

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'faq', label: 'FAQ', Icon: CircleHelp },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
]

export function Sidebar({
  view,
  setView
}: {
  view: AppView
  setView: (v: AppView) => void
  userLabel?: string
}) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('cobraa:sidebarCollapsed') === '1'
  })

  const { sessions, activeSessionId, loadSession, deleteSession, startNewChat } = useChat()

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('cobraa:sidebarCollapsed', next ? '1' : '0')
      return next
    })
  }

  const handleOpenChatSession = (id: string) => {
    loadSession(id)
    setView('chat')
  }

  const handleStartNewChat = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    startNewChat()
    setView('chat')
  }

  const renderItem = (item: NavItem) => {
    const isActive = view === item.id
    const IconComponent = item.Icon
    const isChatNav = item.id === 'chat'

    return (
      <div key={item.id} className="group/item relative flex items-center">
        <button
          type="button"
          onClick={() => setView(item.id)}
          title={collapsed ? item.label : undefined}
          className={[
            'flex w-full items-center rounded-xl transition-colors',
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2 text-sm font-medium',
            isActive
              ? 'bg-[#00007B] text-white shadow-sm shadow-[#00007B]/20'
              : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
          ].join(' ')}
        >
          <IconComponent className={collapsed ? 'h-5 w-5 shrink-0' : 'h-4 w-4 shrink-0'} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </button>

        {!collapsed && isChatNav && (
          <button
            type="button"
            onClick={handleStartNewChat}
            title="Start new chat"
            className={[
              'absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 transition opacity-0 group-hover/item:opacity-100',
              isActive
                ? 'text-white/80 hover:bg-white/20 hover:text-white'
                : 'text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200'
            ].join(' ')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={[
        'flex h-full shrink-0 flex-col border-r border-zinc-200 bg-white/60 backdrop-blur transition-all duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-950/40',
        collapsed ? 'w-[72px]' : 'w-[268px]'
      ].join(' ')}
    >
      {/* Header Area */}
      <div
        className={`pb-5 pt-4 select-none ${collapsed ? 'px-2' : 'px-4'}`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {collapsed ? (
          /* Collapsed Header */
          <div className="flex flex-col items-center gap-2.5">
            <button
              type="button"
              onClick={toggleCollapsed}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              title="Expand sidebar"
            >
              <SidebarToggleIcon className="h-4 w-4" />
            </button>

            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#00007B] to-[#0d148b] p-1.5 shadow-md shadow-[#00007B]/25 ring-1 ring-black/5 dark:ring-white/10 cursor-pointer"
              onClick={toggleCollapsed}
              title="Cobraa"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <img src={logoUrl} alt="Cobraa Logo" className="h-full w-full object-contain" />
            </div>
          </div>
        ) : (
          /* Expanded Header */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#00007B] to-[#0d148b] p-1.5 shadow-md shadow-[#00007B]/25 ring-1 ring-black/5 dark:ring-white/10">
                <img src={logoUrl} alt="Cobraa Logo" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <span className="text-lg font-black tracking-tight text-zinc-900 dark:text-white truncate">
                  Cobraa
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleCollapsed}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              title="Collapse sidebar"
            >
              <SidebarToggleIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Scrollable Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-1 space-y-1 select-none">
        {/* Main Items: Cobraa AI, Translate, Image to Text, OCR, Voice */}
        <div className="space-y-0.5">{MAIN_NAV_ITEMS.map(renderItem)}</div>

        <div className="my-2.5 border-t border-zinc-100 dark:border-zinc-800/80" />

        {/* History Section */}
        <div className="space-y-1">
          {/* History Nav Header */}
          <div className="relative flex items-center">
            {renderItem({ id: 'history', label: 'History', Icon: HistoryIcon })}
          </div>

          {/* History Items (when expanded) */}
          {!collapsed && (
            <div className="space-y-0.5 pt-0.5">
              {sessions.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500 italic">
                  No chat history yet
                </div>
              ) : (
                <div className="space-y-0.5 max-h-56 overflow-y-auto pr-0.5">
                  {sessions.slice(0, 8).map((session) => {
                    const isCurrentChat = view === 'chat' && activeSessionId === session.id
                    return (
                      <div
                        key={session.id}
                        onClick={() => handleOpenChatSession(session.id)}
                        title={session.title}
                        className={[
                          'group relative flex items-center justify-between rounded-lg px-3 py-1.5 text-xs transition cursor-pointer',
                          isCurrentChat
                            ? 'bg-[#00007B]/10 text-[#00007B] font-medium dark:bg-[#00007B]/30 dark:text-blue-300'
                            : 'text-zinc-600 hover:bg-zinc-100/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
                          <span className="truncate">{session.title}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteSession(session.id)
                          }}
                          title="Delete chat"
                          className="ml-1 shrink-0 p-0.5 rounded text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* View All Button */}
              {sessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setView('history')}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition flex items-center justify-between"
                >
                  <span>...View all</span>
                  <span className="text-[10px] text-zinc-400">({sessions.length})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Pinned Area: FAQ & Settings */}
      <div
        className={`pt-2 pb-3 border-t border-zinc-100 dark:border-zinc-800 select-none ${
          collapsed ? 'px-2' : 'px-2.5'
        } space-y-0.5`}
      >
        {BOTTOM_ITEMS.map(renderItem)}
      </div>
    </div>
  )
}
