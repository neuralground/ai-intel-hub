# AI Intelligence Hub — Desktop App Build Guide

This guide covers building, packaging, signing, and distributing the Electron desktop app for macOS and Windows. For installation, configuration, and general usage, see [README.md](README.md).

## Architecture

The Electron app wraps the existing client-server architecture into a single installable application:

```
┌─────────────────────────────────────────────────┐
│  Electron Shell                                 │
│  ┌─────────────────┐  ┌──────────────────────┐  │
│  │  Main Process    │  │  Renderer (React)    │  │
│  │  Express.js      │◄─┤  BrowserWindow       │  │
│  │  feeds, scoring  │  │  loads built frontend │  │
│  └────────┬────────┘  └──────────────────────┘  │
│           │                                     │
│  ┌────────▼────────┐                            │
│  │  App Data Dir    │                            │
│  │  ├─ data/db.json │                            │
│  │  └─ settings.json│                            │
│  └─────────────────┘                            │
└─────────────────────────────────────────────────┘
          │
     ┌────▼────┐
     │ Internet│  RSS feeds, Anthropic Claude API
     └─────────┘
```

**What changes in Electron mode:**
- Express server runs inside the Electron main process on a random available port
- Data is stored in the OS-standard app data directory (not `backend/data/`)
- Settings are stored in `settings.json` (not `.env`)
- Frontend loads from built static files served by Express
- `ELECTRON_MODE` env var is set, which controls auto-start and static file serving behavior

**What stays the same:**
- All backend code (feeds, scoring, analysis, cron jobs)
- All frontend code (React SPA)
- All API endpoints

---

## Development

### Prerequisites

- **Node.js** 18+ (22 LTS recommended)
- **npm** 9+
- macOS or Windows (Linux is supported but not a primary target)

### Running in Dev Mode

```bash
npm install && npm run install:all

# Starts Vite dev server (HMR) + Electron window
npm run electron:dev
```

In dev mode:
- Vite serves the frontend at `http://localhost:5173` with hot module replacement
- The Electron window points at Vite (not the built frontend)
- Express backend runs inside Electron on port 3001
- Backend code changes require restarting the Electron process

### Running a Production Build Locally

```bash
# Build frontend + launch Electron with built assets
npm run electron:start
```

---

## Building Installers

### Step 1: Generate App Icons

```bash
# macOS — requires librsvg
brew install librsvg
npm run electron:icons
```

This generates from the SVG template in `build/icon.svg`:
- `build/icon.png` — 1024x1024 PNG (source for all platforms)
- `build/icon.icns` — macOS icon bundle
- electron-builder auto-generates `.ico` for Windows from the PNG

If `rsvg-convert` is not available, create a 1024x1024 PNG manually at `build/icon.png`. electron-builder will convert it to platform formats automatically.

### Step 2: Build

```bash
# macOS: DMG + ZIP (universal binary — Intel + Apple Silicon)
npm run electron:build:mac

# Windows: NSIS installer + portable EXE (x64)
npm run electron:build:win

# Linux: AppImage + .deb
npm run electron:build:linux

# All platforms at once
npm run electron:build:all
```

Output goes to `dist-electron/`:

| Platform | Files | Size |
|----------|-------|------|
| macOS | `.dmg` (universal), `.zip` | ~170 MB |
| Windows | `.exe` (installer), `.exe` (portable) | ~130 MB |
| Linux | `.AppImage`, `.deb` | ~140 MB |

### Build Configuration

The build is configured in `electron-builder.yml`. Key settings:

```yaml
appId: com.ai-intel-hub.app
productName: AI Intelligence Hub
asar: true                          # Compress app bundle

mac:
  category: public.app-category.productivity
  target: [dmg, zip]
  hardenedRuntime: true

win:
  target: [nsis, portable]

nsis:
  oneClick: false                   # Show install options
  allowToChangeInstallationDirectory: true
```

The build includes:
- `electron/` — main process and preload scripts
- `backend/src/` + `backend/package.json` + `backend/feeds.json` — server code and default feeds
- `frontend/dist/` — built React app
- `backend/node_modules/` — backend dependencies (as extraResources)

---

## Code Signing

### macOS

Apple requires code signing and notarization for apps distributed outside the Mac App Store. Without it, users see Gatekeeper warnings.

#### Signing

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create a "Developer ID Application" certificate
3. Install it in your Keychain
4. Set environment variables before building:

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
# or provide the certificate file directly:
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="your-password"
```

#### Notarization

1. Generate an app-specific password at [appleid.apple.com](https://appleid.apple.com)
2. Update `electron-builder.yml`:
   ```yaml
   mac:
     notarize: true
   ```
3. Set credentials:
   ```bash
   export APPLE_ID="your@apple.id"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="YOUR_TEAM_ID"
   ```
4. Build normally — electron-builder handles signing, uploading to Apple, and stapling the notarization ticket

#### Entitlements

The app requires these entitlements (configured in `build/entitlements.mac.plist`):

| Entitlement | Why |
|-------------|-----|
| `com.apple.security.network.client` | Fetching RSS feeds and calling the Anthropic API |
| `com.apple.security.cs.allow-jit` | Required by Node.js/V8 JIT compiler inside Electron |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Required by V8 |
| `com.apple.security.files.user-selected.read-write` | Reading/writing local database |

#### Skipping Signing (Development)

For local testing without a certificate, electron-builder will produce an unsigned app. macOS will show a warning; bypass with:

```bash
xattr -cr "/Applications/AI Intelligence Hub.app"
```

### Windows

#### EV Code Signing Certificate (recommended)

Eliminates SmartScreen warnings immediately.

1. Purchase an EV certificate from DigiCert, Sectigo, or GlobalSign ($200-400/year)
2. The certificate lives on a hardware token (USB)
3. Set environment variables:
   ```bash
   export CSC_LINK="/path/to/certificate.pfx"
   export CSC_KEY_PASSWORD="your-password"
   ```

#### Standard Code Signing Certificate

Cheaper ($70-100/year) but SmartScreen warnings persist until the app builds reputation through downloads.

#### No Signing (Development)

Users will see "Windows protected your PC" — click "More info" > "Run anyway".

---

## CI/CD Automation

A GitHub Actions workflow is included at `.github/workflows/build-electron.yml`. It builds macOS and Windows installers on every version tag push and creates a draft GitHub Release.

### Triggering a Release

```bash
git tag v1.1.0
git push origin v1.1.0
```

This triggers the workflow, which:
1. Builds macOS universal DMG on `macos-latest`
2. Builds Windows NSIS installer on `windows-latest`
3. Uploads both as artifacts
4. Creates a draft GitHub Release with both installers attached

### Manual Trigger

The workflow also supports `workflow_dispatch` for manual builds — go to Actions > Build Electron App > Run workflow, and select the target platform.

### Required Secrets

Configure these in your repository's Settings > Secrets:

| Secret | Purpose | Required |
|--------|---------|----------|
| `MAC_CERTIFICATE` | Base64-encoded `.p12` certificate | For signed macOS builds |
| `MAC_CERTIFICATE_PASSWORD` | Certificate password | For signed macOS builds |
| `APPLE_ID` | Apple ID email | For notarized macOS builds |
| `APPLE_APP_PASSWORD` | App-specific password | For notarized macOS builds |
| `APPLE_TEAM_ID` | Apple Developer Team ID | For notarized macOS builds |
| `WIN_CERTIFICATE` | Windows code signing certificate | For signed Windows builds |
| `WIN_CERTIFICATE_PASSWORD` | Certificate password | For signed Windows builds |

All secrets are optional — builds will succeed unsigned without them.

---

## Electron-Specific Behavior

### Sleep/Wake Handling

The app registers a `powerMonitor.on("resume")` handler that triggers an immediate feed refresh when the system wakes from sleep. This ensures feeds are current after a laptop lid-close/open cycle.

### External Links

Links clicked in the app (e.g., "Open" on a feed item) open in the system default browser, not inside the Electron window.

### Application Menu

The app provides a native menu bar with:
- **Settings...** (Cmd+, / Ctrl+,) — opens settings dialog
- Standard Edit menu (cut, copy, paste, undo, redo)
- **View** menu with reload, DevTools toggle, and zoom controls
- Standard Window menu

### Settings API

The backend exposes `/api/electron/settings` endpoints for reading and writing settings programmatically. These endpoints work in all modes but are primarily designed for the Electron settings dialog:

```bash
# Read (API key is masked — returns hasApiKey: true/false)
GET /api/electron/settings

# Write (updates both the settings file and the running process)
POST /api/electron/settings
{"ANTHROPIC_API_KEY": "sk-ant-...", "RELEVANCE_CONTEXT": "..."}
```

---

## Comparison: Server vs Desktop

| Feature | Client-Server | Desktop (Electron) |
|---------|--------------|-------------------|
| Install | `npm install` + `.env` | Double-click installer |
| Run | `npm start` or `docker compose up` | Launch app |
| Access | Browser at localhost:3001 | Native window |
| Configuration | `backend/.env` file | Settings menu + `settings.json` |
| Data location | `backend/data/` | OS app data directory |
| Multi-user | Yes (shared server) | Single user |
| Headless/CLI | Yes | No |
| Auto-update | Manual / Docker pull | Configurable via electron-updater |
| System tray | No | Can be added |
| Package size | ~5 MB (source only) | ~170 MB (with Chromium + Node.js) |
| Cross-platform | Any OS with Node.js | macOS + Windows + Linux |

---

## Troubleshooting

### App Won't Start

1. Open DevTools: **View > Toggle Developer Tools** (Cmd+Option+I / Ctrl+Shift+I)
2. Check the console for error messages
3. Verify the data directory is writable: the app needs read/write access to its Application Support folder

### Feeds Not Refreshing After Sleep

The app listens for system resume events and triggers an immediate refresh. If this doesn't work:
- Check DevTools Console for network errors
- Manually refresh via the refresh button in the UI

### Build Fails

**macOS:**
- Install Xcode Command Line Tools: `xcode-select --install`
- If signing fails, verify your certificate in Keychain Access

**Windows:**
- Run from PowerShell or Command Prompt (not WSL)
- Install Visual Studio Build Tools if native modules fail to compile

### Large App Size

The ~170 MB size is normal for Electron apps (Chromium ~100 MB + Node.js ~30 MB + app code + dependencies). The `asar: true` setting in `electron-builder.yml` compresses the app bundle to minimize size.
