// Screenshot script using Playwright
const { chromium } = require('playwright-core');

(async () => {
  // Find Chrome executable
  const fs = require('fs');
  const path = require('path');
  
  // Try to find Chrome in common locations
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  
  let execPath = null;
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      execPath = p;
      break;
    }
  }
  
  if (!execPath) {
    console.error('No browser found');
    process.exit(1);
  }
  
  console.log('Using browser:', execPath);
  
  const browser = await chromium.launch({
    headless: true,
    executablePath: execPath,
  });
  
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  
  await page.goto('http://localhost:8091/index.html');
  await page.waitForTimeout(1500);
  
  await page.screenshot({ path: 'E:\\搭子\\鲸鱼工作台\\screenshot-home.png', fullPage: false });
  console.log('Home screenshot saved');
  
  // Click rewards tab
  await page.click('button[data-page="rewards"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:\\搭子\\鲸鱼工作台\\screenshot-rewards.png', fullPage: false });
  console.log('Rewards screenshot saved');
  
  // Click stats tab
  await page.click('button[data-page="stats"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:\\搭子\\鲸鱼工作台\\screenshot-stats.png', fullPage: false });
  console.log('Stats screenshot saved');
  
  await browser.close();
  console.log('Done');
})();
