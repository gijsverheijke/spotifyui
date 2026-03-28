'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import CookieInput from '@/components/CookieInput'
import Chat, { type Message, type ChatModel } from '@/components/Chat'
import GeneratedPage from '@/components/GeneratedPage'
import Sidebar from '@/components/Sidebar'
import Toast, { useToast } from '@/components/Toast'

interface UserProfile {
  displayName: string
  avatar?: string
}

interface AuthState {
  accessToken: string
  expiresAt: number
  spDc: string
}

const AUTH_KEY = 'spotifyui_auth'

function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.accessToken && parsed.expiresAt && parsed.spDc) {
      return parsed as AuthState
    }
  } catch {
    // ignore
  }
  return null
}

function saveAuth(auth: AuthState) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY)
}

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null)
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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedHtml = messages.find((m) => m.id === selectedMessageId)?.html ?? null

  const clearSession = useCallback(() => {
    clearAuth()
    setAuth(null)
    setProfile(null)
    setMessages([])
    setSelectedMessageId(null)
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  // Schedule a token refresh 60s before expiry
  const scheduleRefresh = useCallback((authState: AuthState) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    const msUntilRefresh = authState.expiresAt - Date.now() - 60_000
    if (msUntilRefresh <= 0) {
      // Token is already expired or about to expire — refresh now
      import('@/lib/spotify/browser-auth').then(({ exchangeToken }) =>
        exchangeToken(authState.spDc)
          .then((token) => {
            const newAuth: AuthState = {
              accessToken: token.accessToken,
              expiresAt: token.expiresAt,
              spDc: authState.spDc,
            }
            setAuth(newAuth)
            saveAuth(newAuth)
            scheduleRefresh(newAuth)
          })
          .catch(() => {
            // Refresh failed — user will get an error on next action
          }),
      )
      return
    }
    refreshTimerRef.current = setTimeout(() => {
      import('@/lib/spotify/browser-auth').then(({ exchangeToken }) =>
        exchangeToken(authState.spDc)
          .then((token) => {
            const newAuth: AuthState = {
              accessToken: token.accessToken,
              expiresAt: token.expiresAt,
              spDc: authState.spDc,
            }
            setAuth(newAuth)
            saveAuth(newAuth)
            scheduleRefresh(newAuth)
          })
          .catch(() => {
            // Refresh failed silently — next action will surface the error
          }),
      )
    }, msUntilRefresh)
  }, [])

  // Restore session on mount
  useEffect(() => {
    const stored = loadAuth()
    if (!stored) {
      setRestoring(false)
      return
    }

    import('@/lib/spotify/browser-auth').then(({ tokenNeedsRefresh, exchangeToken }) => {
      if (tokenNeedsRefresh(stored.expiresAt)) {
        // Token expired — try to refresh
        exchangeToken(stored.spDc)
          .then((token) => {
            const newAuth: AuthState = {
              accessToken: token.accessToken,
              expiresAt: token.expiresAt,
              spDc: stored.spDc,
            }
            setAuth(newAuth)
            saveAuth(newAuth)
            setProfile({ displayName: 'Spotify User' })
            scheduleRefresh(newAuth)
          })
          .catch(() => {
            clearAuth()
          })
          .finally(() => setRestoring(false))
      } else {
        setAuth(stored)
        setProfile({ displayName: 'Spotify User' })
        scheduleRefresh(stored)
        setRestoring(false)
      }
    })

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuthenticated = useCallback(
    (accessToken: string, expiresAt: number, spDc: string) => {
      const newAuth: AuthState = { accessToken, expiresAt, spDc }
      setAuth(newAuth)
      saveAuth(newAuth)
      setProfile({ displayName: 'Spotify User' })
      setMessages([])
      setSelectedMessageId(null)
      setAuthError(null)
      scheduleRefresh(newAuth)
    },
    [scheduleRefresh],
  )

  const handleSend = useCallback(async (content: string) => {
    if (!auth) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setChatLoading(true)

    try {
      // Check if token needs refresh before sending
      const { tokenNeedsRefresh, exchangeToken } = await import('@/lib/spotify/browser-auth')
      let currentToken = auth.accessToken
      if (tokenNeedsRefresh(auth.expiresAt)) {
        try {
          const token = await exchangeToken(auth.spDc)
          const newAuth: AuthState = {
            accessToken: token.accessToken,
            expiresAt: token.expiresAt,
            spDc: auth.spDc,
          }
          setAuth(newAuth)
          saveAuth(newAuth)
          scheduleRefresh(newAuth)
          currentToken = token.accessToken
        } catch {
          addToast('Session expired. Please re-authenticate.', 'error')
          clearSession()
          return
        }
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          accessToken: currentToken,
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
  }, [model, auth, addToast, clearSession, scheduleRefresh])

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
  if (!auth || !profile) {
    return (
      <CookieInput
        onAuthenticated={handleAuthenticated}
        isLoading={authLoading}
        error={authError}
        onError={setAuthError}
        onLoadingChange={setAuthLoading}
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
