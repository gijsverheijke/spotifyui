'use client'

import { useState, useCallback, useEffect } from 'react'
import CookieInput from '@/components/CookieInput'
import Chat, { type Message, type ChatModel } from '@/components/Chat'
import GeneratedPage from '@/components/GeneratedPage'
import Sidebar from '@/components/Sidebar'
import Toast, { useToast } from '@/components/Toast'

interface UserProfile {
  displayName: string
  avatar?: string
}

const SESSION_KEY = 'spotifyui_session_id'

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [model, setModel] = useState<ChatModel>('minimax')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { toasts, addToast, dismissToast } = useToast()

  const selectedHtml = messages.find((m) => m.id === selectedMessageId)?.html ?? null

  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setSessionId(null)
    setProfile(null)
    setMessages([])
    setSelectedMessageId(null)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) {
      setRestoring(false)
      return
    }

    fetch(`/api/auth/validate?sessionId=${encodeURIComponent(stored)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setSessionId(stored)
          setProfile({
            displayName: data.profile?.displayName ?? 'Spotify User',
            avatar: data.profile?.avatar,
          })
        } else {
          localStorage.removeItem(SESSION_KEY)
        }
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY)
      })
      .finally(() => {
        setRestoring(false)
      })
  }, [])

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
      const newSessionId = data.sessionId ?? null
      setSessionId(newSessionId)
      if (newSessionId) {
        localStorage.setItem(SESSION_KEY, newSessionId)
      }
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
        if (res.status === 401) {
          addToast('Session expired. Please re-authenticate.', 'error')
          clearSession()
          return
        }
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
      addToast(err instanceof Error ? err.message : 'Something went wrong. Please try again.', 'error')
    } finally {
      setChatLoading(false)
    }
  }, [model, sessionId, addToast, clearSession])

  const handleSelectMessage = useCallback((msg: Message) => {
    setSelectedMessageId(msg.id)
  }, [])

  // State 0: Restoring session
  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500" />
          <p className="text-sm text-zinc-400">Restoring session...</p>
        </div>
      </div>
    )
  }

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
    <div className="flex h-screen flex-col lg:flex-row">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* History sidebar */}
      <Sidebar
        messages={messages}
        selectedMessageId={selectedMessageId}
        onSelectMessage={handleSelectMessage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Chat panel */}
      <div className="flex h-1/2 shrink-0 flex-col border-b border-zinc-800 lg:h-full lg:w-96 lg:border-b-0 lg:border-r">
        <Chat
          messages={messages}
          onSend={handleSend}
          onSelectMessage={handleSelectMessage}
          selectedMessageId={selectedMessageId}
          isLoading={chatLoading}
          userName={profile.displayName}
          userAvatar={profile.avatar}
          model={model}
          onModelChange={setModel}
          onMenuClick={() => setSidebarOpen(true)}
        />
      </div>

      {/* Generated page area */}
      <div className="min-h-0 flex-1">
        <GeneratedPage html={selectedHtml} />
      </div>
    </div>
  )
}
