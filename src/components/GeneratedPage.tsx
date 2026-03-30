'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface GeneratedPageProps {
  html: string | null
}

function injectHeightReporter(html: string): string {
  const overrideStyle = `
<style>
  html, body { min-height: auto !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
  body > *:first-child { min-height: auto !important; }
</style>`

  const script = `
<script>
(function() {
  function reportHeight() {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'iframe-height', height: h }, '*');
  }
  window.addEventListener('load', reportHeight);
  new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
  setTimeout(reportHeight, 100);
})();
</script>`

  if (html.includes('</head>')) {
    html = html.replace('</head>', overrideStyle + '</head>')
  } else {
    html = overrideStyle + html
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', script + '</body>')
  }
  return html + script
}

export default function GeneratedPage({ html }: GeneratedPageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(false)
  const [iframeHeight, setIframeHeight] = useState<number | null>(null)

  const handleMessage = useCallback((e: MessageEvent) => {
    // Only accept messages from our sandboxed iframe (origin is 'null' for sandbox without allow-same-origin)
    if (e.source !== iframeRef.current?.contentWindow) return
    if (e.data?.type === 'iframe-height' && typeof e.data.height === 'number') {
      setIframeHeight(e.data.height)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  useEffect(() => {
    if (html) {
      setLoading(true)
      setIframeHeight(null)
    }
  }, [html])

  const handleLoad = useCallback(() => {
    setLoading(false)
  }, [])

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
    <div className="relative h-full overflow-auto bg-white">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500" />
            <p className="text-sm text-zinc-400">Rendering...</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={injectHeightReporter(html)}
        sandbox="allow-scripts"
        title="Generated page"
        className="w-full border-0"
        style={{ height: iframeHeight ? `${iframeHeight}px` : '100%' }}
        onLoad={handleLoad}
      />
    </div>
  )
}
