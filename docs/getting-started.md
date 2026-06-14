# Getting started with Recospec

Recospec turns a recorded browser flow into production-quality Playwright, Cypress, or Selenium code in about five minutes. This guide walks you through your first recording end to end.

## 1. Install the extension

If you grabbed Recospec from the Chrome Web Store, skip ahead to step 2. To install from source:

1. Clone the repo and run `pnpm install && pnpm build`.
2. Open `chrome://extensions` in Chrome (or Edge).
3. Toggle **Developer mode** on, click **Load unpacked**, and select the generated `dist/` folder.

The Recospec icon should appear in your extension toolbar.

## 2. Open the side panel

Click the Recospec toolbar icon, then choose **Open side panel** from the popup. The panel docks to the right of the browser window and stays open while you navigate between tabs — that is the cockpit you will use throughout the recording.

## 3. Load the demo page

For your first run we recommend the bundled demo so you do not have to fight an unfamiliar site:

- From the side panel's **Help** dropdown choose **Open demo page**.
- A new tab opens with a guided login + checkout fixture.

## 4. Record a flow

1. Click **Record** in the side panel header. A red "REC ●" badge appears in the bottom-right of the demo page.
2. Fill in the form fields and click the buttons as you would normally. Each interaction lands as a step in the side panel — click events show up with an icon and the auto-picked locator, fills include the value.
3. When you are done, click **Stop**.

> Hot keys: `Tab` cycles through every interactive element in the side panel. `Esc` closes any open modal.

## 5. Review and clean up the steps

- Click any step to open the **Locator detail** popover and pick a different locator strategy if you do not like the one Recospec chose.
- Use the drag handle to reorder steps, the pencil to edit fill values, or the trash icon to remove a step.
- Click **+** on a step to insert an assertion right after it — visibility, text, value, or a screenshot match.

Each edit marks the session "dirty" so the generated code knows to refresh.

## 6. Generate code

1. Pick a framework from the **Framework** picker: Playwright TS, Cypress JS, Selenium Python, or Selenium Java.
2. Toggle **Auto-wait** if you want Recospec to detect network/spinner pauses.
3. Toggle **Include mocks** if you captured network requests you want stubbed.
4. Click the gradient **Generate** button. The Page Object code, the scenario file, and any supporting helpers appear in the preview panel.

## 7. Validate before you ship

- **Test on Page** runs every recorded locator against the active tab and shows green / yellow / red badges per step.
- **Replay Steps** drives the actual DOM interactions on the active tab — useful to confirm the flow is deterministic.
- **Export ZIP** downloads a project-ready archive (`package.json`, framework config, page objects, tests).

## 8. Add it to an existing project

If you already have a test suite, install the CLI once:

```sh
npm install -g recospec
```

Then drop the JSON export into your repo and run:

```sh
recospec add ./recording.json
```

Recospec merges the new page object methods and scenarios into existing files without overwriting your edits.

## Troubleshooting

- **No active tab error.** Click the page you want to record before pressing **Record**.
- **Background worker asleep.** The error UI prompts you to click Record again — that wakes the worker.
- **Storage full.** Open the History tab and delete old sessions; Recospec keeps everything in IndexedDB.

Need a hand? Use the **Help → Send feedback** menu or open a GitHub issue from **Help → Report bug**.
