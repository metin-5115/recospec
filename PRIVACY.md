# Recospec — Privacy Policy

_Last updated: 2026-06-01 · Applies to Recospec Chrome extension v0.7.0 and later._

## Summary

**Recospec does not collect, transmit, or sell any of your data.** There is no
telemetry, no analytics, no tracking, and no remote server. Everything you record
stays on your own machine, in your browser's local storage, until you delete it.

## What data Recospec processes

To generate test code, Recospec processes data **locally, in your browser**:

- **Recorded interactions** — the elements you click and type into on the page
  you are recording, including the locator attributes of those elements
  (`data-testid`, `aria-label`, role, text, id, CSS path, etc.).
- **Text you enter into form fields** — needed to reproduce the flow in the
  generated test. Fields detected as sensitive (password, token, secret, API key,
  email) are automatically replaced with environment-variable placeholders in the
  generated code; their values are not written into the output.
- **Captured network requests** _(optional)_ — when network capture is on, the
  method, URL, status, and a size-capped body of `fetch`/`XMLHttpRequest` calls,
  used only to generate optional mocks.
- **Screenshots** _(optional)_ — when you add a visual-regression assertion, a
  thumbnail of the visible tab is captured for the snapshot baseline.

## Where the data is stored

All of the above is stored **locally on your device** using the browser's
**IndexedDB** (via Dexie). It is never uploaded anywhere. Recospec has no backend.

You remain in full control:

- Delete an individual recording from the side panel at any time.
- Clearing the extension's storage (or removing the extension) erases all data.

## Data sharing

**None.** Recospec does not share data with the developer or any third party.
The generated code, JSON exports, and ZIP scaffolds are written only where you
explicitly save them (your downloads folder, your project directory, or — with
the VS Code extension — your workspace).

## Permission justifications

Recospec requests the minimum permissions required for recording and code
generation:

| Permission                 | Why it is needed                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `storage`                  | Persist recordings, settings, and sessions locally (IndexedDB/extension storage).                     |
| `tabs`                     | Identify the active tab being recorded and capture screenshots for visual asserts.                    |
| `activeTab`                | Interact with the page you are actively recording.                                                    |
| `sidePanel`                | Show the main Recospec workspace in Chrome's side panel.                                              |
| `alarms`                   | Keep the Manifest V3 service worker alive during a recording session.                                 |
| `scripting`                | Inject the content scripts that capture your interactions and compute locators.                       |
| Host access (`<all_urls>`) | Let you record on any site you choose. Recospec only reads the page while you are actively recording. |

Recospec does **not** request permissions for browsing history, bookmarks,
cookies, downloads management, or your identity.

## Children's privacy

Recospec is a developer tool and is not directed at children under 13.

## Changes to this policy

If this policy changes, the updated version will be committed to the public
repository with a new "Last updated" date.

## Contact

Questions about privacy? Open an issue or email the maintainer:
Metin Tunçbilek — tuncbilek.51metin@gmail.com

Source: https://github.com/metin-5115/recospec
