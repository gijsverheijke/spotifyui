'use client'

import { useState } from 'react'

interface CookieInputProps {
  onSubmit: (cookie: string) => void
  isLoading: boolean
  error: string | null
}

export default function CookieInput({ onSubmit, isLoading, error }: CookieInputProps) {
  const [cookie, setCookie] = useState('')
  const [accepted, setAccepted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = cookie.trim()
    if (trimmed && accepted) {
      onSubmit(trimmed)
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

          <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-xs text-zinc-400">
            <p>By continuing you acknowledge that:</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>This app uses your cookie to access Spotify&apos;s <strong className="text-zinc-300">internal web API</strong>. This is not officially supported and may violate Spotify&apos;s terms of service.</li>
              <li>The AI has <strong className="text-zinc-300">read-only access</strong> to your Spotify data. It will not create, modify, or delete anything in your account.</li>
              <li>The creator of this proof of concept accepts <strong className="text-zinc-300">no liability</strong> for lost data or loss of access to your Spotify account.</li>
            </ul>
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500 accent-emerald-500"
              />
              <span className="text-zinc-300">I understand and want to continue</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading || !cookie.trim() || !accepted}
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
