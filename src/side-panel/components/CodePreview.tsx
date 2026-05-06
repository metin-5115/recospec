import { useState } from 'react'
import type { GeneratedCode } from '@shared/types/generated'

interface CodePreviewProps {
  code: GeneratedCode
}

export function CodePreview({ code }: CodePreviewProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  const activeFile = code.files[activeIndex]

  const handleCopy = () => {
    void navigator.clipboard.writeText(activeFile?.content ?? '').then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col border-t border-gray-200">
      <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
        <div className="flex gap-1 overflow-x-auto">
          {code.files.map((file, i) => (
            <button
              key={file.filename}
              onClick={() => setActiveIndex(i)}
              className={`shrink-0 rounded px-2 py-1 text-xs font-mono transition-colors ${
                i === activeIndex ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {file.filename}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="ml-2 shrink-0 rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto bg-gray-900 p-4 text-xs text-green-300 font-mono leading-relaxed">
        <code>{activeFile?.content ?? ''}</code>
      </pre>
    </div>
  )
}
