#!/usr/bin/env node
/**
 * Automated Anthropic Token Refresh Script v2
 * 
 * Uses Playwright to complete OAuth and extract the token directly.
 * 
 * Usage: node refresh-anthropic-token.mjs
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const CLAWDBOT_CLI = path.join(os.homedir(), '.nvm/versions/node/v24.13.0/bin/clawdbot');
const USER_DATA_DIR = path.join(os.homedir(), '.clawdbot/playwright-chrome-data');
const TIMEOUT_MS = 90000;

// OAuth config (from claude CLI)
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback';

import crypto from 'crypto';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function getTokenViaOAuth() {
  log('Generating PKCE challenge...');
  
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(32).toString('base64url');
  
  const authUrl = new URL('https://claude.ai/oauth/authorize');
  authUrl.searchParams.set('code', 'true');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', 'user:inference');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  
  log('Launching browser...');
  log(`Auth URL: ${authUrl.toString().substring(0, 100)}...`);
  
  // Ensure user data dir exists
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const page = await context.newPage();
  let authCode = null;
  
  try {
    // Navigate to OAuth
    log('Navigating to OAuth page...');
    await page.goto(authUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const startTime = Date.now();
    
    while (!authCode && (Date.now() - startTime) < TIMEOUT_MS) {
      const currentUrl = page.url();
      log(`Current URL: ${currentUrl.substring(0, 100)}...`);
      
      // Check for redirect to callback URL with actual code
      if (currentUrl.includes('platform.claude.com') && currentUrl.includes('code=')) {
        const urlObj = new URL(currentUrl);
        const code = urlObj.searchParams.get('code');
        // Make sure it's not just "true" flag
        if (code && code !== 'true' && code.length > 10) {
          authCode = code;
          log('✅ Got authorization code from redirect!');
          break;
        }
      }
      
      // Also check for code in hash fragment
      if (currentUrl.includes('#')) {
        const hash = currentUrl.split('#')[1];
        const params = new URLSearchParams(hash);
        const code = params.get('code');
        if (code && code !== 'true' && code.length > 10) {
          authCode = code;
          log('✅ Got authorization code from hash!');
          break;
        }
      }
      
      // Check if there's a code displayed on the page
      try {
        // Look for code in common patterns
        const codeElement = await page.$('[data-testid="authorization-code"], .authorization-code, code, pre');
        if (codeElement) {
          const text = await codeElement.textContent();
          if (text && text.length > 20 && !text.includes(' ')) {
            authCode = text.trim();
            log('✅ Found code displayed on page!');
            break;
          }
        }
        
        // Look for code in page text
        const pageText = await page.evaluate(() => document.body.innerText);
        const codeMatch = pageText.match(/\b([A-Za-z0-9_-]{30,})\b/);
        if (codeMatch && !codeMatch[1].includes('http')) {
          // Might be a code, but be careful
          log(`Possible code found: ${codeMatch[1].substring(0, 20)}...`);
        }
      } catch (e) {}
      
      // Try to click approve/allow buttons
      try {
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const text = await btn.textContent();
          if (text && (text.includes('Allow') || text.includes('Approve') || text.includes('Authorize') || text.includes('Continue'))) {
            log(`Clicking button: ${text.trim()}`);
            await btn.click();
            await page.waitForTimeout(2000);
            break;
          }
        }
      } catch (e) {}
      
      // Take screenshot for debugging
      const screenshotPath = `/tmp/oauth-debug-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved: ${screenshotPath}`);
      
      // Wait before next check
      await page.waitForTimeout(3000);
    }
    
    if (!authCode) {
      // Try to get code from page one more time
      const finalUrl = page.url();
      if (finalUrl.includes('code=')) {
        const urlObj = new URL(finalUrl);
        authCode = urlObj.searchParams.get('code');
      }
    }
    
    if (!authCode) {
      throw new Error('Could not obtain authorization code. Please complete login manually.');
    }
    
    // The callback page displays the final token to paste into Claude Code
    // We need to capture it from the page itself
    log('Looking for setup-token on callback page...');
    
    // Navigate back to the callback page and extract the displayed token
    await page.waitForTimeout(1000);
    
    // Look for the token displayed on the page
    let setupToken = null;
    
    try {
      // The token is displayed in a code/pre element or input
      const codeElement = await page.$('code, pre, input[readonly], .token, [data-testid="code"]');
      if (codeElement) {
        const tagName = await codeElement.evaluate(el => el.tagName.toLowerCase());
        if (tagName === 'input') {
          setupToken = await codeElement.getAttribute('value');
        } else {
          setupToken = await codeElement.textContent();
        }
      }
      
      // Also try getting text that looks like a token
      if (!setupToken) {
        const bodyText = await page.evaluate(() => document.body.innerText);
        // Look for the format: long alphanumeric string with # in it
        const tokenMatch = bodyText.match(/([A-Za-z0-9_-]{20,}#[A-Za-z0-9_-]+)/);
        if (tokenMatch) {
          setupToken = tokenMatch[1];
        }
      }
    } catch (e) {
      log(`Error extracting token: ${e.message}`);
    }
    
    if (setupToken && setupToken.length > 30) {
      log('✅ Found setup-token on page!');
      return setupToken.trim();
    }
    
    // If we got a code from the URL, it might be the token directly
    if (authCode && authCode.includes('#')) {
      log('Using code from URL as setup-token (contains #)');
      return authCode;
    }
    
    throw new Error('Could not extract setup-token from callback page');
    
  } finally {
    await context.close();
  }
}

async function pasteTokenToClawdbot(token) {
  log('Saving token to Clawdbot...');
  
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAWDBOT_CLI, [
      'models', 'auth', 'paste-token',
      '--provider', 'anthropic',
      '--profile-id', 'anthropic:auto'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    
    proc.stdin.write(token + '\n');
    proc.stdin.end();
    
    proc.on('close', (code) => {
      if (code === 0) {
        log('✅ Token saved to Clawdbot!');
        resolve(output);
      } else {
        reject(new Error(`paste-token failed (code ${code}): ${output}`));
      }
    });
    
    proc.on('error', reject);
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('Anthropic Token Refresh Script v2');
  console.log('='.repeat(60));
  console.log('');
  console.log('This will open a browser window. If you\'re already logged');
  console.log('into claude.ai, it should auto-approve. Otherwise, log in.');
  console.log('');
  
  try {
    const token = await getTokenViaOAuth();
    
    if (!token) {
      throw new Error('Failed to obtain token');
    }
    
    log(`Token obtained: ${token.substring(0, 25)}...${token.substring(token.length - 10)}`);
    
    await pasteTokenToClawdbot(token);
    
    console.log('');
    console.log('✅ Token refresh complete!');
    console.log('');
    
    log('Verifying...');
    execSync(`${CLAWDBOT_CLI} models status`, { stdio: 'inherit' });
    
  } catch (err) {
    console.error('');
    console.error('❌ Token refresh failed:', err.message);
    console.error('');
    console.error('Manual fallback:');
    console.error('  1. Run: claude setup-token');
    console.error('  2. Complete browser auth');
    console.error('  3. Copy the token');
    console.error('  4. Run: clawdbot models auth paste-token --provider anthropic');
    process.exit(1);
  }
}

main();
