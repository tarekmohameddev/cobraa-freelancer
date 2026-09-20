import React, { useMemo, useState } from 'react'
import {
  Calendar,
  Clock,
  History as HistoryIcon,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { useChat, type ChatSession } from '@renderer/context/ChatContext'

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

interface DateGroup {
  label: string
  sessions: ChatSession[]
}

function groupSessions(sessions: ChatSession[]): DateGroup[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const last7DaysStart = todayStart - 7 * 86400000
  const last30DaysStart = todayStart - 30 * 86400000

  const groups: DateGroup[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Previous 7 Days', sessions: [] },
    { label: 'Previous 30 Days', sessions: [] },
    { label: 'Earlier', sessions: [] }
  ]

  for (const s of sessions) {
    const time = s.updatedAt || s.createdAt || 0
    if (time >= todayStart) {
      groups[0].sessions.push(s)
    } else if (time >= yesterdayStart) {
      groups[1].sessions.push(s)
    } else if (time >= last7DaysStart) {
      groups[2].sessions.push(s)
    } else if (time >= last30DaysStart) {
      groups[3].sessions.push(s)
    } else {
      groups[4].sessions.push(s)
    }
  }

  return groups.filter((g) => g.sessions.length > 0)
}

export function HistoryPage({ onOpenChat }: { onOpenChat: () => void }) {
  const { sessions, activeSessionId, loadSession, deleteSession, clearAllSessions, startNewChat } =
    useChat()
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((s) => {
      if (s.title.toLowerCase().includes(query)) return true
      return s.messages.some((m) => m.content.toLowerCase().includes(query))
    })
  }, [sessions, searchQuery])

  const grouped = useMemo(() => groupSessions(filteredSessions), [filteredSessions])

  const handleOpenSession = (id: string) => {
    loadSession(id)
    onOpenChat()
  }

  const handleNewChat = () => {
    startNewChat()
    onOpenChat()
  }

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Header bar */}
      <div className="border-b border-zinc-200/80 px-6 py-4 dark:border-zinc-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              <HistoryIcon className="h-5 w-5 text-[#00007B] dark:text-blue-400" />
              <span>Conversation History</span>
              <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {sessions.length}
              </span>
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Browse, resume, or manage your saved conversations with Cobraa AI
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#00007B] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#00007B]/20 transition hover:bg-[#000060]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>

            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {/* Search row */}
        {sessions.length > 0 && (
          <div className="mt-3.5 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat history by title or message..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-9 pr-8 text-xs text-zinc-800 placeholder-zinc-400 transition focus:border-[#00007B] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#00007B] dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-blue-500 dark:focus:bg-zinc-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Clear All */}
      {confirmClearOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Clear All Chat History?
            </h3>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              This will permanently delete all {sessions.length} saved conversations. This action
              cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="rounded-xl border border-zinc-200 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAllSessions()
                  setConfirmClearOpen(false)
                }}
                className="rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {sessions.length === 0 ? (
          /* Global empty state */
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#00007B]/10 border border-[#00007B]/20 text-[#00007B] dark:text-blue-300 mb-4 shadow-sm">
              <HistoryIcon className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">No Chat History Yet</h2>
            <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
              Conversations you have with Cobraa AI will be automatically stored here when you close
              them or start a new chat.
            </p>
            <button
              type="button"
              onClick={handleNewChat}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#00007B] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-[#00007B]/20 transition hover:bg-[#000060]"
            >
              <Plus className="h-4 w-4" />
              <span>Start a New Conversation</span>
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          /* Search empty state */
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <Search className="h-8 w-8 text-zinc-400 mb-2 opacity-60" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No conversations found matching &quot;{searchQuery}&quot;
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-3 text-xs text-[#00007B] dark:text-blue-400 hover:underline"
            >
              Clear search filter
            </button>
          </div>
        ) : (
          /* Grouped conversation cards */
          <div className="mx-auto max-w-4xl space-y-6">
            {grouped.map((group) => (
              <div key={group.label} className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {group.label}
                  </h2>
                  <span className="text-[11px] text-zinc-400">({group.sessions.length})</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {group.sessions.map((session) => {
                    const isActive = activeSessionId === session.id
                    const lastMessage = session.messages[session.messages.length - 1]
                    const snippet = lastMessage?.content
                      ? lastMessage.content.slice(0, 100) + (lastMessage.content.length > 100 ? '…' : '')
                      : 'Empty conversation'

                    return (
                      <div
                        key={session.id}
                        onClick={() => handleOpenSession(session.id)}
                        className={[
                          'group relative flex flex-col justify-between rounded-xl border p-4 transition cursor-pointer shadow-sm',
                          isActive
                            ? 'border-[#00007B]/40 bg-[#00007B]/5 dark:border-blue-500/40 dark:bg-blue-950/20 ring-1 ring-[#00007B]/20'
                            : 'border-zinc-200/90 bg-white hover:border-zinc-300 hover:bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <MessageSquare className="h-4 w-4 shrink-0 text-[#00007B] dark:text-blue-400 opacity-80" />
                              <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                                {session.title}
                              </h3>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteSession(session.id)
                              }}
                              title="Delete conversation"
                              className="shrink-0 p-1 rounded-lg text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <p className="mt-2 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {snippet}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-400 dark:border-zinc-800/80">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(session.updatedAt)} · {formatTime(session.updatedAt)}
                          </span>

                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {session.messages.length} msg{session.messages.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
