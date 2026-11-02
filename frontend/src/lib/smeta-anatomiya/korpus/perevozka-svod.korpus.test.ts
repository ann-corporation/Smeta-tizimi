/**
 * C4 PR-1 qabul o'lchovi — perevozka (tn·km + sarlavhasiz RES), moddali svod, «bo'sh import» darvozasi.
 * Real fayllar repoga qo'yilmaydi — faqat lokal papka orqali:
 *
 *   KORPUS_DIR="D:/…/01_SMETALAR" npx vitest run src/lib/smeta-anatomiya/korpus/perevozka-svod
 *
 * KORPUS_DIR berilmasa test o'tkazib yuboriladi (REAL_BINARY_UNKNOWN), soxta PASS emas.
 * Qabul raqamlari: docs/tadqiqot 04 §8.3 (egasi korpusi).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { kitobAnatomiyasi, type KitobAnatomiyasi } from '../index';
import { varaqRoli } from '../yuklash';
import { faylniOqi } from './oqish';
import type { KirishKitob } from '../turlar';

const DIR = process.env.KORPUS_DIR;

function fayllar(dir: string): string[] {
  const out: string[] = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) out.push(...fayllar(p));
    else if (/\.(xlsx?|xlsm)$/i.test(n) && !n.startsWith('~$')) out.push(p);
  }
  return out.sort();
}

describe.skipIf(!DIR)('C4 PR-1 — perevozka va moddali svod (real korpus)', () => {
  const natija: Array<{ kitob: KirishKitob; a: KitobAnatomiyasi }> = [];
  const yukla = () => {
    if (natija.length) return natija;
    for (const p of fayllar(DIR!)) {
      let kitob: KirishKitob;
      try { kitob = faylniOqi(p, DIR!); } catch { continue; }
      natija.push({ kitob, a: kitobAnatomiyasi(kitob) });
    }
    return natija;
  };

  it('Yo‘l 2,5 km: 3 ta tn·km varag‘i — jami 1 192 846 632 so‘m, qatorlar ИТОГО bilan teng, svod «ТРАНСПОРТНЫЕ РАСХОДЫ» bilan teng', () => {
    const tr = yukla().filter(({ a }) => /Смета\/дор\.ч\//.test(a.fayl)).flatMap(({ a }) => a.erkin.filter((e) => e.rol === 'transport'));
    expect(tr).toHaveLength(3);
    for (const e of tr) {
      expect(e.qatorlar?.length).toBeGreaterThan(0);
      expect(e.jamiMos).toBe(true);
      expect(e.qatorlar!.every((q) => q.isbot.tnKm !== false && q.isbot.summa !== false)).toBe(true);
      expect(e.svodQatori?.dalil.qoida).toBe('formula');
    }
    const jami = tr.reduce((s, e) => s + (e.yakuniy?.qiymat ?? 0), 0);
    expect(Math.round(jami)).toBe(1_192_846_632);
    const itog = yukla().find(({ a }) => /Смета\/итог\.XLS$/i.test(a.fayl));
    const transportModda = itog?.a.svod.flatMap((s) => s.qatorlar).find((q) => /ЗАТРАТЫ НА ТРАНСПОРТНЫЕ РАСХОДЫ/.test(q.xom.toUpperCase()));
    expect(Math.round(transportModda?.summa?.qiymat ?? 0)).toBe(1_192_846_632);
  }, 600_000);

  it('`16.Перевоз` × 2 — sarlavhasiz RES: 2 resurs, ИТОГО 594 370 550 so‘m, svodga formula bilan bog‘langan', () => {
    const pr = yukla().flatMap(({ kitob, a }) => a.varaqlar.flatMap((v, j) => (/Перевоз/i.test(v.varaq) && v.rol === 'res' && v.rolDalil.some((d) => d.qoida === 'res:sarlavhasiz_arifmetika') ? [{ kitob, a, v, j }] : [])));
    expect(pr).toHaveLength(2);
    for (const { kitob, a, v, j } of pr) {
      expect(v.vedomost).toHaveLength(2);
      expect(Math.round(v.jamilar.at(-1)?.qiymat ?? 0)).toBe(594_370_550);
      expect(varaqRoli(v.varaq, kitob.varaqlar[j].rows).rol).toBe('res');
      const e = a.erkin.find((x) => x.varaq === v.varaq);
      expect(e?.rol).toBe('perevozka_res');
      expect(e?.svodQatori?.dalil.qoida).toBe('formula');
    }
  }, 600_000);

  it('svod xat qatorlari: №133 — 4 varaqda 2 tadan, №285 — 2 varaqda 3 tadan, hammasi xat_lumpsum va summali', () => {
    const xatlar = yukla().flatMap(({ a }) => a.svod.flatMap((s) => s.qatorlar.filter((q) => q.tur === 'xat_lumpsum').map((q) => ({ s, q }))));
    const boyicha = (raqam: string) => {
      const m = new Map<string, number>();
      for (const { s, q } of xatlar) if (q.xat?.raqam === raqam) m.set(`${s.fayl}!${s.varaq}`, (m.get(`${s.fayl}!${s.varaq}`) ?? 0) + 1);
      return [...m.values()];
    };
    expect(boyicha('133')).toEqual([2, 2, 2, 2]);
    expect(boyicha('285')).toEqual([3, 3]);
    expect(xatlar.every(({ q }) => q.summa != null && q.summa.masshtab === 1000)).toBe(true);
    // Xat summasi «с НДС» ustunida (yoki unga formula bilan bog'langan) — NDS holati noma'lum qolmaydi.
    expect(xatlar.every(({ q }) => q.summa?.ndsBilan === true)).toBe(true);
  }, 600_000);

  it('regressiya: LRV/RES varaqlarida sonli qatorlar qamrovi ≥ 99 %', () => {
    let sonli = 0, qamr = 0;
    for (const { kitob, a } of yukla()) {
      a.varaqlar.forEach((v, j) => {
        if (v.rol !== 'lrv' && v.rol !== 'res') return;
        const olingan = new Set<number>();
        for (const i of v.ishlar) { olingan.add(i.manzil.qator); for (const r of i.resurslar) olingan.add(r.manzil.qator); }
        for (const r of [...(v.mustaqilResurslar ?? []), ...v.vedomost, ...v.jamilar, ...(v.podvalSatrlar ?? []), ...v.titul, ...v.sarlavhalar]) olingan.add(r.manzil.qator);
        const bosh = v.ustunlar ? v.ustunlar.malumotBoshi : 0;
        kitob.varaqlar[j].rows.forEach((row, r) => {
          if (r < bosh) return;
          const arr = (row ?? []) as unknown[];
          if (arr.some((c) => typeof c === 'number') && arr.some((c) => typeof c === 'string' && /[А-Яа-яA-Za-z]{3}/.test(c))) {
            sonli++;
            if (olingan.has(r + 1)) qamr++;
          }
        });
      });
    }
    // eslint-disable-next-line no-console
    console.log(`LRV/RES qamrov: ${qamr}/${sonli}`);
    expect(qamr / sonli).toBeGreaterThanOrEqual(0.99);
  }, 600_000);
});
