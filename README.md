# PlayForge

PlayForge is an open-source Chrome extension that records your browser interactions and generates production-ready test automation code with smart locator strategies and automatic Page Object Model output — no manual editing required.

## Tech Stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · Dexie (IndexedDB) · Chrome Manifest V3

## Install from Source

```bash
git clone https://github.com/your-username/playforge.git
cd playforge
pnpm install
pnpm build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

## Supported Frameworks

| Framework                | Status      |
| ------------------------ | ----------- |
| Playwright (TypeScript)  | ✅          |
| Cypress (JavaScript)     | Coming soon |
| Selenium Python (pytest) | Coming soon |
| Selenium Java (TestNG)   | Coming soon |

## Screenshot

_Screenshot / GIF coming at v0.1.0 launch._

## License

MIT — see [LICENSE](LICENSE)

## Contributing

Issues and PRs are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.
