'use client'

import type { Message } from './Chat'

interface SidebarProps {
  messages: Message[]
  selectedMessageId: string | null
  onSelectMessage: (message: Message) => void
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({
  messages,
  selectedMessageId,
  onSelectMessage,
  isOpen,
  onClose,
}: SidebarProps) {
  const userMessages = messages.filter((m) => m.role === 'user')

  // Find the assistant response that follows each user message
  function getAssistantReply(userMsg: Message): Message | undefined {
    const idx = messages.indexOf(userMsg)
    if (idx < 0) return undefined
    const next = messages[idx + 1]
    return next?.role === 'assistant' ? next : undefined
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-800 bg-zinc-950 transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-300">History</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {userMessages.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-600">
              No messages yet
            </p>
          ) : (
            <ul className="space-y-1">
              {userMessages.map((msg) => {
                const reply = getAssistantReply(msg)
                const isSelected = selectedMessageId === reply?.id
                return (
                  <li key={msg.id}>
                    <button
                      onClick={() => {
                        if (reply?.html) {
                          onSelectMessage(reply)
                        }
                        onClose()
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-zinc-800 ring-1 ring-emerald-500/50'
                          : 'hover:bg-zinc-900'
                      }`}
                    >
                      <p className="truncate text-sm text-zinc-200">
                        {msg.content}
                      </p>
                      {reply && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {reply.html ? '🎨 Page generated' : reply.content.slice(0, 60)}
                        </p>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
