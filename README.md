# 🔑 Anthropic Token Auto-Refresh for OpenClaw

Automatically refresh Anthropic OAuth tokens that expire every few hours.

## The Problem

Anthropic's Claude subscription uses OAuth tokens (`sk-ant-oat01-*`) that expire every few hours. Without refresh, your bot goes offline.

**Symptoms:**
- Bot stops responding after a few hours
- Auth errors in logs
- Need to manually re-authenticate repeatedly

## The Solution

A Playwright script that automatically:
1. Opens browser to claude.ai OAuth
2. Clicks "Authorize" (if already logged in)
3. Captures the setup-token from callback
4. Pastes it into OpenClaw

Runs every 3 hours via launchd.

---

## Setup Instructions

### 1. Install dependencies

```bash
cd ~/your-workspace/scripts  # or wherever you keep scripts
npm init -y
npm install playwright
npx playwright install chromium
```

### 2. Copy the script

Copy `refresh-anthropic-token.mjs` to your scripts directory.

**Update these paths in the script for your setup:**
```javascript
const OPENCLAW_CLI = 'openclaw';  // or full path to your CLI
const USER_DATA_DIR = path.join(os.homedir(), '.openclaw/playwright-chrome-data');
```

### 3. Test it manually first

```bash
node refresh-anthropic-token.mjs
```

A browser window opens. If you're logged into claude.ai, it auto-approves. Otherwise, log in once — the session persists.

### 4. Create launchd job (macOS)

Create `~/Library/LaunchAgents/com.openclaw.token-refresh.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.token-refresh</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>/Users/YOUR_USERNAME/scripts/refresh-anthropic-token.mjs</string>
    </array>
    <key>StartInterval</key>
    <integer>10800</integer>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.openclaw/logs/token-refresh.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.openclaw/logs/token-refresh.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/YOUR_USERNAME</string>
    </dict>
</dict>
</plist>
```

**Replace `YOUR_USERNAME` with your actual username.**

### 5. Load it

```bash
mkdir -p ~/.openclaw/logs
launchctl load ~/Library/LaunchAgents/com.openclaw.token-refresh.plist
```

---

## How It Works

- Runs every 3 hours (10800 seconds)
- Uses persistent browser session (no re-login needed after first time)
- Captures token from OAuth callback
- Pipes it into `openclaw models auth paste-token`

**First run:** Browser opens, you may need to log in manually once. After that, session cookies persist.

---

## Troubleshooting

**Browser doesn't auto-approve:**
- Make sure you're logged into claude.ai in the Playwright browser
- Run manually once and complete the login

**Token not being saved:**
- Check that `openclaw` CLI is in your PATH
- Verify the CLI path in the script

**Logs:**
```bash
tail -f ~/.openclaw/logs/token-refresh.log
```

---

## License

MIT
