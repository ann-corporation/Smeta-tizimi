import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Server sessiyasi yo'q (preview'da /api/* mavjud emas) — ochiq kirish sahifasi chiqadi. */
async function ochiq(page: Page) {
  await page.addInitScript(() => { try { localStorage.clear(); } catch { /* yo'q */ } });
}

test.beforeEach(async ({ page }) => { await ochiq(page); });

test('landing sahifa chiziladi', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tizimga kirish' }).first()).toBeVisible();
});

test('til almashtirish uz -> ru -> en', async ({ page }) => {
  await page.goto('/');
  const til = page.getByRole('combobox', { name: 'Til' }).first();
  await expect(til).toBeVisible();
  await til.selectOption('ru');
  await expect(page.getByRole('button', { name: 'Войти' }).first()).toBeVisible();
  await page.getByRole('combobox').first().selectOption('en');
  await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
  await page.getByRole('combobox').first().selectOption('uz');
  await expect(page.getByRole('button', { name: 'Tizimga kirish' }).first()).toBeVisible();
});

test('«Yuklab olish» bo‘limi kartalari chiziladi', async ({ page }) => {
  await page.goto('/');
  const bolim = page.locator('#entry-download');
  await bolim.scrollIntoViewIfNeeded();
  await expect(bolim).toBeVisible();
  await expect(bolim.locator('article.entry-dl-card')).toHaveCount(5);
  for (const p of ['windows', 'android']) {
    await expect(bolim.locator(`article[data-platform="${p}"]`)).toBeVisible();
  }
});

test('/admin sessiyasiz «Kirish talab qilinadi» ko‘rsatadi', async ({ page }) => {
  // preview'da /api yo'q (SPA fallback 200 qaytaradi) — haqiqiy serverdagi 401 ni taqlid qilamiz.
  await page.route('**/api/sessiya**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"xato":"sessiya yo\'q"}' }));
  await page.goto('/admin');
  await expect(page.getByText('Kirish talab qilinadi')).toBeVisible();
});

test('kirish formasi ochiladi', async ({ page }) => {
  // «Tizimga kirish» sessiyani tekshiradi; preview'da /api yo'q — haqiqiy 401 ni taqlid qilamiz.
  await page.route('**/api/sessiya**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"xato":"sessiya yo\'q"}' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Tizimga kirish' }).first().click();
  const forma = page.locator('#entry-account');
  await expect(forma).toBeVisible();
  await expect(forma.locator('input').first()).toBeVisible();
});

test('telefon ekranida (412x915) gorizontal scroll yo‘q', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});

test('PWA manifest mavjud', async ({ request }) => {
  const r = await request.get('/manifest.webmanifest');
  expect(r.ok()).toBe(true);
  const m = await r.json();
  expect(m.name).toBeTruthy();
  expect(m.start_url).toBeTruthy();
});

test('a11y (axe): landing — critical buzilish yo‘q', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const jiddiy = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const royxat = jiddiy.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help}`);
  await info.attach('axe-serious-critical.txt', { body: royxat.join('\n') || 'yo‘q', contentType: 'text/plain' });
  console.log(`axe serious/critical: ${royxat.length ? '\n' + royxat.join('\n') : 'yo‘q'}`);
  expect(jiddiy.filter((v) => v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
