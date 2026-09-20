import React from 'react'
import type { ChatMessage as ChatMessageT } from '@renderer/lib/ipc'
import { Bot, User } from 'lucide-react'

export function ChatMessage({ message }: { message: ChatMessageT }) {
  const isUser = message.role === 'user'
  const isPending = Boolean(message.pending) || message.content === '...' || message.content === '…'

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={[
          'flex min-w-0 max-w-[85%] gap-3',
          isUser ? 'flex-row-reverse' : 'flex-row'
        ].join(' ')}
      >
        <div
          className={[
            'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border',
            isUser
              ? 'border-[#00007B]/20 bg-[#00007B]/5 text-[#00007B] dark:border-[#00007B]/40 dark:bg-[#00007B]/20 dark:text-blue-200'
              : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200'
          ].join(' ')}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>

        <div
          className={[
            'min-w-0 rounded-2xl border px-4 py-3 shadow-sm',
            isUser
              ? 'border-[#00007B]/20 bg-[#00007B]/5 dark:border-[#00007B]/40 dark:bg-[#00007B]/20'
              : 'border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/60'
          ].join(' ')}
        >
          {isPending ? (
            <div className="flex h-5 items-center gap-1" aria-label="Assistant is typing">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
              {message.content}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
