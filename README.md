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

Runs every 3 hours via launchd (macOS) or cron (Linux).

---

## Quick Install (macOS)

```bash
# Clone the repo
git clone https://github.com/getmolty/anthropic-token-refresh.git
cd anthropic-token-refresh

# Install dependencies
npm init -y
npm install playwright
npx playwright install chromium

# Edit the script to set your paths
nano refresh-anthropic-token.mjs
# Update OPENCLAW_CLI and USER_DATA_DIR for your setup

# Test it (browser will open - log in if needed)
node refresh-anthropic-token.mjs

# Install the launchd job
cp com.openclaw.token-refresh.plist ~/Library/LaunchAgents/
sed -i '' "s/YOUR_USERNAME/$(whoami)/g" ~/Library/LaunchAgents/com.openclaw.token-refresh.plist
sed -i '' "s|/Users/YOUR_USERNAME/scripts|$(pwd)|g" ~/Library/LaunchAgents/com.openclaw.token-refresh.plist

# Create logs directory and load the job
mkdir -p ~/.openclaw/logs
launchctl load ~/Library/LaunchAgents/com.openclaw.token-refresh.plist

# Verify it's running
launchctl list | grep token-refresh
```

---

## Manual Setup (Step by Step)

### 1. Clone and install dependencies

```bash
git clone https://github.com/getmolty/anthropic-token-refresh.git
cd anthropic-token-refresh

npm init -y
npm install playwright
npx playwright install chromium
```

### 2. Configure the script

Edit `refresh-anthropic-token.mjs` and update these paths:

```javascript
// Find your OpenClaw CLI path with: which openclaw
const OPENCLAW_CLI = '/path/to/openclaw';  

// Where to store browser session (auto-created)
const USER_DATA_DIR = path.join(os.homedir(), '.openclaw/playwright-chrome-data');
```

### 3. Test manually

```bash
node refresh-anthropic-token.mjs
```

A browser window opens:
- If already logged into claude.ai → auto-approves
- If not → log in once, session persists for future runs

### 4. Set up automatic refresh

#### macOS (launchd)

```bash
# Copy the template
cp com.openclaw.token-refresh.plist ~/Library/LaunchAgents/

# Edit it with your paths
nano ~/Library/LaunchAgents/com.openclaw.token-refresh.plist
```

Update these values:
- `/Users/YOUR_USERNAME` → your home directory
- Path to `refresh-anthropic-token.mjs`
- Path to `node` (find with `which node`)

```bash
# Create logs directory
mkdir -p ~/.openclaw/logs

# Load the job
launchctl load ~/Library/LaunchAgents/com.openclaw.token-refresh.plist

# Verify
launchctl list | grep token-refresh
```

#### Linux (cron)

```bash
# Edit crontab
crontab -e

# Add this line (runs every 3 hours)
0 */3 * * * cd /path/to/anthropic-token-refresh && /usr/bin/node refresh-anthropic-token.mjs >> ~/.openclaw/logs/token-refresh.log 2>&1
```

---

## How It Works

1. **Every 3 hours**, the script launches a Chromium browser
2. **Navigates to** claude.ai OAuth with PKCE challenge
3. **Auto-clicks** "Authorize" if session is valid
4. **Captures** the setup-token from the callback URL
5. **Pipes it** into `openclaw models auth paste-token`
6. **Browser closes**, token is refreshed

The browser session persists in `~/.openclaw/playwright-chrome-data/`, so you only need to log in once.

---

## Troubleshooting

### Browser doesn't auto-approve

Make sure you're logged into claude.ai:
1. Run the script manually: `node refresh-anthropic-token.mjs`
2. Complete the login in the browser window
3. Future runs will auto-approve

### Token not being saved

Check your OpenClaw CLI path:
```bash
which openclaw
# Update OPENCLAW_CLI in the script
```

### View logs

```bash
# macOS
tail -f ~/.openclaw/logs/token-refresh.log

# Check launchd status
launchctl list | grep token-refresh
```

### Force a refresh now

```bash
node refresh-anthropic-token.mjs
```

---

## Uninstall

```bash
# macOS
launchctl unload ~/Library/LaunchAgents/com.openclaw.token-refresh.plist
rm ~/Library/LaunchAgents/com.openclaw.token-refresh.plist

# Linux
crontab -e  # remove the line

# Remove browser session
rm -rf ~/.openclaw/playwright-chrome-data
```

---

## Requirements

- Node.js >= 18
- macOS or Linux
- OpenClaw CLI installed and configured
- Anthropic Claude subscription

---

## License

MIT
