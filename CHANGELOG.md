# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-XX-XX

### Added

- Chrome Manifest V3 extension with popup and side panel UI
- Event recording: captures click, fill, navigate, keypress, scroll, hover actions
- Smart locator engine with 4 strategies: test-id, aria-label, id, CSS selector
- Locator stability scoring (uniqueness, semantic strength, stability, depth)
- Three-stage code generation pipeline: Normalizer → Planner → Adapter
- Playwright TypeScript adapter with Page Object Model output
- IndexedDB persistence via Dexie — survives service worker restarts
- Recording state indicator (REC / IDLE badge) in popup, side panel, and toolbar
- Step list with action icons, locator strategy badge on hover, and per-step delete
- Empty state with hint when no steps have been recorded
- Code preview with syntax-highlighted output, Copy to Clipboard, and Download .ts
- Error display and automatic retry (up to 3 attempts) for code generation failures
