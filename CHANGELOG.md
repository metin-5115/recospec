# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-06

### Added

- Chrome Manifest V3 extension with popup and side panel UI
- Event recording: captures click, fill, navigate, keypress, scroll, hover actions
- Smart locator engine with 9 strategies (priority order): test-id, test-attributes,
  aria-label, role+name, label, text, id, CSS selector, XPath
- Locator stability scoring formula: uniqueness×0.4 + semanticStrength×0.3 +
  stability×0.2 + depth×0.1
- Dynamic class/ID detector — rejects css-hash, MuiButton-root-273 style tokens
- Three-stage code generation pipeline: Normalizer → Planner → Adapter
- Playwright TypeScript adapter with Page Object Model output
- Method inference: login(), search(), submitForm() patterns auto-detected
- IndexedDB persistence via Dexie — survives service worker restarts
- Recording state indicator (REC / IDLE badge) in popup, side panel, and toolbar
- Step list with action icons, locator strategy badge on hover, and per-step delete
- Empty state with hint when no steps have been recorded
- Code preview with syntax-highlighted output, Copy to Clipboard, and Download .ts
- Error display and automatic retry (up to 3 attempts) for code generation failures
- Shadow DOM support: open shadow roots pierced, closed roots flagged with warning
- Iframe support: frame URL and name tracked, frameLocator() emitted in output
- Assertion builder: visible, text, value, attribute assertions via hover + click
- Session management: list, rename, delete, pause/resume, multi-tab sessions
- JSON export of raw recorded actions with metadata
- ZIP export: pages/, tests/, playwright.config.ts, package.json, README scaffold
- CI/CD: GitHub Actions workflows for PR checks, E2E on main, and GitHub Release on tag
- Playwright E2E test infrastructure with extension loading helpers
- Unit test coverage ≥ 85% on locator-engine and codegen modules
