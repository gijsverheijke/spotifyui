'use client'

import { useState, useEffect, useRef } from 'react'

export interface UserKeys {
  minimax: string
  anthropic: string
}

const STORAGE_KEYS = {
  minimax: 'spotifyui_minimax_key',
  anthropic: 'spotifyui_anthropic_key',
} as const

export function loadUserKeys(): UserKeys {
  if (typeof window === 'undefined') return { minimax: '', anthropic: '' }
  return {
    minimax: localStorage.getItem(STORAGE_KEYS.minimax) ?? '',
    anthropic: localStorage.getItem(STORAGE_KEYS.anthropic) ?? '',
  }
}

export function saveUserKey(provider: keyof UserKeys, value: string) {
  if (value) {
    localStorage.setItem(STORAGE_KEYS[provider], value)
  } else {
    localStorage.removeItem(STORAGE_KEYS[provider])
  }
}

interface SettingsProps {
  open: boolean
  onClose: () => void
  onKeysChange: (keys: UserKeys) => void
  keys: UserKeys
}

function KeyInput({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onClear: () => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="sk-..."
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 pr-10 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            aria-label={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 2l12 12M6.5 6.646a2 2 0 002.854 2.854M13.36 10.16C14.4 9.16 15 8 15 8s-3-5.5-7-5.5a6.3 6.3 0 00-1.77.26M3.64 4.34C2.13 5.36 1 8 1 8s3 5.5 7 5.5c1.12 0 2.17-.32 3.08-.78" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1 8s3-5.5 7-5.5S15 8 15 8s-3 5.5-7 5.5S1 8 1 8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            )}
          </button>
        </div>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-zinc-700 px-2.5 py-2 text-xs text-zinc-400 transition-colors hover:border-red-600 hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export default function Settings({ open, onClose, onKeysChange, keys }: SettingsProps) {
  const [minimax, setMinimax] = useState(keys.minimax)
  const [anthropic, setAnthropic] = useState(keys.anthropic)
  const panelRef = useRef<HTMLDivElement>(null)
  const [prevKeys, setPrevKeys] = useState(keys)
  const [prevOpen, setPrevOpen] = useState(open)

  // Sync local state with props when keys or open changes (render-time state adjustment)
  if (keys !== prevKeys || open !== prevOpen) {
    setPrevKeys(keys)
    setPrevOpen(open)
    setMinimax(keys.minimax)
    setAnthropic(keys.anthropic)
  }

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  function handleSave() {
    saveUserKey('minimax', minimax)
    saveUserKey('anthropic', anthropic)
    onKeysChange({ minimax, anthropic })
    onClose()
  }

  function handleClear(provider: 'minimax' | 'anthropic') {
    if (provider === 'minimax') {
      setMinimax('')
      saveUserKey('minimax', '')
    } else {
      setAnthropic('')
      saveUserKey('anthropic', '')
    }
    onKeysChange({
      minimax: provider === 'minimax' ? '' : minimax,
      anthropic: provider === 'anthropic' ? '' : anthropic,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">API Key Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:text-white"
            aria-label="Close settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <p className="mb-4 text-xs text-zinc-500">
          Provide your own API keys to bypass the shared daily limit. Keys are stored in your browser only.
        </p>

        <div className="space-y-4">
          <KeyInput
            label="MiniMax API Key"
            value={minimax}
            onChange={setMinimax}
            onClear={() => handleClear('minimax')}
          />
          <KeyInput
            label="Anthropic API Key"
            value={anthropic}
            onChange={setAnthropic}
            onClear={() => handleClear('anthropic')}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
