import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const oqi = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

describe('SEO: qurai.uz kanonik va qidiruv robotlari', () => {
  const html = oqi('index.html');
  it('index.html: title, description, canonical, OG, JSON-LD va statik tarkib', () => {
    expect(html).toMatch(/<title>QURAI[^<]*<\/title>/);
    expect(html).toContain('<link rel="canonical" href="https://qurai.uz/" />');
    expect(html).toContain('property="og:image" content="https://qurai.uz/brand/qur-icon-512.png"');
    expect(html).toContain('"@type": "SoftwareApplication"');
    expect(html).toContain('"@type": "Organization"');
    expect(html).not.toMatch(/noindex/i);
    expect(html).toMatch(/<div id="root">\s*<main class="qurai-seo">[\s\S]*<h1>QURAI/);
  });
  it('robots.txt ochiq sahifalarga ruxsat, admin/api yopiq, sitemap ko\'rsatilgan', () => {
    const r = oqi('public/robots.txt');
    expect(r).toMatch(/Allow: \/\n/);
    expect(r).toContain('Disallow: /admin');
    expect(r).toContain('Disallow: /api/');
    expect(r).toContain('Sitemap: https://qurai.uz/sitemap.xml');
  });
  it('sitemap.xml faqat qurai.uz ochiq sahifalari; fayllar _routes.json dan chiqarilgan', () => {
    const s = oqi('public/sitemap.xml');
    const locs = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThanOrEqual(1);
    for (const l of locs) expect(l.startsWith('https://qurai.uz/')).toBe(true);
    expect(locs.some((l) => l.includes('/admin'))).toBe(false);
    const routes = JSON.parse(oqi('public/_routes.json')) as { exclude: string[] };
    expect(routes.exclude).toEqual(expect.arrayContaining(['/robots.txt', '/sitemap.xml']));
  });
  it('manifest nomi QURAI', () => {
    const m = JSON.parse(oqi('public/manifest.webmanifest')) as { name: string; short_name: string };
    expect(m.name).toBe('QURAI');
    expect(m.short_name).toBe('QURAI');
  });
});
