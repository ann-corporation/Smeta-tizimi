import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  HISOBOT_TOKEN_KALITLARI, HUJJAT_KALITLARI, HUJJAT_TURLARI, TAQDIM_MANBA_JADVAL, TAYYORGARLIK_QADAMLARI,
  keyingiBosqich, menQarorChiqaramanmi, otishMumkinmi, royxatdagiTokenKalitlari, taqdimHolatidanBosqich, taqdimResursiTurlari,
} from './index';
import { TAYYORGARLIK_USTUNLARI } from '../f2-oylik-paket/shartnoma';
import { SHABLON_TURLARI, type ShablonKirish } from '../hujjat-aylanish/toliqlik';
import type { HujjatTuri } from './turlar';

const SRC = resolve(__dirname, '../..');
const MIGRATIONS = resolve(__dirname, '../../../../supabase/migrations');

function fayllar(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'fixtures') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fayllar(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const turlar = Object.values(HUJJAT_TURLARI) as readonly HujjatTuri[];

describe('hujjat dvigateli reestri', () => {
  it('kalit yozuv kaliti bilan bir xil, takror yo\'q', () => {
    for (const k of HUJJAT_KALITLARI) expect(HUJJAT_TURLARI[k].kalit).toBe(k);
    expect(new Set(HUJJAT_KALITLARI).size).toBe(HUJJAT_KALITLARI.length);
  });

  it('har turda majburiy maydonlar bor, eksportyor fayli mavjud', () => {
    for (const t of turlar) {
      expect(t.majburiy.length, t.kalit).toBeGreaterThan(0);
      if (t.eksport) expect(existsSync(join(SRC, t.eksport.modul)), `${t.kalit}: ${t.eksport.modul}`).toBe(true);
      else expect(t.holat, t.kalit).toBe('rejada');
    }
  });

  it('shablon turlarining majburiy maydonlari ShablonKirish maydonlari (haqiqiy)', () => {
    const haqiqiy = new Set<keyof ShablonKirish>(['obyekt', 'raqam', 'sana', 'laboratoriya', 'sinovTuri', 'normativ', 'korsatkichlar', 'ishNomi', 'ishTavsifi', 'muddat', 'nuqsonlar', 'qabulQiluvchi', 'yuboruvchi', 'ilovalar']);
    for (const k of SHABLON_TURLARI) for (const m of HUJJAT_TURLARI[k].majburiy) expect(haqiqiy.has(m.kalit as keyof ShablonKirish), `${k}.${m.kalit}`).toBe(true);
  });

  it('har eksportyorli turda eksportdan oldingi tekshiruv bor va u haqiqiy qadamlarga ishora qiladi', () => {
    const qadamlar = new Set<string>(TAYYORGARLIK_QADAMLARI.map((q) => q.kalit));
    for (const t of turlar) {
      if (!t.eksport) continue;
      expect(t.tekshiruv.length, `${t.kalit}: tekshiruvsiz eksport`).toBeGreaterThan(0);
      for (const q of t.tekshiruv) expect(qadamlar.has(q), `${t.kalit}: noma'lum qadam ${q}`).toBe(true);
    }
    for (const q of TAYYORGARLIK_QADAMLARI) if (q.hujjat) expect(HUJJAT_TURLARI[q.hujjat], q.kalit).toBeDefined();
  });

  it('tayyorgarlik ustunlari tartibi o\'zgarmagan (xulq saqlanadi)', () => {
    expect([...TAYYORGARLIK_USTUNLARI]).toEqual(['fakt', 'f2', 'forma3', 'nakopitelniy', 'm29', 'ostatka', 'slichitelniy', 'summa']);
  });

  it('har qaror chiqaruvchi taqdim bor turda bor; taqdimsiz turda qaror bosqichi yo\'q', () => {
    for (const t of turlar) {
      if (!t.taqdim) { expect(t.bosqichlar, t.kalit).not.toContain('yuborildi'); expect(t.bosqichlar, t.kalit).not.toContain('qaror'); }
      if (t.bosqichlar.includes('qaror')) expect(t.imzo.tasdiqlaydi.length, t.kalit).toBeGreaterThan(0);
      expect(t.imzo.tasdiqlaydi, t.kalit).not.toContain(t.imzo.tayyorlaydi);
    }
  });

  it('token kaliti yo\'q turda sabab yozilgan', () => {
    for (const t of turlar) if (!t.tokenKalit) expect(t.tokenYoq, t.kalit).toBeTruthy();
  });
});

describe('guard: taqdim resurslari', () => {
  /** t2_tomon_resurs seed: `('kalit', ..., array[..], taqdim_mumkin, faol, ...)`; keyingi migratsiyalar faol/taqdim_mumkin ni o'zgartirishi mumkin. */
  function seed() {
    const sql = readFileSync(join(MIGRATIONS, '20261106200000_t2_tomon_aloqa_v1.sql'), 'utf8');
    const m = new Map<string, { taqdim: boolean }>();
    for (const r of sql.matchAll(/\(\s*'([a-z_0-9]+)',[^\n]*?array\[[^\]]*\],\s*(true|false),/g)) m.set(r[1], { taqdim: r[2] === 'true' });
    return m;
  }

  it('DB da taqdim_mumkin har resursning reestrda turi bor', () => {
    const s = seed();
    const taqdimli = [...s].filter(([, v]) => v.taqdim).map(([k]) => k);
    expect(taqdimli.sort()).toEqual(['aosr', 'f2', 'hujjat']);
    for (const r of taqdimli) expect(taqdimResursiTurlari(r).length, `resurs ${r} uchun reestrda tur yo'q`).toBeGreaterThan(0);
  });

  it('reestrdagi har taqdim resursi DB da taqdim_mumkin', () => {
    const s = seed();
    for (const t of turlar) if (t.taqdim) expect(s.get(t.taqdim.resurs)?.taqdim, `${t.kalit} → ${t.taqdim.resurs}`).toBe(true);
  });

  it('manba jadvali bor resurslar reestr bilan mos (F2 → t2_akt, АОСР → t2_aosr)', () => {
    expect(TAQDIM_MANBA_JADVAL).toEqual({ f2: 't2_akt', aosr: 't2_aosr' });
    expect(HUJJAT_TURLARI.f2.taqdim.manbaJadval).toBe('t2_akt');
    expect(HUJJAT_TURLARI.aosr.taqdim.manbaJadval).toBe('t2_aosr');
  });

  it('kodda taqdimYubor(...) ga literal resurs berilsa, u reestrda bor', () => {
    const resurslar = new Set(turlar.flatMap((t) => (t.taqdim ? [t.taqdim.resurs] : [])));
    for (const f of fayllar(SRC)) {
      const matn = readFileSync(f, 'utf8');
      for (const m of matn.matchAll(/taqdimYubor\([^,]+,[^,]+,\s*'([a-z_0-9]+)'/g)) expect(resurslar.has(m[1]), `${f}: ${m[1]}`).toBe(true);
    }
  });
});

describe('guard: har eksport reestr orqali', () => {
  it('kodda ishlatilgan har token kaliti (hujjat: \'X\') reestrda ro\'yxatdan o\'tgan', () => {
    const royxat = royxatdagiTokenKalitlari();
    const topilgan = new Map<string, string>();
    for (const f of fayllar(SRC)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bhujjat:\s*'([A-Z0-9_-]+)'/g)) topilgan.set(m[1], f);
    }
    expect(topilgan.size).toBeGreaterThan(10);
    for (const [kalit, f] of topilgan) expect(royxat.has(kalit), `token kaliti ro'yxatda yo'q: ${kalit} (${f})`).toBe(true);
  });

  it('reestrdagi har token kaliti kodda haqiqatan ishlatiladi (o\'lik kalit yo\'q)', () => {
    const hammasi = fayllar(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const k of royxatdagiTokenKalitlari()) {
      if (k === 'AOSR' || k === 'OMBOR_QORALAMA_REESTR' || k === 'RESURS_VEDOMOST') continue; // dinamik o'tkaziladi
      expect(hammasi.includes(`'${k}'`), k).toBe(true);
    }
    expect(HISOBOT_TOKEN_KALITLARI.length).toBeGreaterThan(0);
  });
});

describe('hayot sikli', () => {
  it('taqdim holati → bosqich', () => {
    expect(taqdimHolatidanBosqich('yuborilgan')).toBe('yuborildi');
    expect(taqdimHolatidanBosqich('ko_rilmoqda')).toBe('yuborildi');
    expect(taqdimHolatidanBosqich('qabul')).toBe('qaror');
    expect(taqdimHolatidanBosqich('tuzatish')).toBe('qaror');
    expect(taqdimHolatidanBosqich('qaytarilgan')).toBe('qoralama');
  });
  it('o\'tishlar: oldinga bir bosqich; tuzatish/rad → qoralama; qabul → orqaga yo\'q', () => {
    expect(keyingiBosqich('f2', 'qoralama')).toBe('tekshiruv');
    expect(keyingiBosqich('f2', 'arxiv')).toBeNull();
    expect(keyingiBosqich('m29', 'tekshiruv')).toBe('arxiv');
    expect(otishMumkinmi('f2', 'qaror', 'qoralama', 'tuzatish')).toBe(true);
    expect(otishMumkinmi('f2', 'qaror', 'qoralama', 'qabul')).toBe(false);
    expect(otishMumkinmi('f2', 'qoralama', 'qaror')).toBe(false);
  });
  it('qarorni faqat qarshi tomon chiqaradi', () => {
    expect(menQarorChiqaramanmi('aosr', 'texnadzor')).toBe(true);
    expect(menQarorChiqaramanmi('aosr', 'pudratchi')).toBe(false);
    expect(menQarorChiqaramanmi('f2', 'pudratchi')).toBe(false);
  });
});
