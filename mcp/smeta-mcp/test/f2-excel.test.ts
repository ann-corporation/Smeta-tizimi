/**
 * f2_excel — PARITET: MCP yo'li (haqiqiy frontend yuklovchilari → sayt-shim → mock pg → `f2Yasa`) saytdagi F2 tarixi/mijoz generatori
 * (`f2AktTayyorla` → `f2Hujjat`) bilan bir xil sun'iy akt uchun KATAKMA-KATAK (kolontituldan tashqari bayt-bayt) teng hujjat beradi.
 * Sayt serveri (`/api/hujjat-yarat`) ham aynan shu `f2Yasa` ni chaqiradi (frontend/functions/api/hujjat-yarat.test.ts: GOLDEN).
 * Sun'iy ma'lumot (haqiqiy summa/nom/INN yo'q).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { tengKolontitulsiz } from '../../../frontend/functions/_shared/test-golden-yordam';
import type { F2Tafsilot } from '../../../frontend/src/api/t2-narx';
import { f2AktTayyorla } from '../../../frontend/src/lib/f2-akt-eksport';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS } from '../../../frontend/src/lib/f2-hujjat.fixture';
import { f2Hujjat } from '../../../frontend/src/lib/f2-hujjat';
import { NAKRUTKA_STANDART } from '../../../frontend/src/lib/nakrutka-kaskad';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yuk } from '../../../frontend/src/lib/f2-tayyor';
import { toolChaqir } from '../src/tool';
import { f2Excel, f2Qoidalar, faylNomiTozala } from '../src/tools/hujjat';
import { Rad } from '../src/frontend';
import { mockMuhit, type Javobchi } from './mock';

const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
const rowMap = new Map(AKT246_ROWS.map((r) => [r.id, r]));
const tafsilot = f2Yuk(q, '1').map((p, i) => {
  const r = rowMap.get(p.qatorId)!;
  return { akt_id: 246, obyekt_id: 79, kompaniya_id: 17, tur: 'f2', oy: '2026-10-01', akt_holat: 'tasdiqlangan', raqam: '1', akt_kim: null, akt_sana: '2026-10-02', akt_qator_id: 1000 + i,
    qator_id: p.qatorId, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, qator_tur: r.tur, hajm: p.certifiedQuantity ?? 0, narx: p.certifiedUnitPrice ?? null, summa: p.certifiedAmount ?? null, izoh: null,
    certified_quantity: p.certifiedQuantity ?? null, certified_unit_price: p.certifiedUnitPrice ?? null, certified_amount: p.certifiedAmount ?? null } as F2Tafsilot;
});
const AKT = { id: 246, obyekt_id: 79, kompaniya_id: 17, obyekt: 'Fast Food 1-etaj', tur: 'f2', raqam: '1', oy: '2026-10-01', holat: 'tasdiqlangan', hujjat_jami: 150026606.32 };
const kontekst = { imzo: {}, shartnoma: null, nakrutka: NAKRUTKA_STANDART, podval: null };

/** Sayt shlyuzi javoblarini taqlid qiluvchi mock Postgres: har yo'l — frontend yuklovchilari kutgan shaklda. */
function bazaJavobi(opt: { reestr?: unknown[]; akt?: Record<string, unknown>; token?: unknown } = {}): Javobchi {
  const reestr = opt.reestr ?? [AKT];
  return (sql, params) => {
    const rpc = /select public\."(\w+)"\(/.exec(sql)?.[1];
    if (rpc === 't2_akt_reestr_obyekt_v1') return [{ r: { ok: true, qatorlar: reestr } }];
    if (rpc === 't2_shartnoma_liniya_v1') return [{ r: { ok: true, loyihalar: [], shartnomalar: [], obyektlar: [], rollar: [], turlar: [] } }];
    if (rpc === 't2_akt_podval_ol_v1') return [{ r: { ok: true, podvallar: [] } }];
    if (rpc === 't2_obyekt_nakrutka_v1') return [{ r: { ok: true, obyekt_id: 79, shartnoma_id: null, koeffitsientlar: NAKRUTKA_STANDART, nk_manba: 'sukut', nakrutka_podval_id: null } }];
    if (rpc === 't2_obyekt_imzochilar_v1') return [{ r: { ok: true, obyekt_id: 79, imzochilar: [] } }];
    if (rpc === 't2_kompaniya_sozlama_ol_v1') return [{ r: { ok: true, kompaniya_id: 17, mavqe: null, sozlamalar: {}, yozish_mumkin: false } }];
    if (rpc === 't2_token_sarfla_v1') return [{ r: opt.token ?? { ok: true, sarflandi: 12, bepul_takror: false } }];
    if (rpc) return undefined;
    if (sql.includes('from public."t2_daraxt"')) return AKT246_ROWS as never;
    if (sql.includes('from public."t2_f2_tafsilot"')) return tafsilot as never;
    if (sql.includes('from public."t2_akt_qator"') || sql.includes('from public."t2_qator"') || sql.includes('from public."t2_nakrutka_podval_royxat"')) return [];
    if (sql.includes('from public.t2_akt a join public.t2_obyekt o')) {
      const idlar = (params[0] as number[]) ?? [];
      return idlar.includes(246) ? [{ id: 246, obyekt_id: 79, tur: 'f2', holat: 'tasdiqlangan', oy: '2026-10-01', raqam: '1', kompaniya_id: 17, ...(opt.akt ?? {}) }] : [];
    }
    return undefined;
  };
}

const tmp: string[] = [];
const papka = () => { const d = mkdtempSync(path.join(os.tmpdir(), 'smeta-f2-excel-')); tmp.push(d); return d; };
afterAll(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });

const sayt = () => {
  const k = f2AktTayyorla({ smeta: AKT246_ROWS, lines: tafsilot, aktQatorlar: [], podvallar: new Map(), kontekst, akt: AKT, obyektNom: 'Fast Food 1-etaj', raqamlar: new Map([[246, '1']]) })!;
  return f2Hujjat(k.bolimlar, k.qatorlar, k.opsiya);
};

type Hujjat = { akt_id: number; fayl_nomi: string; fayl?: string; qator_soni: number | null; token: Record<string, unknown>; summa: Record<string, unknown> | null; hajm_bayt: number; yacheyka?: number };
type Javob = { rejim: string; papka?: string; hujjatlar: Array<Hujjat & { rad?: string; kod?: string }> };

describe('f2_excel — sayt bilan paritet', () => {
  it('tasdiq:true — fayl sayt generatori bilan katakma-katak teng; fayl nomi hujjatFaylNomi; token f2 kaliti bilan', async () => {
    const { mu, h } = mockMuhit(bazaJavobi());
    const dir = papka();
    const r = await toolChaqir(f2Excel, mu, { akt_id: 246, papka: dir, tasdiq: true });
    expect(r.isError).toBeUndefined();
    const j = JSON.parse(r.content[0].text) as { natija?: unknown } & Javob;
    const x = j.hujjatlar[0];
    const web = sayt();
    expect(x.fayl_nomi).toBe(web.faylNomi); // saytdagi nom (hujjatFaylNomi) bilan bir xil
    expect(x.fayl).toBe(path.join(dir, faylNomiTozala(web.faylNomi)));
    expect(existsSync(x.fayl!)).toBe(true);
    expect(tengKolontitulsiz(new Uint8Array(readFileSync(x.fayl!)), web.bytes)).toBe(true); // kolontitul (QURAI imzosi) dan boshqa hammasi teng
    expect(x.qator_soni).toBeGreaterThan(0);
    expect(x.summa?.ustamasiz).toBeTypeOf('number');
    expect(x.token).toEqual({ sarflandi: 12, bepul_takror: false });
    // token — sayt bilan bir xil RPC va kalit (obyekt+oy+raqam), MCP aktori; commit (tasdiq)
    const sarf = h.sorovlar.find((s) => s.sql.includes('t2_token_sarfla_v1'))!;
    expect(sarf.params[0]).toBe(7); // p_actor_id
    expect(sarf.params[1]).toBe(17); // p_kompaniya_id
    expect(sarf.params[2]).toBe('f2_hujjat'); // p_amal
    expect(JSON.parse(String(sarf.params[5]))).toMatchObject({ hujjat: 'f2_hujjat', xesh: 'f2:79:2026-10:1', obyekt: 79, davr: '2026-10', server: 1 });
    expect(h.sorovlar.at(-1)?.sql).toBe('COMMIT'); // yozish tranzaksiyasi tasdiqlandi
  });

  it('standart (preview): token narxi ko\'rinadi, fayl YOZILMAYDI, tranzaksiya ROLLBACK', async () => {
    const { mu, h } = mockMuhit(bazaJavobi());
    const dir = papka();
    const r = await toolChaqir(f2Excel, mu, { akt_id: 246, papka: dir });
    const j = JSON.parse(r.content[0].text) as Javob;
    expect(j.rejim).toMatch(/preview/);
    expect(j.hujjatlar[0].token).toEqual({ sarflandi: 12, bepul_takror: false });
    expect(j.hujjatlar[0].fayl).toBeUndefined();
    expect(readdirSync(dir)).toEqual([]);
    expect(h.sorovlar.at(-1)?.sql).toBe('ROLLBACK'); // token yechimi ham qaytdi
    expect(h.sorovlar.some((s) => s.sql === 'COMMIT')).toBe(false);
  });

  it('dry_run:true tasdiq:true bilan to\'qnashsa ham preview (token yechilmaydi)', async () => {
    const { mu, h } = mockMuhit(bazaJavobi());
    const r = await toolChaqir(f2Excel, mu, { akt_id: 246, papka: papka(), tasdiq: true, dry_run: true });
    expect((JSON.parse(r.content[0].text) as Javob).hujjatlar[0].fayl).toBeUndefined();
    expect(h.sorovlar.some((s) => s.sql === 'COMMIT')).toBe(false);
  });

  it('qayta yuklash bepul (RPC takror) — token 0, fayl baribir yoziladi', async () => {
    const { mu } = mockMuhit(bazaJavobi({ token: { ok: true, takror: true } }));
    const r = await toolChaqir(f2Excel, mu, { akt_id: 246, papka: papka(), tasdiq: true });
    expect((JSON.parse(r.content[0].text) as Javob).hujjatlar[0].token).toEqual({ sarflandi: 0, bepul_takror: true });
  });

  it('token yetmasa: preview narxni ko\'rsatadi (kerak/balans); tasdiq — xato, fayl yo\'q', async () => {
    const yetmaydi = { ok: false, code: 'TOKEN_YETMAYDI', kerak: 12, balans: 3 };
    const dir = papka();
    const p = mockMuhit(bazaJavobi({ token: yetmaydi }));
    const jp = JSON.parse((await toolChaqir(f2Excel, p.mu, { akt_id: 246, papka: dir })).content[0].text) as Javob;
    expect(jp.hujjatlar[0].token).toEqual({ yetmaydi: true, kerak: 12, balans: 3 });
    const t = mockMuhit(bazaJavobi({ token: yetmaydi }));
    const rt = await toolChaqir(f2Excel, t.mu, { akt_id: 246, papka: dir, tasdiq: true });
    expect(rt.isError).toBe(true);
    expect(rt.content[0].text).toMatch(/TOKEN_YETMAYDI/);
    expect(existsSync(path.join(dir, faylNomiTozala(sayt().faylNomi)))).toBe(false);
    expect(t.h.sorovlar.some((s) => s.sql === 'COMMIT')).toBe(false);
  });
});

describe('f2_excel — biznes qoidalari', () => {
  it('bekor (holat=bekor) akt rad etiladi — token yechilmaydi', async () => {
    const { mu, h } = mockMuhit(bazaJavobi({ akt: { holat: 'bekor' }, reestr: [{ ...AKT, holat: 'bekor' }] }));
    const r = await toolChaqir(f2Excel, mu, { akt_id: 246, papka: papka(), tasdiq: true });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/bekor/);
    expect(h.sorovlar.some((s) => s.sql.includes('t2_token_sarfla_v1'))).toBe(false);
  });

  it('obyekt+oyiga 2 ta bekor qilinmagan F-2 — rad, akt idlari bilan', async () => {
    const { mu, h } = mockMuhit(bazaJavobi({ reestr: [AKT, { ...AKT, id: 300, raqam: '2', holat: 'qoralama' }, { ...AKT, id: 301, holat: 'bekor' }] }));
    const r = await toolChaqir(f2Excel, mu, { akt_id: 246, papka: papka(), tasdiq: true });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/#246/);
    expect(r.content[0].text).toMatch(/#300/);
    expect(r.content[0].text).not.toMatch(/#301/);
    expect(h.sorovlar.some((s) => s.sql.includes('t2_token_sarfla_v1'))).toBe(false);
  });

  it('f2Qoidalar: boshqa oy yoki bekor F-2 — to\'siq emas', () => {
    expect(() => f2Qoidalar({ id: 1, oy: '2026-10-01', holat: 'tasdiqlangan' }, [{ id: 1, oy: '2026-10-01', holat: 'tasdiqlangan' }, { id: 2, oy: '2026-11-01', holat: 'tasdiqlangan' }, { id: 3, oy: '2026-10-01', holat: 'bekor' }])).not.toThrow();
    expect(() => f2Qoidalar({ id: 1, oy: '2026-10-01', holat: 'bekor' }, [])).toThrow(Rad);
  });

  it('akt topilmadi / F2 emas / akt_id yo\'q — aniq xato; papka: yo\'l ajratgich nomga kirmaydi', async () => {
    const a = mockMuhit(bazaJavobi());
    expect((await toolChaqir(f2Excel, a.mu, { akt_id: 999 })).content[0].text).toMatch(/topilmadi/);
    expect((await toolChaqir(f2Excel, a.mu, {})).content[0].text).toMatch(/akt_id/);
    const f = mockMuhit(bazaJavobi({ akt: { tur: 'fakt' } }));
    expect((await toolChaqir(f2Excel, f.mu, { akt_id: 246 })).content[0].text).toMatch(/F-2 emas/);
    expect(faylNomiTozala('../a/b:c*.xlsx')).toBe('_a_b_c_.xlsx');
  });

  it('kompaniya doirasi: ruxsatsiz kompaniya aktidan hujjat yasalmaydi', async () => {
    const { mu } = mockMuhit(bazaJavobi());
    mu.kompaniyaDoira = [99];
    const r = await toolChaqir(f2Excel, mu, { akt_id: 246 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/ruxsat/);
  });

  it('disk:true: reserve → R2 PUT (REST) → finalize → Disk RPC; tasdiqlanmagan F-2 Diskka yozilmaydi', async () => {
    const saqla = { t: process.env.CLOUDFLARE_API_TOKEN, a: process.env.CLOUDFLARE_ACCOUNT_ID, f: globalThis.fetch };
    process.env.CLOUDFLARE_API_TOKEN = 'tok-test'; process.env.CLOUDFLARE_ACCOUNT_ID = 'acc-test';
    const puts: Array<{ url: string; method?: string; auth?: string }> = [];
    globalThis.fetch = (async (u: string, init?: RequestInit) => { puts.push({ url: String(u), method: init?.method, auth: (init?.headers as Record<string, string>)?.Authorization }); return new Response('{}', { status: 200 }); }) as typeof fetch;
    try {
      const asos = bazaJavobi();
      const javob: Javobchi = (sql, params) => {
        const rpc = /select public\."(\w+)"\(/.exec(sql)?.[1];
        if (rpc === 't2_document_canonical_reserve_v1') return [{ r: { ok: true, document_id: 5, r2_key: 'docs/17/0/79/d5/r1', canonical_storage_status: 'reserved' } }];
        if (rpc === 't2_document_canonical_finalize_v1') return [{ r: { ok: true } }];
        if (rpc === 't2_disk_tizim_yoz_v1') return [{ r: { ok: true, fayl_id: 9, raqam: 1, yangi: true } }];
        return asos(sql, params);
      };
      const { mu, h } = mockMuhit(javob);
      const j = JSON.parse((await toolChaqir(f2Excel, mu, { akt_id: 246, papka: papka(), tasdiq: true, disk: true })).content[0].text) as Javob & { hujjatlar: Array<{ disk?: string }> };
      expect(j.hujjatlar[0].disk).toBe('ok');
      expect(puts).toHaveLength(1);
      expect(puts[0]).toMatchObject({ method: 'PUT', auth: 'Bearer tok-test' });
      expect(puts[0].url).toContain('/accounts/acc-test/r2/buckets/smeta-tizimi-canonical/objects/docs/17/0/79/d5/r1');
      const nomlar = h.sorovlar.map((s) => /select public\."(\w+)"\(/.exec(s.sql)?.[1]).filter(Boolean);
      expect(nomlar).toEqual(expect.arrayContaining(['t2_token_sarfla_v1', 't2_document_canonical_reserve_v1', 't2_document_canonical_finalize_v1', 't2_disk_tizim_yoz_v1']));
      expect(nomlar.indexOf('t2_token_sarfla_v1')).toBeLessThan(nomlar.indexOf('t2_document_canonical_reserve_v1'));
      // taxminiy qoralama (prorab tasdig'i kutilmoqda) F-2 — Diskka yozilmaydi; oddiy qoralama endi YOZILADI (egasi 2026-11-19)
      const q = mockMuhit(bazaJavobi({ akt: { holat: 'qoralama', raqam: 'TAXMINIY-1' }, reestr: [{ ...AKT, holat: 'qoralama', raqam: 'TAXMINIY-1' }] }));
      const jq = JSON.parse((await toolChaqir(f2Excel, q.mu, { akt_id: 246, papka: papka(), tasdiq: true, disk: true })).content[0].text) as { hujjatlar: Array<{ disk?: string }> };
      expect(jq.hujjatlar[0].disk).toBe('otkazildi');
    } finally {
      globalThis.fetch = saqla.f;
      if (saqla.t === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = saqla.t;
      if (saqla.a === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = saqla.a;
    }
  });
  it('disk:true + R2 sozlanmagan — token yechilishidan OLDIN aniq xato', async () => {
    const saqla = { t: process.env.CLOUDFLARE_API_TOKEN, a: process.env.CLOUDFLARE_ACCOUNT_ID };
    delete process.env.CLOUDFLARE_API_TOKEN; delete process.env.CLOUDFLARE_ACCOUNT_ID;
    try {
      const { mu, h } = mockMuhit(bazaJavobi());
      const r = await toolChaqir(f2Excel, mu, { akt_id: 246, papka: papka(), tasdiq: true, disk: true });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/R2_SOZLANMAGAN/);
      expect(h.sorovlar.some((s) => s.sql.includes('t2_token_sarfla_v1'))).toBe(false);
    } finally {
      if (saqla.t !== undefined) process.env.CLOUDFLARE_API_TOKEN = saqla.t;
      if (saqla.a !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = saqla.a;
    }
  });
});
