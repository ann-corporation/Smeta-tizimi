// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sess } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestPost } from './f2-buyruq';

// Faqat sintetik ma'lumot. Transport vositalari: preview (RPC p_yoz:false / REST holat) -> token -> tasdiq (yozish).
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-service', SESSIYA_KALIT: 'k'.repeat(32) };
const mk = (perms: string[]): Sess => ({ rol: 'pto', exp: Date.now() + 600000, jti: 'synthetic', foydalanuvchi_id: 7,
  kompaniyalar: [{ kompaniya_id: 1, rol: 'pto' }], permissionsByCompany: { 1: perms }, explicitDenialsByCompany: { 1: [] } } as unknown as Sess);
const TOLIQ = mk(['smeta.read', 'smeta.write']);
const FAQAT_OQISH = mk(['smeta.read']);
const post = (body: unknown, sess: Sess = TOLIQ) => onRequestPost({
  request: new Request('https://smeta.example/api/f2-buyruq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kompaniya_id: 1, ...(body as object) }) }),
  env, data: { roleAuthority: structuredClone(sess) },
} as never);

type Chaqiruv = { nom: string; body: Record<string, any> };
let ch: Chaqiruv[]; let yoyBody: Record<string, unknown>; let yozBody: Record<string, unknown>; let satrlar: Array<Record<string, unknown>>;
const GURUH = { material: 'Sintetik shag‘al', zichlik: 1.5, km: 20, miqdor: 10, hisob_tkm: 300, kodlar: ['12303'] };
const TAQSIMLA = { amal: 'vosita', nom: 'transport_taqsimla', args: { obyekt_id: 5, rz_id: 9, tkm_narx: 100, qatorlar: [GURUH] } };
const BELGILA = { amal: 'vosita', nom: 'transport_belgila', args: { obyekt_id: 5, qator_idlar: [3, 4], usul: 'tkm' } };
const TOP = (yoz: boolean) => (yoz ? yozBody : yoyBody);

beforeEach(() => {
  ch = [];
  yoyBody = { ok: true, yozildi: false, bloklangan: false, yaratildi: 0, guruhlar: [{ material: 'Sintetik', holat: 'tayyor', topilgan_soni: 2, miqdor_tizim: 10, miqdor_hisob: 10, tkm_tizim: 300, tkm_hisob: 300, farq_som: 0 }] };
  yozBody = { ok: true, yozildi: true, bloklangan: false, yaratildi: 2, guruhlar: [] };
  satrlar = [{ id: 3, kod: 'M3', nom: 'Sintetik 3', kat: 'МАТ', tur: 'mat', transport_usul: null, transport_manba_qator_id: null }, { id: 4, kod: 'M4', nom: 'Sintetik 4', kat: 'МАТ', tur: 'mat', transport_usul: 'narx_ichida', transport_manba_qator_id: null }];
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url); const nom = /\/rpc\/([a-z0-9_]+)/.exec(u)?.[1];
    if (nom) {
      const body = JSON.parse(String(init?.body ?? '{}')); ch.push({ nom, body });
      if (nom === 't2_qator_transport_yoy_v1') return Response.json(TOP(body.p_yoz === true));
      if (nom === 't2_qator_transport_belgila_v1') return Response.json({ ok: true, usul: body.p_usul, ozgardi: 2, qator_soni: body.p_qator_idlar.length });
      if (nom === 't2_qator_transport_audit_v1') return Response.json({ ok: true, obyekt_id: 5, xulosa: { xato_soni: 1, foiz: 4 }, xatolar: [{ kod: 'TKM_TRANSPORT_YOQ', qator_id: 3, xabar: 'x' }], materiallar: [] });
      if (nom === 't2_audit_yoz') return Response.json(null);
      return Response.json({ ok: true });
    }
    if (u.includes('/rest/v1/t2_obyekt?')) return Response.json(u.includes('kompaniya_id=eq.1') && u.includes('id=eq.5') ? [{ id: 5, nom: 'Sintetik obyekt' }] : []);
    if (u.includes('/rest/v1/t2_qator?')) return Response.json(satrlar);
    return Response.json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });
const yozuvRpc = () => ch.filter((c) => c.nom.includes('transport') && (c.body.p_yoz === true || c.nom.includes('belgila')));

it('transport_tekshir (o‘qish): smeta.read yetadi, audit natijasi toza=false bilan qaytadi', async () => {
  const r = await post({ amal: 'vosita', nom: 'transport_tekshir', args: { obyekt_id: 5 } }, FAQAT_OQISH);
  const j = await r.json() as Record<string, any>;
  expect(r.status).toBe(200);
  expect(j).toMatchObject({ ok: true, toza: false, xulosa: { xato_soni: 1 } });
  expect(ch[0]).toEqual({ nom: 't2_qator_transport_audit_v1', body: { p_actor_id: 7, p_obyekt_id: 5 } });
});

it('transport_taqsimla preview: HECH NARSA yozilmaydi (p_yoz=false), token qaytadi, matnli korinish bor', async () => {
  const r = await post(TAQSIMLA);
  const j = await r.json() as Record<string, any>;
  expect(r.status).toBe(200);
  expect(j).toMatchObject({ ok: true, holat: 'tasdiq_kerak', vosita: 'transport_taqsimla', server_tekshiruv: true });
  expect(typeof j.token).toBe('string');
  expect(j.korinish).toContain('Tayyor');
  expect(yozuvRpc()).toHaveLength(0);
  expect(ch.find((c) => c.nom === 't2_qator_transport_yoy_v1')!.body).toMatchObject({ p_yoz: false, p_actor_id: 7 });
});

it('smeta.write bo‘lmasa yozuvchi transport vositasi 403 (RPC chaqirilmaydi)', async () => {
  expect((await post(TAQSIMLA, FAQAT_OQISH)).status).toBe(403);
  expect((await post(BELGILA, FAQAT_OQISH)).status).toBe(403);
  expect(ch.length).toBe(0);
});

it('bloklangan guruh majburiysiz — preview «rad», token berilmaydi; majburiy:true bilan token beriladi', async () => {
  yoyBody = { ...yoyBody, bloklangan: true, guruhlar: [{ material: 'Sintetik', holat: 'chetlanish', topilgan_soni: 1, farq_som: 50 }] };
  const a = await (await post(TAQSIMLA)).json() as Record<string, any>;
  expect(a).toMatchObject({ ok: true, holat: 'rad' });
  expect(a.token).toBeUndefined();
  const b = await (await post({ ...TAQSIMLA, args: { ...TAQSIMLA.args, majburiy: true } })).json() as Record<string, any>;
  expect(b).toMatchObject({ holat: 'tasdiq_kerak' });
  expect(typeof b.token).toBe('string');
});

it('tasdiq: faqat tokendan keyin yoziladi (p_yoz=true), majburiy tokendagi qiymat bilan; qayta preview xeshi mos bo‘lishi shart', async () => {
  yoyBody = { ...yoyBody, bloklangan: true, guruhlar: [{ material: 'Sintetik', holat: 'chetlanish', topilgan_soni: 1, farq_som: 50 }] };
  const { token } = await (await post({ ...TAQSIMLA, args: { ...TAQSIMLA.args, majburiy: true } })).json() as { token: string };
  expect(yozuvRpc()).toHaveLength(0);
  const r = await post({ amal: 'tasdiq', token, tasdiqlayman: true });
  const j = await r.json() as Record<string, any>;
  expect(r.status).toBe(200);
  expect(j).toMatchObject({ ok: true, holat: 'yozildi', yozildi: 1, sarflandi: 0 });
  expect(yozuvRpc()).toHaveLength(1);
  expect(yozuvRpc()[0].body).toMatchObject({ p_yoz: true, p_majburiy: true, p_actor_id: 7 });
});

it('tasdiq: preview dan keyin ma‘lumot o‘zgarsa 409 va hech narsa yozilmaydi', async () => {
  const { token } = await (await post(TAQSIMLA)).json() as { token: string };
  yoyBody = { ...yoyBody, guruhlar: [{ material: 'Sintetik', holat: 'tayyor', topilgan_soni: 5, tkm_tizim: 999 }] };
  const r = await post({ amal: 'tasdiq', token, tasdiqlayman: true });
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ code: 'MALUMOT_OZGARGAN' });
  expect(yozuvRpc()).toHaveLength(0);
});

it('tasdiq: tasdiqlayman:true bo‘lmasa rad; bloklangan va majburiysiz RPC rad etsa yozilmadi', async () => {
  const { token } = await (await post(TAQSIMLA)).json() as { token: string };
  expect((await post({ amal: 'tasdiq', token })).status).toBe(400);
  yozBody = { ok: false, code: 'TASDIQ_KERAK', bloklangan: true, yozildi: false, guruhlar: [] };
  const r = await post({ amal: 'tasdiq', token, tasdiqlayman: true });
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ ok: false, code: 'TASDIQ_KERAK', yozildi: 0 });
});

it('transport_belgila: preview oldin→keyin ko‘rsatadi va yozmaydi; tasdiq RPC ni aktor bilan chaqiradi', async () => {
  const p = await (await post(BELGILA)).json() as Record<string, any>;
  expect(p).toMatchObject({ ok: true, holat: 'tasdiq_kerak' });
  expect(p.korinish).toContain('foiz → tkm');
  expect(p.korinish).toContain('narx_ichida → tkm');
  expect(p.ogohlantirish.join(' ')).toContain('t·km qatori');
  expect(yozuvRpc()).toHaveLength(0);
  const r = await post({ amal: 'tasdiq', token: p.token, tasdiqlayman: true });
  expect(r.status).toBe(200);
  expect(yozuvRpc()[0]).toEqual({ nom: 't2_qator_transport_belgila_v1', body: { p_actor_id: 7, p_obyekt_id: 5, p_qator_idlar: [3, 4], p_usul: 'tkm' } });
});

it('transport_belgila: faol material bo‘lmagan (yoki t·km) qator rad etiladi', async () => {
  satrlar = [satrlar[0]]; // 4-qator topilmadi
  const r = await post(BELGILA);
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({ code: 'QATOR_YARAMAYDI' });
  satrlar = [{ ...satrlar[0], transport_manba_qator_id: 9 }, { ...satrlar[0], id: 4 }];
  expect((await post(BELGILA)).status).toBe(422);
});
