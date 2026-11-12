// Check the exact flashing dependency resolved from ESP Web Tools. No USB writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { hash } = require('node:crypto');
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
    const relative = pathname.slice(1) || 'index.html';
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
      '.png': 'image/png',
    })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
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
      // Website demos must work even when the release editor is unavailable.
      if (new URL(request.url()).pathname.startsWith('/webserver/')) return route.abort();
      return route.continue();
    });
    await page.addInitScript(() => {
      // A cancelled port selection loads the real dialog without touching hardware.
      Object.defineProperty(navigator, 'serial', { value: { requestPort: async () => {
        throw new DOMException('Port selection canceled', 'NotFoundError');
      } } });
    });
    // Public EspDesktop setup targets the supported S3, without a P4 picker.
    const expected = '/firmware/guition-esp32-s3-4848s040/manifest.json';
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
    const launcherApps = ['Finder', 'Safari', 'Calendar', 'Mail', 'Slack', 'Notes', 'Athena', 'ChatGPT', 'Claude'];
    async function checkLauncher(scope, touchscreen = false) {
      const grid = scope.locator('.sp-main[aria-disabled="false"]');
      await grid.waitFor();
      await scope.locator('.sp-topbar').waitFor({ state: 'hidden' });
      assert.equal(await grid.locator('[data-slot]').count(), launcherApps.length);
      return Promise.all(launcherApps.map(async (name, index) => {
        const tile = grid.locator(`[data-slot="${index + 1}"]`);
        if (touchscreen) assert.equal(await tile.getAttribute('aria-label'), name);
        const artwork = tile.locator('img.sp-companion-app-icon');
        await artwork.waitFor();
        assert.equal(await tile.getAttribute('data-icon-size'), 'large');
        assert.equal(await tile.locator('.sp-btn-label:visible').count(), 0, `${name} should show only its icon`);
        const src = await artwork.evaluate(async image => {
          await image.decode();
          return image.src;
        });
        return hash('sha256', src);
      }));
    }
    let touchscreenIcons;
    const home = `${base}/`;
    const setup = page.locator('.homepage-hero').getByRole('link', { name: 'Get started', exact: true });
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
      const demoSection = page.locator('.homepage-editor');
      const actions = demoSection.locator('.homepage-editor-actions');
      assert.deepEqual(await actions.getByRole('link').allTextContents(), ['Getting Started', 'Preview Editor']);
      const getStarted = actions.getByRole('link', { name: 'Getting Started', exact: true });
      assert.equal(await getStarted.getAttribute('href'), '/screens/4848s040');
      const buttonBackground = link => link.evaluate(element => getComputedStyle(element).backgroundColor);
      assert.equal(await buttonBackground(getStarted), await buttonBackground(setup));
      if (width >= 768) {
        const copy = await demoSection.locator(':scope > div').boundingBox();
        const mock = await demo.boundingBox();
        assert(copy && mock && Math.abs(copy.width - mock.width) < 1,
          'Homepage demo and copy must use equal desktop columns');
      }
      await demo.scrollIntoViewIfNeeded();
      const frame = page.frameLocator(demoSelector);
      const slack = frame.getByRole('button', { name: 'Slack', exact: true });
      await slack.waitFor();
      touchscreenIcons = await checkLauncher(frame, true);
      const frameScheme = await demo.evaluate(iframe => getComputedStyle(iframe).colorScheme);
      const demoScheme = await frame.locator('html').evaluate(html => getComputedStyle(html).colorScheme);
      assert.equal(frameScheme, demoScheme, 'Matching color schemes keep the iframe canvas transparent');
      assert.equal(await frame.locator('body').evaluate(body => getComputedStyle(body).backgroundColor),
        'rgba(0, 0, 0, 0)');
      await slack.click();
      await frame.getByRole('button', { name: 'New Message', exact: true }).waitFor();
      await frame.locator('button.sp-back-btn').click();
      await slack.waitFor();
      assert(await slack.evaluate(tile => tile.classList.contains('demo-app-on')),
        'The active app stays on after Back');
      const calendar = frame.getByRole('button', { name: 'Calendar', exact: true });
      await calendar.click();
      assert.equal(await frame.locator('button.demo-app-on').count(), 1);
      assert(await calendar.evaluate(tile => tile.classList.contains('demo-app-on')),
        'Tapping another app transfers the on state');
    }
    await page.getByRole('link', { name: 'Preview Editor', exact: true }).click();
    const editorUrl = `${home}editor-demo/index.html`;
    await page.waitForURL(editorUrl);
    await page.getByRole('tab', { name: 'Layout', exact: true }).waitFor();
    for (const tab of ['Layout', 'Screen', 'System']) {
      assert(await page.getByRole('tab', { name: tab, exact: true }).isVisible());
    }
    const editorGrid = page.locator('.sp-main');
    assert.deepEqual(await checkLauncher(page), touchscreenIcons, 'Both demos use the same launcher artwork');
    const appTile = editorGrid.locator('[data-slot="3"]');
    const applicationPicker = page.getByRole('combobox', { name: 'Application', exact: true });
    const editApplication = async () => {
      await appTile.click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await applicationPicker.locator('option[value="demo.web.calendar"]').waitFor({ state: 'attached' });
      assert.deepEqual(await applicationPicker.locator('option').allTextContents(),
        ['Choose a Mac app…', ...launcherApps.toSorted((a, b) => a.localeCompare(b))]);
    };
    await editApplication();
    await applicationPicker.selectOption('com.apple.Notes');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.sp-settings-overlay.sp-visible').waitFor({ state: 'hidden' });
    await page.reload();
    await editApplication();
    assert.equal(await applicationPicker.inputValue(), 'com.apple.Notes');

    await page.getByRole('button', { name: 'Close settings' }).click();
    await appTile.click({ button: 'right' });
    await page.locator('.sp-ctx-item').getByText('Delete', { exact: true }).click();
    await editorGrid.locator('.sp-empty-cell').first().click();
    await page.locator('[data-card-type="companion_folder"]').click();
    const folderPicker = page.getByRole('combobox', { name: 'Folder', exact: true });
    await folderPicker.locator('option[value="folder.downloads"]').waitFor({ state: 'attached' });
    assert.deepEqual(await folderPicker.locator('option').allTextContents(),
      ['Choose a folder…', 'Camera Uploads', 'Desktop', 'Documents', 'Downloads', 'Git', 'Projects']);
    await folderPicker.selectOption('folder.downloads');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.sp-settings-overlay.sp-visible').waitFor({ state: 'hidden' });
    await page.reload();
    await editorGrid.getByText('Downloads', { exact: true }).waitFor();
    await editorGrid.getByRole('button', { name: 'Rename card' }).filter({ hasText: 'Downloads' }).click();
    const cardName = page.getByRole('textbox', { name: 'Card name', exact: true });
    await cardName.fill('My Downloads');
    await cardName.press('Enter');
    await editorGrid.getByText('My Downloads', { exact: true }).waitFor();

    const openBacklight = async () => {
      await page.getByRole('tab', { name: 'Screen', exact: true }).click();
      await page.getByRole('heading', { name: 'Backlight', exact: true }).click();
    };
    await openBacklight();
    await page.getByRole('button', { name: 'Manual', exact: true }).click();
    const brightnessField = page.locator('.sp-field').filter({ has: page.getByText('Brightness', { exact: true }) });
    const brightness = brightnessField.getByRole('slider');
    await brightness.fill('65');
    await page.waitForFunction(async () => {
      const response = await fetch('/light/Display%20Backlight');
      return (await response.json()).brightness === Math.round(65 * 2.55);
    });
    await page.reload();
    await openBacklight();
    await brightnessField.getByText('65%', { exact: true }).waitFor();
    assert.equal(await brightness.inputValue(), '65');

    await page.goto(`${home}editor/index.html`);
    assert.deepEqual(await checkLauncher(page, true), touchscreenIcons);
    assert.equal(await page.getByRole('tab').count(), 0, 'The touchscreen demo stays read-only');
    const shortcutPages = {
      Finder: ['Camera Uploads', 'Desktop', 'Downloads', 'Git'],
      Safari: ['Reload', 'Search Bar', 'Tab Overview', 'Previous Tab', 'Next Tab'],
      Slack: ['New Message', 'Search', 'Browse DMs', 'Jump Unread', 'All Unread', 'Search chat', 'Shortcuts', 'Previous Unread'],
      Notes: ['New Note', 'New Folder', 'Search Notes', 'Checklist', 'Cell Paragraph'],
      ChatGPT: ['Command', 'Approve', 'Browser', 'Sidebar', 'Bottom Terminal', 'Side Terminal', 'Side Terminal'],
      Claude: ['Quick Entry', 'Code Shortcuts', 'New Session', 'Next Session'],
    };
    for (const [app, expectedTiles] of Object.entries(shortcutPages)) {
      const appTile = page.getByRole('button', { name: app, exact: true });
      await appTile.click();
      const back = page.getByRole('button', { name: 'Back — Home', exact: true });
      const backIcon = back.locator('img.sp-companion-app-icon');
      await backIcon.waitFor();
      const icon = await backIcon.evaluate(image => image.src);
      assert.equal(hash('sha256', icon), touchscreenIcons[launcherApps.indexOf(app)], app + ' Back tile artwork');
      const shortcutTiles = page.locator('.sp-main button.sp-btn:not(.sp-back-btn)');
      assert.deepEqual(await shortcutTiles.evaluateAll(tiles => tiles.map(tile => tile.getAttribute('aria-label'))),
        expectedTiles, app + ' subpage tile order');
      await shortcutTiles.first().click();
      assert(await back.isVisible(), app + ' shortcuts should stay on the subpage');
      await back.click();
      await appTile.waitFor();
      assert(await appTile.evaluate(tile => tile.classList.contains('demo-app-on')), app + ' stays active after Back');
    }

    await page.goto(editorUrl);
    await editorGrid.getByText('My Downloads', { exact: true }).waitFor();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
    assert.deepEqual(await checkLauncher(page), touchscreenIcons);
    console.log('The separate editor saves and resets its own layout without changing the touchscreen demo.');

    await page.goto(home);
    await setup.press('Enter');
    await page.waitForURL(`${home}screens/4848s040`);
    console.log('Homepage checks passed at desktop, tablet and phone widths.');
    await assertSupportedInstaller();
    await page.goto(`${base}/screens/4848s040`);
    await page.locator('.VPNavBarMenu').getByRole('link', { name: 'Install', exact: true }).click();
    await page.waitForURL('**/screens/4848s040#install');
    await assertSupportedInstaller();
    assert(manifests.length >= 2, 'Setup and hardware-guide navigation must check the S3 manifest');
    await page.locator('.VPNavBarMenu').getByRole('link', { name: 'Download', exact: true }).click();
    await page.waitForURL('**/screens/4848s040#download');
    const download = page.locator('.mac-app-download a');
    await download.waitFor();
    assert.match(await download.getAttribute('href'),
      /^https:\/\/github\.com\/jtenniswood\/espdesktop\/releases(?:\/download\/v?\d+\.\d+\.\d+\/EspDesktop-\d+\.\d+\.\d+\.dmg)?$/);
    assert.equal(await page.locator('h2[id="_3-configure-your-cards"]').count(), 0);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `Display setup must fit a ${width}px viewport`);
    }
    const steps = page.locator('.display-setup-step');
    assert.equal(await steps.count(), 4);
    for (const step of await steps.all()) {
      const copy = await step.locator('.display-setup-copy').boundingBox();
      const photo = await step.locator('img').boundingBox();
      assert(copy.x + copy.width <= photo.x, 'Desktop setup images must appear to the right of the instructions');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const step of await steps.all()) {
      const copy = await step.locator('.display-setup-copy').boundingBox();
      const photo = await step.locator('img').boundingBox();
      assert(copy.y + copy.height <= photo.y, 'Phone setup images must appear below the instructions');
    }
    const beforeRetired = manifests.length;
    const retired = await page.goto(`${base}/getting-started/c6-recovery`);
    assert.equal(retired.status(), 404, 'Retired P4 recovery is not a public setup page');
    assert.equal(await page.locator('esp-web-install-button').count(), 0);
    assert.equal(manifests.length, beforeRetired, 'Retired P4 setup must not offer an installer');
    const publishedSetup = 'https://espdesktop.com/screens/4848s040';
    await page.route(publishedSetup, route => route.fulfill({ contentType: 'text/html', body: 'Redirect target' }));
    for (const [formerUrl, destination] of [
      ['/getting-started/install', `${publishedSetup}#set-up-espdesktop`],
      ['/getting-started/mac-app#pair-the-display', `${publishedSetup}#pair-the-display`],
      ['/features/setup#add-a-mac-control', `${base}/features/home#add-a-card`],
    ]) {
      await page.goto(base + formerUrl);
      await page.waitForURL(destination);
    }
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
