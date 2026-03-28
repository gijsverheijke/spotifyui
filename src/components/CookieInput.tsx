'use client'

import { useState } from 'react'

interface CookieInputProps {
  onAuthenticated: (accessToken: string, expiresAt: number, spDc: string) => void
  isLoading: boolean
  error: string | null
  onError: (error: string) => void
  onLoadingChange: (loading: boolean) => void
}

export default function CookieInput({ onAuthenticated, isLoading, error, onError, onLoadingChange }: CookieInputProps) {
  const [cookie, setCookie] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = cookie.trim()
    if (!trimmed) return

    onLoadingChange(true)
    onError('')

    try {
      const { exchangeToken } = await import('@/lib/spotify/browser-auth')
      const token = await exchangeToken(trimmed)

      if (token.isAnonymous) {
        throw new Error('Invalid cookie — got anonymous token. Check your sp_dc value.')
      }

      onAuthenticated(token.accessToken, token.expiresAt, trimmed)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      onLoadingChange(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-white">
            Spotify<span className="text-emerald-400">UI</span>
          </h1>
          <p className="text-sm text-zinc-400">
            Explore your Spotify data through AI-generated pages
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="sp_dc" className="mb-1.5 block text-sm font-medium text-zinc-300">
              sp_dc Cookie
            </label>
            <input
              id="sp_dc"
              type="password"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="Paste your sp_dc cookie here"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              disabled={isLoading}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !cookie.trim()}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Connecting...' : 'Connect'}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-800/50 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            How to get your cookie
          </h3>
          <ol className="space-y-1 text-xs text-zinc-500">
            <li>1. Open <span className="text-zinc-300">open.spotify.com</span> and log in</li>
            <li>2. Open DevTools (F12) &rarr; Application &rarr; Cookies</li>
            <li>3. Find <code className="rounded bg-zinc-700 px-1 text-zinc-300">sp_dc</code> and copy its value</li>
            <li>4. Paste it above</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
