'use client'

import { useRef, useEffect } from 'react'

interface GeneratedPageProps {
  html: string | null
}

export default function GeneratedPage({ html }: GeneratedPageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!iframeRef.current || !html) return

    const doc = iframeRef.current.contentDocument
    if (!doc) return

    doc.open()
    doc.write(html)
    doc.close()
  }, [html])

  if (!html) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-900">
        <div className="text-center">
          <div className="mb-3 text-4xl text-zinc-700">&#9835;</div>
          <p className="text-sm text-zinc-500">
            Generated pages will appear here
          </p>
        </div>
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-same-origin"
      title="Generated page"
      className="h-full w-full border-0 bg-white"
    />
  )
}
