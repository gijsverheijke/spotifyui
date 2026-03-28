'use client'

import { useState, useCallback } from 'react'
import CookieInput from '@/components/CookieInput'
import Chat, { type Message } from '@/components/Chat'
import GeneratedPage from '@/components/GeneratedPage'

interface UserProfile {
  displayName: string
  avatar?: string
}

type ChatModel = 'minimax' | 'anthropic'

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [model] = useState<ChatModel>('minimax')

  const selectedHtml = messages.find((m) => m.id === selectedMessageId)?.html ?? null

  const handleCookieSubmit = useCallback(async (spDc: string) => {
    setAuthLoading(true)
    setAuthError(null)

    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sp_dc: spDc }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to authenticate. Check your cookie and try again.')
      }

      const data = await res.json()
      setSessionId(data.sessionId ?? null)
      setProfile({
        displayName: data.profile?.displayName ?? 'Spotify User',
        avatar: data.profile?.avatar,
      })
      setMessages([])
      setSelectedMessageId(null)
    } catch (err) {
      setSessionId(null)
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const handleSend = useCallback(async (content: string) => {
    if (!sessionId) {
      return
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setChatLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          sessionId,
          model,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Something went wrong')
      }

      const data = await res.json()

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message ?? 'Here you go!',
        html: data.html,
      }

      setMessages((prev) => [...prev, assistantMessage])

      if (data.html) {
        setSelectedMessageId(assistantMessage.id)
      }
    } catch (err) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }, [model, sessionId])

  const handleSelectMessage = useCallback((msg: Message) => {
    setSelectedMessageId(msg.id)
  }, [])

  // State 1: Not authenticated
  if (!sessionId || !profile) {
    return (
      <CookieInput
        onSubmit={handleCookieSubmit}
        isLoading={authLoading}
        error={authError}
      />
    )
  }

  // State 2: Authenticated — chat + generated page
  return (
    <div className="flex h-screen">
      {/* Chat sidebar */}
      <div className="w-80 shrink-0 border-r border-zinc-800 lg:w-96">
        <Chat
          messages={messages}
          onSend={handleSend}
          onSelectMessage={handleSelectMessage}
          selectedMessageId={selectedMessageId}
          isLoading={chatLoading}
          userName={profile.displayName}
          userAvatar={profile.avatar}
        />
      </div>

      {/* Generated page area */}
      <div className="flex-1">
        <GeneratedPage html={selectedHtml} />
      </div>
    </div>
  )
}
