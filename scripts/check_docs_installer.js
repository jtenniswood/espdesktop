// Check the exact flashing dependency resolved from ESP Web Tools. No USB writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const installerRequire = createRequire(require.resolve('esp-web-tools'));
const p4Path = installerRequire.resolve('esptool-js/lib/targets/esp32p4.js');
const compiled = buildSync({ entryPoints: [p4Path], bundle: true, platform: 'node', format: 'cjs', write: false });
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(loaded, loaded.exports, require);
const { ESP32P4ROM } = loaded.exports;

async function checkFlashPower(revision, romPowered = false) {
  const chip = new ESP32P4ROM();
  chip.getChipRevision = async () => revision;
  chip.usesUsbOtg = async () => false;
  chip.disableWatchdogs = async () => {};
  const registers = new Map([
    [chip.EFUSE_RD_REPEAT_DATA1_REG, romPowered ? chip.EFUSE_DOWNLOAD_MODE_XPD_ON_MASK : 0],
    [chip.PMU_DATE_REG, 0x103],
  ]);
  const writes = [];
  await chip.postConnect({
    usesUsbOtg: async () => false,
    IS_STUB: false,
    secureDownloadMode: false,
    readReg: async address => registers.get(address) || 0,
    writeReg: async (address, value) => { writes.push([address, value]); registers.set(address, value); },
  });
  if (revision < 301) {
    assert.equal(writes.length, 0, 'Older P4 chips must not use the new flash power sequence');
  } else if (romPowered) {
    assert.deepEqual(writes, [[chip.PMU_DATE_REG, 0x100]], 'ECO7 must release ROM flash force-on without powering up twice');
  } else {
    assert(writes.some(([address, value]) => address === chip.LP_SYSTEM_REG_ANA_XPD_PAD_GROUP_REG && value === 1),
      `P4 revision ${revision}: postConnect must power on flash before attachment (esptool-js#268)`);
  }
}

async function checkBrowser() {
  const { chromium } = require('playwright');
  const { createServer } = require('node:http');
  const dist = path.join(root, 'docs/.vitepress/dist');
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname.replace(/^\/espdesktop\//, '') || 'index.html';
    let file = path.resolve(dist, relative);
    if (!file.startsWith(dist + path.sep)) { response.writeHead(404).end(); return; }
    if (!path.extname(file)) file += '.html';
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', ({
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.jpg': 'image/jpeg',
    })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    const externalScripts = [];
    const manifests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request();
      if (!request.url().startsWith(base)) {
        if (request.resourceType() === 'script') externalScripts.push(request.url());
        return route.abort();
      }
      if (request.url().includes('/firmware/')) {
        manifests.push(request.url());
        return route.fulfill({ json: { name: 'EspDesktop', version: 'test', builds: [] } });
      }
      return route.continue();
    });
    await page.addInitScript(() => {
      // A cancelled port selection loads the real dialog without touching hardware.
      Object.defineProperty(navigator, 'serial', { value: { requestPort: async () => {
        throw new DOMException('Port selection canceled', 'NotFoundError');
      } } });
    });
    // Public EspDesktop setup targets the supported S3, without a P4 picker.
    const expected = '/espdesktop/firmware/guition-esp32-s3-4848s040/manifest.json';
    async function assertSupportedInstaller() {
      await page.waitForFunction(() => !!customElements.get('esp-web-install-button'));
      const install = page.locator('esp-web-install-button');
      await install.waitFor();
      assert.equal(await install.count(), 1);
      assert.equal(await install.getAttribute('manifest'), expected);
      assert.equal(await page.locator('.esp-install-selector').count(), 0);
      await install.locator('button[slot="activate"]').click();
      const canceled = page.locator('ewt-no-port-picked-dialog');
      await canceled.getByText('No port selected', { exact: true }).waitFor({ state: 'visible' });
      await canceled.getByText('Cancel', { exact: true }).click();
      await canceled.waitFor({ state: 'detached' });
    }
    const home = `${base}/espdesktop/`;
    const setup = page.getByRole('link', { name: 'Get started', exact: true });
    for (const [width, height, colorScheme] of [
      [320, 640, 'light'],
      [390, 844, 'dark'],
      [768, 900, 'light'],
      [1440, 900, 'dark'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await page.goto(home);
      assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `Homepage must fit a ${width}px viewport`);
      const action = await setup.boundingBox();
      assert(action && action.y >= 0 && action.y + action.height <= height,
        `Get started must be visible on the first screen at ${width}px`);
      const illustration = page.locator('.homepage-hero img');
      await illustration.scrollIntoViewIfNeeded();
      await illustration.evaluate(img => img.decode());

      const demoSelector = 'iframe.homepage-demo';
      const demo = page.locator(demoSelector);
      await demo.scrollIntoViewIfNeeded();
      const frame = page.frameLocator(demoSelector);
      const slack = frame.getByRole('button', { name: 'Slack', exact: true });
      await slack.waitFor();
      const frameScheme = await demo.evaluate(iframe => getComputedStyle(iframe).colorScheme);
      const demoScheme = await frame.locator('html').evaluate(html => getComputedStyle(html).colorScheme);
      assert.equal(frameScheme, demoScheme, 'Matching color schemes keep the iframe canvas transparent');
      assert.equal(await frame.locator('body').evaluate(body => getComputedStyle(body).backgroundColor),
        'rgba(0, 0, 0, 0)');
      await slack.click();
      await frame.getByRole('button', { name: 'New Message', exact: true }).waitFor();
      await frame.locator('button.sp-back-btn').click();
      await slack.waitFor();
    }
    await setup.press('Enter');
    await page.waitForURL(`${home}getting-started/install`);
    console.log('Homepage checks passed at desktop, tablet and phone widths.');
    await assertSupportedInstaller();
    await page.goto(`${base}/espdesktop/screens/4848s040`);
    assert.equal(await page.locator('esp-web-install-button').count(), 0);
    await page.locator('.VPSidebar a[href="/espdesktop/getting-started/install"]').click();
    await page.waitForURL('**/espdesktop/getting-started/install');
    await assertSupportedInstaller();
    assert(manifests.length >= 2, 'Setup and hardware-guide navigation must check the S3 manifest');
    const beforeRetired = manifests.length;
    const retired = await page.goto(`${base}/espdesktop/getting-started/c6-recovery`);
    assert.equal(retired.status(), 404, 'Retired P4 recovery is not a public setup page');
    assert.equal(await page.locator('esp-web-install-button').count(), 0);
    assert.equal(manifests.length, beforeRetired, 'Retired P4 setup must not offer an installer');
    assert.deepEqual(errors, []);
    assert.deepEqual(externalScripts, [], 'USB installer must work without third-party scripts');
    console.log('Built-site installer checks passed (mocked Web Serial, no physical flashing).');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  for (const revision of [100, 300, 301, 302]) await checkFlashPower(revision);
  await checkFlashPower(302, true);
  console.log('P4 flash-power regression checks passed for the resolved installer dependency.');
  if (process.argv.includes('--browser')) await checkBrowser();
})().catch(error => { console.error(error); process.exitCode = 1; });
