// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sess } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { lugatKalit } from '../../src/lib/ombor-moslash/lugat';

const ai = vi.hoisted(() => ({ aiHisobli: vi.fn() }));
vi.mock('../_shared/ai-hisobli', () => ({ aiHisobli: ai.aiHisobli, AiByudjetXatosi: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } } }));
import { onRequestPost, taklifKeshTozala } from './ombor-buyruq';

// Faqat sintetik ma'lumot (haqiqiy nom/summa yo'q).
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-service', SESSIYA_KALIT: 'k'.repeat(32) };
const mk = (perms: string[]): Sess => ({ rol: 'omborchi', exp: Date.now() + 600000, jti: 'synthetic', foydalanuvchi_id: 7,
  kompaniyalar: [{ kompaniya_id: 1, rol: 'omborchi' }], permissionsByCompany: { 1: perms }, explicitDenialsByCompany: { 1: [] } } as unknown as Sess);
const OMBORCHI = mk(['warehouse.write', 'warehouse.read']);
const OQUVCHI = mk(['warehouse.read']);
const post = (body: unknown, sess: Sess = OMBORCHI) => onRequestPost({
  request: new Request('https://smeta.example/api/ombor-buyruq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  env, data: { roleAuthority: structuredClone(sess) },
} as never);

type Ch = { nom: string; body: Record<string, unknown> };
let ch: Ch[]; let harakat: unknown[]; let lugatQator: unknown[]; let kontragentQator: unknown[]; let qoldiq: unknown[];
const harakatQ = (nomi: string, birligi: string, o: Record<string, unknown> = {}) => ({ id: Math.floor(Math.random() * 1e6), nomi, birligi, sana: '2026-11-12', operatsiya: 'prixod', obyomi: 5, postavshik: null, qabul_qiluvchi: null, narx: null, ...o });
beforeEach(() => {
  ch = []; harakat = []; lugatQator = []; kontragentQator = []; qoldiq = [];
  ai.aiHisobli.mockReset(); taklifKeshTozala(1, 9);
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url); const nom = /\/rpc\/([a-z0-9_]+)/.exec(u)?.[1];
    if (nom) {
      ch.push({ nom, body: JSON.parse(String(init?.body ?? '{}')) });
      if (nom === 't2_ombor_qoldiq_v2') return Response.json({ ok: true, jami: qoldiq.length, qatorlar: qoldiq });
      if (nom === 't2_audit_yoz') return Response.json(null);
      if (nom === 't2_ombor_lugat_royxat_v1') return Response.json({ ok: true, qatorlar: lugatQator });
      return Response.json({ ok: true, takror: false, harakat_id: 55, id: 3, son: 1 });
    }
    if (u.includes('/rest/v1/t2_ombor_lugat?')) return Response.json(lugatQator);
    if (u.includes('/rest/v1/t2_kontragent?')) return Response.json(kontragentQator);
    if (u.includes('/rest/v1/t2_sklad_harakat')) return Response.json(harakat);
    return Response.json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); taklifKeshTozala(1, 9); });
const yozuvlar = () => ch.filter((c) => /^t2_ombor_(prixod|chiqim|tuzat|alias)/.test(c.nom));
const lugatYozuvlar = () => ch.filter((c) => c.nom === 't2_ombor_lugat_yoz_v1');
const B = { kompaniya_id: 1, sklad_id: 9 };
type J = { holat: string; kod?: string; savol?: string; variantlar?: { yorliq: string; tanlov: Record<string, unknown> }[]; token?: string; preview?: Record<string, unknown> };
const tahlil = async (matn: string, tanlov?: Record<string, unknown>): Promise<J> => (await post({ amal: 'tahlil', ...B, matn, ...(tanlov ? { tanlov } : {}) })).json() as Promise<J>;

it('egasi iborasi: material M200≡B15 va yetkazuvchi lug\'atdan avtomatik topiladi; narx faqat tarixdan; HECH NARSA yozilmaydi', async () => {
  harakat = [harakatQ('Beton M200 (B15)', 'm3', { postavshik: 'Hamkor Qurilish MChJ', narx: 650000 }), harakatQ('Beton M300', 'm3')];
  const j = await tahlil('10 m3 beton В15 keldi Hamkor Qurilishdan');
  expect(j.holat).toBe('tasdiq_kerak');
  expect(j.preview).toMatchObject({ nomi: 'Beton M200 (B15)', birligi: 'm3', miqdor: 10, kontragent: 'Hamkor Qurilish MChJ', yangi_element: false, yangi_kontragent: false, narx: null, narx_taklif: { narx: 650000, sana: '2026-11-12' } });
  expect(yozuvlar().length).toBe(0); expect(lugatYozuvlar().length).toBe(0);
});

it('noaniq material: 3–5 variant + «Yangi» tugmasi; tanlovdan keyin preview; tasdiqdan keyin sinonim o\'rganiladi', async () => {
  harakat = [harakatQ('Beton M200 (B15)', 'm3', { narx: 650000 }), harakatQ('Beton M300', 'm3')];
  const s = await tahlil('10 m3 beton keldi');
  expect(s.holat).toBe('savol'); expect(s.kod).toBe('material');
  expect(s.variantlar!.map((v) => v.yorliq)).toEqual(expect.arrayContaining(['Beton M200 (B15) — m3, oxirgi kirim 12.11']));
  expect(s.variantlar!.at(-1)).toMatchObject({ tanlov: { nomi: 'beton', yangi: true } });
  expect(yozuvlar().length).toBe(0);
  const tn = s.variantlar!.find((v) => String(v.tanlov.nomi).includes('M200'))!.tanlov;
  const p = await tahlil('10 m3 beton keldi', tn);
  expect(p.holat).toBe('tasdiq_kerak'); expect(p.preview).toMatchObject({ nomi: 'Beton M200 (B15)', yangi_element: false });
  expect(yozuvlar().length).toBe(0);
  const t = await post({ amal: 'tasdiq', ...B, token: p.token });
  expect(t.status).toBe(200);
  expect(yozuvlar().length).toBe(1);
  expect(lugatYozuvlar().length).toBe(1);
  expect(lugatYozuvlar()[0].body).toMatchObject({ p_amal: 'oyrat', p_actor_id: 7, p_yuk: { tur: 'material', ibora: 'beton', kanonik: 'Beton M200 (B15)', ibora_kalit: lugatKalit('beton') } });
});

it('yangi element: lug\'atda yo\'q → yangi_element bayrog\'i; yangi nom faqat tasdiqdan keyin (sinonim yozilmaydi)', async () => {
  harakat = [harakatQ('Beton M200 (B15)', 'm3')];
  const j = await tahlil('4 dona lampa LED keldi');
  expect(j.holat).toBe('tasdiq_kerak'); expect(j.preview).toMatchObject({ yangi_element: true, nomi: expect.stringMatching(/lampa/i) });
  expect(yozuvlar().length).toBe(0);
  await post({ amal: 'tasdiq', ...B, token: j.token });
  expect(yozuvlar().length).toBe(1); expect(lugatYozuvlar().length).toBe(0);
});

it('«Yangi» tugmasi: noaniq so\'zga yangi element sifatida davom etadi', async () => {
  harakat = [harakatQ('Beton M200 (B15)', 'm3'), harakatQ('Beton M300', 'm3')];
  const p = await tahlil('10 m3 beton keldi', { nomi: 'beton', yangi: true });
  expect(p.holat).toBe('tasdiq_kerak'); expect(p.preview).toMatchObject({ yangi_element: true });
  await post({ amal: 'tasdiq', ...B, token: p.token });
  expect(lugatYozuvlar().length).toBe(0);
});

it('kompaniya sinonimi (oldin tasdiqlangan) darhol hal qiladi — savolsiz', async () => {
  harakat = [harakatQ('Beton M200 (B15)', 'm3'), harakatQ('Beton M300', 'm3')];
  lugatQator = [{ id: 1, tur: 'material', ibora_kalit: lugatKalit('beton'), kanonik: 'Beton M200 (B15)', birlik: 'm3' }];
  const j = await tahlil('10 m3 beton keldi');
  expect(j.holat).toBe('tasdiq_kerak'); expect(j.preview).toMatchObject({ nomi: 'Beton M200 (B15)', yangi_element: false });
});

it('yetkazuvchi: bir nechta yaqin → savol (variantlar + Yangi); kontragentlar ro\'yxati ham manba', async () => {
  harakat = [harakatQ('Beton M200 (B15)', 'm3')];
  kontragentQator = [{ nom: 'Hamkor Qurilish MChJ' }, { nom: 'Hamkor Servis' }];
  const s = await tahlil('10 m3 beton М200 keldi Hamkordan');
  expect(s.holat).toBe('savol'); expect(s.kod).toBe('kontragent');
  expect(s.variantlar!.map((v) => v.tanlov.kontragent)).toEqual(expect.arrayContaining(['Hamkor Qurilish MChJ', 'Hamkor Servis']));
  expect(s.variantlar!.at(-1)!.tanlov).toMatchObject({ kontragent_yangi: true });
  const p = await tahlil('10 m3 beton М200 keldi Hamkordan', { kontragent: 'Hamkor Servis' });
  expect(p.holat).toBe('tasdiq_kerak'); expect(p.preview).toMatchObject({ kontragent: 'Hamkor Servis', yangi_kontragent: false });
  await post({ amal: 'tasdiq', ...B, token: p.token });
  expect(lugatYozuvlar()[0].body).toMatchObject({ p_yuk: { tur: 'kontragent', ibora: 'Hamkor', kanonik: 'Hamkor Servis' } });
});

it('yangi yetkazuvchi: bayroq bor, tasdiqgacha yozilmaydi', async () => {
  harakat = [harakatQ('Beton M200 (B15)', 'm3', { postavshik: 'Boshqa Firma' })];
  const j = await tahlil('10 m3 beton М200 keldi Namuna Savdodan');
  expect(j.holat).toBe('tasdiq_kerak'); expect(j.preview).toMatchObject({ yangi_kontragent: true, yangi_element: true });
  expect(yozuvlar().length).toBe(0);
});

it('lug\'at amallari: o\'qish; tahrir faqat yozish ruxsati bilan, aktor sessiyadan', async () => {
  expect((await post({ amal: 'lugat_royxat', ...B }, OQUVCHI)).status).toBe(200);
  expect((await post({ amal: 'lugat_tahrir', ...B, lugat_amal: 'ochir', yuk: { id: 3 } }, OQUVCHI)).status).toBe(403);
  expect(lugatYozuvlar().length).toBe(0);
  const r = await post({ amal: 'lugat_tahrir', ...B, p_actor_id: 999, lugat_amal: 'qosh', yuk: { tur: 'material', ibora: 'Betonchik', kanonik: 'Beton M200 (B15)' } });
  expect(r.status).toBe(200);
  expect(lugatYozuvlar()[0].body).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 1, p_amal: 'qosh', p_yuk: { ibora_kalit: lugatKalit('Betonchik'), kanonik: 'Beton M200 (B15)' } });
  expect((await post({ amal: 'lugat_tahrir', ...B, lugat_amal: 'xxx' })).status).toBe(400);
});
