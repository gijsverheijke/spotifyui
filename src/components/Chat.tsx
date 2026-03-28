'use client'

import { useState, useRef, useEffect } from 'react'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  html?: string
}

interface ChatProps {
  messages: Message[]
  onSend: (message: string) => void
  onSelectMessage: (message: Message) => void
  selectedMessageId: string | null
  isLoading: boolean
  userName?: string
  userAvatar?: string
}

export default function Chat({
  messages,
  onSend,
  onSelectMessage,
  selectedMessageId,
  isLoading,
  userName,
  userAvatar,
}: ChatProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (trimmed && !isLoading) {
      onSend(trimmed)
      setInput('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        {userAvatar && (
          <img
            src={userAvatar}
            alt={userName ?? 'User'}
            className="h-8 w-8 rounded-full"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-white">
            Spotify<span className="text-emerald-400">UI</span>
          </h2>
          {userName && (
            <p className="truncate text-xs text-zinc-400">{userName}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="mb-2 text-sm text-zinc-400">Ask anything about your Spotify data</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'What are my top artists?',
                  'Show me my recent history',
                  'Make me a playlist',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => onSend(suggestion)}
                    className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-600 hover:text-white"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => msg.role === 'assistant' && msg.html && onSelectMessage(msg)}
              className={`block w-full text-left ${
                msg.role === 'user'
                  ? 'ml-auto max-w-[85%]'
                  : 'mr-auto max-w-[85%]'
              }`}
            >
              <div
                className={`rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : selectedMessageId === msg.id
                      ? 'bg-zinc-700 text-white ring-1 ring-emerald-500'
                      : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                {msg.content}
                {msg.html && (
                  <span className="mt-1 block text-xs opacity-60">
                    Click to view generated page
                  </span>
                )}
              </div>
            </button>
          ))}

          {isLoading && (
            <div className="mr-auto max-w-[85%]">
              <div className="rounded-xl bg-zinc-800 px-3.5 py-2.5">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your music..."
            rows={1}
            className="max-h-40 flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 1.5L7 9M14.5 1.5L10 14.5L7 9M14.5 1.5L1.5 6L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
