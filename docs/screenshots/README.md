# Recospec Screenshots

This folder contains the marketing assets referenced from the root `README.md`.

## Files expected here

| File                      | Purpose                                                                                 | Suggested size     |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------ |
| `record-flow.gif`         | Animated walk-through: open demo page → start recording → 3–4 clicks → stop → generate. | ≤ 5 MB, ≤ 1280×720 |
| `side-panel-overview.png` | Static screenshot of the side panel mid-session (steps + framework picker visible).     | 1280×800           |
| `code-preview.png`        | Static screenshot of the generated code preview pane after `Generate`.                  | 1280×800           |

> **Status:** real captures are pending. Until they land, the GitHub README
> will render broken images. Replace the placeholders in this directory with the
> real assets and remove this note.

## Recording recipe

1. `pnpm build` and load the unpacked extension from `dist/` in Chrome.
2. Open `public/demo/demo-page.html` (or run `pnpm dev` and navigate there).
3. Resize the window to 1280×800 for consistency.
4. Open the Recospec side panel and start the recording.
5. Click through 3–4 elements on the demo page (login form, search button, etc.).
6. Stop the recording, switch framework to Playwright, and click **Generate**.
7. Use a screen recorder (e.g. ScreenToGif on Windows, Kap on macOS) to capture
   the flow at 12–15 fps; export as optimized GIF.
8. Save as `record-flow.gif` here. Take the static PNGs while paused on the
   relevant frames.
