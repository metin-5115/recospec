import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { marked } from 'marked'
import manifest from './public/manifest.json'

/**
 * Render `docs/getting-started.md` → `public/docs/getting-started.html` so
 * the crx plugin can copy it into `dist/docs/` like any other static asset
 * (web_accessible_resources validation runs before any of our late-build
 * hooks would fire). We re-render every build so doc edits propagate.
 */
function gettingStartedPlugin(): Plugin {
  function renderDoc(): void {
    const source = resolve(__dirname, 'docs', 'getting-started.md')
    const outDir = resolve(__dirname, 'public', 'docs')
    const outFile = resolve(outDir, 'getting-started.html')
    const markdown = readFileSync(source, 'utf8')
    const body = marked.parse(markdown, { async: false }) as string
    const html = htmlShell(body)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outFile, html, 'utf8')
  }
  function htmlShell(body: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Recospec — Getting Started</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 720px;
    margin: 40px auto;
    padding: 0 24px 64px;
    color: #1f2937;
    background: #ffffff;
  }
  h1 { font-size: 28px; line-height: 1.25; margin: 0 0 16px; }
  h2 { font-size: 20px; line-height: 1.3; margin: 32px 0 12px; }
  h3 { font-size: 16px; margin: 24px 0 8px; }
  p, ul, ol { margin: 0 0 16px; }
  ul, ol { padding-left: 1.4em; }
  li { margin-bottom: 4px; }
  code {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 14px 16px;
    border-radius: 8px;
    overflow-x: auto;
  }
  pre code { background: none; padding: 0; color: inherit; }
  a { color: #2563eb; text-decoration: none; }
  a:hover, a:focus-visible { text-decoration: underline; }
  blockquote {
    margin: 16px 0;
    padding: 8px 14px;
    border-left: 3px solid #3b82f6;
    background: #eff6ff;
    color: #1e3a8a;
    border-radius: 4px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1220; color: #e5e7eb; }
    code { background: rgba(255, 255, 255, 0.08); }
    blockquote { background: #0c1a36; color: #bfdbfe; }
    a { color: #60a5fa; }
  }
</style>
</head>
<body>
${body}
</body>
</html>
`
  }
  return {
    name: 'recospec-getting-started',
    // Run the render in `config` so the HTML is on disk before crx's
    // manifest-asset validator scans `web_accessible_resources`.
    config() {
      renderDoc()
    },
    // Re-render on dev-mode markdown edits.
    configureServer(server) {
      const watched = resolve(__dirname, 'docs', 'getting-started.md')
      server.watcher.add(watched)
      server.watcher.on('change', (file) => {
        if (file === watched) renderDoc()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), gettingStartedPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@locator': resolve(__dirname, 'src/locator-engine'),
      '@codegen': resolve(__dirname, 'src/codegen'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@storage': resolve(__dirname, 'src/storage'),
    },
  },
})
