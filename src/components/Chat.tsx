'use client'

import { useState, useRef, useEffect } from 'react'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  html?: string
}

export type ChatModel = 'minimax' | 'anthropic'

interface ChatProps {
  messages: Message[]
  onSend: (message: string) => void
  onSelectMessage: (message: Message) => void
  selectedMessageId: string | null
  isLoading: boolean
  streamingSteps: string[]
  userName?: string
  userAvatar?: string
  model: ChatModel
  onModelChange: (model: ChatModel) => void
  onMenuClick?: () => void
  onSettingsClick?: () => void
  keyStatus?: string
}

export default function Chat({
  messages,
  onSend,
  onSelectMessage,
  selectedMessageId,
  isLoading,
  streamingSteps,
  userName,
  userAvatar,
  model,
  onModelChange,
  onMenuClick,
  onSettingsClick,
  keyStatus,
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
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="rounded p-1 text-zinc-400 hover:text-white lg:hidden"
            aria-label="Open history"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
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
        {keyStatus && (
          <span className="hidden text-xs text-zinc-500 sm:inline">{keyStatus}</span>
        )}
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value as ChatModel)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 outline-none transition-colors focus:border-emerald-500"
        >
          <option value="anthropic">Anthropic</option>
          <option value="minimax">MiniMax</option>
        </select>
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="rounded p-1 text-zinc-400 hover:text-white"
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M7.5 2.25h3l.375 1.875.975.525 1.8-.675 1.5 2.6-1.425 1.2v1.05l1.425 1.2-1.5 2.6-1.8-.675-.975.525L10.5 15.75h-3l-.375-1.875-.975-.525-1.8.675-1.5-2.6 1.425-1.2V9.175l-1.425-1.2 1.5-2.6 1.8.675.975-.525L7.5 2.25z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              {userAvatar && (
                <img
                  src={userAvatar}
                  alt={userName ?? 'User'}
                  className="mx-auto mb-3 h-16 w-16 rounded-full ring-2 ring-zinc-700"
                />
              )}
              <h3 className="mb-1 text-lg font-semibold text-white">
                Hey{userName ? `, ${userName}` : ''}!
              </h3>
              <p className="mb-5 text-sm text-zinc-400">What would you like to explore?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'Show me my top artists',
                  'What have I been listening to?',
                  'Analyze my music taste',
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
                {streamingSteps.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {streamingSteps.map((step, i) => (
                      <p key={i} className={`text-xs italic ${i === streamingSteps.length - 1 ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        {step}
                      </p>
                    ))}
                  </div>
                )}
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
