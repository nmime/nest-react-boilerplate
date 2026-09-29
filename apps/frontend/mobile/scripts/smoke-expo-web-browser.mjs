// @requirements REQ-FRONTEND-NATIVE-006
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { chromium, webkit } from '@playwright/test';
import { defaultWebOutputRoot } from './smoke-expo-export.mjs';

const root = resolve(defaultWebOutputRoot);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};
const translations = Object.fromEntries(
  ['en', 'ru', 'zh'].map((locale) => [
    locale,
    JSON.parse(readFileSync(new URL(`../../../../i18n/${locale}/user/mobile.json`, import.meta.url), 'utf8')),
  ]),
);

for (const { name, browserType, viewport } of [
  { name: 'chromium-mobile', browserType: chromium, viewport: { width: 390, height: 844 } },
  { name: 'webkit-mobile', browserType: webkit, viewport: { width: 390, height: 844 } },
  { name: 'chromium-desktop', browserType: chromium, viewport: { width: 1440, height: 1000 } },
]) {
  test(`Expo web renders and changes locale accessibly (${name})`, { timeout: 90_000 }, async () => {
    const server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const file = join(root, pathname === '/' ? 'index.html' : pathname);
      const pathInRoot = relative(root, file);
      if (pathInRoot.startsWith('..') || !existsSync(file)) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('content-type', mimeTypes[extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(response);
    });
    let browser;
    try {
      await new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolveListen);
      });
      browser = await browserType.launch();
      const page = await browser.newPage({ viewport, locale: 'en-US' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // The exported shell must remain usable while unauthenticated/offline.
      await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: {} }));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('main').waitFor();
      await page.getByRole('heading', { name: translations.en['mobile.appName'] }).waitFor();
      for (const locale of ['en', 'ru', 'zh']) {
        // WebKit/Hermes may ship a smaller ICU dataset than Chromium.
        const label = await page.evaluate((locale) => {
          try {
            return new Intl.DisplayNames([locale], { fallback: 'none', type: 'language' }).of(locale) ?? locale;
          } catch {
            return locale;
          }
        }, locale);
        const button = page.getByRole('button', { name: label, exact: true });
        await button.focus();
        await button.press('Enter');
        await page.getByText(translations[locale]['mobile.status'], { exact: true }).waitFor();
        await page.addScriptTag({ path: axePath });
        const violations = await page.evaluate(async () => (await globalThis.axe.run()).violations);
        assert.deepEqual(
          violations.map(({ id, nodes }) => ({ id, elements: nodes.map(({ html }) => html) })),
          [],
        );
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.deepEqual(errors, []);
      const screenshots = resolve(import.meta.dirname, '../../../../test-results/mobile-web');
      mkdirSync(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`), fullPage: true });
    } finally {
      await browser?.close();
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });
}
