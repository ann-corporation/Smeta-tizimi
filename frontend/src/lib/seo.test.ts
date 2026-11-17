import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

describe('SEO: ikonlar, kontent sahifalar, sitemap va marshrutlar', () => {
  const SLUGS = ['smeta', 'f2', 'ombor', 'ilova', 'haqida'];
  const html = oqi('index.html');
  const routes = JSON.parse(oqi('public/_routes.json')) as { exclude: string[] };

  it('Google favicon: 48/96/192 PNG fayl va <link rel="icon"> e\'loni; favicon.ico ildizda', () => {
    for (const n of [48, 96, 192]) {
      const png = readFileSync(resolve(__dirname, `../../public/favicon-${n}x${n}.png`));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(n);
      expect(png.readUInt32BE(20)).toBe(n);
      expect(html).toContain(`<link rel="icon" type="image/png" sizes="${n}x${n}" href="/favicon-${n}x${n}.png" />`);
      expect(routes.exclude).toContain(`/favicon-${n}x${n}.png`);
    }
    expect(existsSync(resolve(__dirname, '../../public/favicon.ico'))).toBe(true);
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    const at = readFileSync(resolve(__dirname, '../../public/apple-touch-icon.png'));
    expect(at.subarray(1, 4).toString()).toBe('PNG');
    expect(routes.exclude).toContain('/apple-touch-icon.png');
  });

  it('JSON-LD: Organization logo (512 PNG) + sameAs; SoftwareApplication OS, kategoriya va O\'zbekiston auditoriyasi', () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const g = (JSON.parse(m![1]) as { '@graph': Array<Record<string, unknown>> })['@graph'];
    const org = g.find((x) => x['@type'] === 'Organization')!;
    expect(String(org.logo)).toMatch(/^https:\/\/qurai\.uz\/.+\.png$/);
    expect(existsSync(resolve(__dirname, '../../public', String(org.logo).replace('https://qurai.uz/', '')))).toBe(true);
    expect(Array.isArray(org.sameAs)).toBe(true);
    const app = g.find((x) => x['@type'] === 'SoftwareApplication')!;
    expect(String(app.operatingSystem)).toMatch(/Web/);
    expect(String(app.operatingSystem)).toMatch(/Android/);
    expect(app.applicationCategory).toBe('BusinessApplication');
    expect(JSON.stringify(app.audience)).toContain('Uzbekistan');
  });

  it('kontent sahifalar (uz + ru): noyob title/description, canonical, hreflang, brend, ichki havolalar', () => {
    const titles = new Set<string>();
    const descs = new Set<string>();
    for (const slug of SLUGS) {
      for (const lang of ['uz', 'ru'] as const) {
        const p = lang === 'uz' ? `public/${slug}.html` : `public/ru/${slug}.html`;
        const h = oqi(p);
        const url = lang === 'uz' ? `https://qurai.uz/${slug}` : `https://qurai.uz/ru/${slug}`;
        const title = h.match(/<title>([^<]+)<\/title>/)![1];
        const desc = h.match(/<meta name="description" content="([^"]+)"/)![1];
        expect(title).toContain('QURAI');
        expect(desc.length).toBeGreaterThan(60);
        titles.add(title);
        descs.add(desc);
        expect(h).toContain(`<html lang="${lang}">`);
        expect(h).toContain(`<link rel="canonical" href="${url}" />`);
        expect(h).toContain(`hreflang="uz" href="https://qurai.uz/${slug}"`);
        expect(h).toContain(`hreflang="ru" href="https://qurai.uz/ru/${slug}"`);
        expect(h).toContain(lang === 'uz' ? 'QURAI — qurilish uchun raqamli platforma' : 'QURAI — цифровая платформа для строительства');
        expect(h).toMatch(/<h1>[^<]+<\/h1>/);
        expect(h).not.toMatch(/noindex/i);
        expect(h).toContain('"@type":"BreadcrumbList"');
        expect(h).toContain('rel="icon" type="image/png" sizes="48x48"');
        expect(h.charCodeAt(0)).not.toBe(0xfeff);
        for (const other of SLUGS.filter((s) => s !== slug).slice(0, 1)) {
          expect(h).toContain(lang === 'uz' ? `href="/${other}"` : `href="/ru/${other}"`);
        }
      }
    }
    expect(titles.size).toBe(SLUGS.length * 2);
    expect(descs.size).toBe(SLUGS.length * 2);
  });

  it('/ilova: APK havolasi mobile-release.json bilan mos; Telegram bot havolasi bor', () => {
    const a = (JSON.parse(oqi('public/mobile-release.json')) as { android: { version: string; sha256: string; file: string } }).android;
    const href = `/android/${a.version}/${a.sha256}/${a.file}`;
    for (const p of ['public/ilova.html', 'public/ru/ilova.html']) {
      const h = oqi(p);
      expect(h).toContain(`href="${href}"`);
      expect(h).toContain('https://t.me/qur_uz_bot');
    }
  });

  it('statik bosh sahifa yangi bo\'limlarga bog\'langan', () => {
    for (const s of SLUGS) expect(html).toContain(`href="/${s}"`);
  });

  it('sitemap: yangi sahifalar (uz+ru) lastmod bilan; _routes.json dan chiqarilgan', () => {
    const s = oqi('public/sitemap.xml');
    for (const slug of SLUGS) {
      for (const u of [`https://qurai.uz/${slug}`, `https://qurai.uz/ru/${slug}`]) {
        expect(s).toMatch(new RegExp(`<loc>${u}</loc>[^]*?<lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));
      }
      expect(routes.exclude).toContain(`/${slug}`);
    }
    expect(routes.exclude).toContain('/ru/*');
  });
});