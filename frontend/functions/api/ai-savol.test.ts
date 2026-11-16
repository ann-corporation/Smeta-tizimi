import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
const ai = vi.hoisted(() => vi.fn());
vi.mock('../_shared/auth', () => ({ tekshir: auth }));
vi.mock('../_shared/agent-hisob', async (load) => ({
  ...(await load<typeof import('../_shared/agent-hisob')>()), aiHisobli: ai,
}));
import { ByudjetXatosi } from '../_shared/agent-hisob';
import { kontekstKeshTozala } from '../_shared/agent-kontekst-kesh';
import { objectTotalIntent } from '../_shared/jarvis/object-finance';
import { f2RegisterIntent } from '../_shared/jarvis/f2-register';
import { warehouseIntent } from '../_shared/jarvis/warehouse';
import { discrepancyIntent } from '../_shared/jarvis/discrepancies';
import { onRequestPost } from './ai-savol';

const object = { id: 34, nom: 'Sinov Bino' };
let categories: string[];
let finance: () => Response;
let register: () => Response;
let stock: () => Response;
let men: () => Response;
let discrepancies: () => Response;
const rpc = vi.fn(async (input: string, _init?: RequestInit) => {
  switch (input.split('/').at(-1)) {
    case 't2_agent_kasb_v1': return Response.json({ ok: true, nom: 'Sinov', rol: 'pto', profil: 'company_access', vazifa: 'Sinov', boshqalar: [], namuna_savollar: [], kategoriyalar: categories });
    case 't2_agent_fakt_v1': return Response.json({ ok: true, fakt: { obyektlar: [object] }, ishlatilgan: categories });
    case 't2_obyekt_nakrutka_v1': return Response.json({ ok: true, nk_manba: 'smeta_podvali', nakrutka: { pryamye: 100, itogo4: 125, vsego: 140 } });
    case 't2_object_financials_v1': return finance();
    case 't2_akt_reestr_obyekt_v1': return register();
    case 't2_sklad_markaziy_qoldiq_v1': return stock();
    case 't2_men_v1': return men();
    case 't2_aosr_slichitelniy_v1': return discrepancies();
    case 't2_agent_muhit_v1': return Response.json({ ok: true, qoidalar: [], xotira: [], manbalar: [] });
    default: return Response.json({ ok: true });
  }
});
const run = (savol: string, kompaniya_id = 17, extra = {}, env = {}) => onRequestPost({
  request: new Request('https://unit.test/api/ai-savol', { method: 'POST', body: JSON.stringify({ savol, kompaniya_id, ...extra }) }),
  env: { SESSIYA_KALIT: 'test', SUPABASE_URL: 'https://unit.supabase.co', SUPABASE_KEY: 'test', ...env },
} as never);
const called = (name: string) => rpc.mock.calls.filter(([url]) => url.endsWith('/' + name));

beforeEach(() => {
  auth.mockResolvedValue({ foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17 }] });
  ai.mockReset(); rpc.mockClear(); kontekstKeshTozala();
  categories = ['obyektlar', 'smeta_pul'];
  men = () => Response.json({ ok: true, context_kompaniyalar: [
    { kompaniya_id: 17, permissions: ['warehouse.read'] },
  ] });
  stock = () => Response.json({ ok: true, qatorlar: [{ nomi: 'Sinov sement', birligi: 'kg', qoldiq: 87.375 }] });
  discrepancies = () => Response.json({
    ok: true, obyekt_id: 34, tayyorlik: { farqli: 6, ortiq: 6, kam: 0, tasdiqlagan: null }, yetishmaydi_jami: 2,
  });
  finance = () => Response.json({ ok: true, kompaniya_id: 17, basis: 'direct', objects: [{
    obyekt_id: 34, f2: { known: -102.75, unknown: 1, present: true }, fakt: { known: null, unknown: 2, present: true },
  }] });
  const base = { obyekt_id: 34, kompaniya_id: 17, tur: 'f2', oy: '2026-06-01' };
  register = () => Response.json({ ok: true, qatorlar: [
    { ...base, id: 51, raqam: 'S-1', holat: 'tasdiqlangan', lifecycle_status: 'approved' },
    { ...base, id: 52, raqam: 'S-2', holat: 'qoralama', lifecycle_status: 'submitted' },
    { ...base, id: 53, raqam: 'S-3', holat: 'bekor', lifecycle_status: 'draft' },
  ] });
  vi.stubGlobal('fetch', rpc);
});
afterEach(() => vi.unstubAllGlobals());

function permitComparison() {
  men = () => Response.json({ ok: true, context_kompaniyalar: [
    { kompaniya_id: 17, permissions: ['fakt.read', 'document.read'] },
  ] });
}

it.each(['Smeta va fakt farqi', 'Сравни смету и факт', 'Смета ва факт фарқи'])(
  'reads comparison and AOSR readiness without fabricating a missing count: %s', async question => {
    permitComparison();
    const body = await (await run(question, 17, { obyekt_id: 34 })).json();
    expect(body).toMatchObject({
      javob: expect.stringMatching(/farq qilgan ishlar: 6[\s\S]*hajmi kam: 0[\s\S]*asosi tasdiqlangan: noma’lum[\s\S]*asos yetishmaydi: 2/),
      dalil: { tur: 'smeta-fakt-solishtiruv', id: 34, rpc: 't2_aosr_slichitelniy_v1', yol: '/admin/fakt?obyekt=34' },
    });
    expect(JSON.parse(String(called('t2_aosr_slichitelniy_v1')[0][1]?.body))).toEqual({
      p_actor_id: 7, p_kompaniya_id: 17, p_obyekt_id: 34, p_limit: 1,
    });
    expect(ai).not.toHaveBeenCalled();
  },
);

it('comparison refuses missing permission and rejects results with a mismatched object', async () => {
  expect(await (await run('Sinov Bino slichitelniy')).json()).toMatchObject({ rad: true });
  expect(called('t2_aosr_slichitelniy_v1')).toHaveLength(0);
  permitComparison(); kontekstKeshTozala();
  discrepancies = () => Response.json({ ok: true, obyekt_id: 99, tayyorlik: { farqli: 787 } });
  const body = await (await run('Sinov Bino slichitelniy')).json();
  expect(body).not.toHaveProperty('dalil');
  expect(body).toMatchObject({ javob: expect.not.stringContaining('787') });
  expect(ai).not.toHaveBeenCalled();
});

it('comparison avoids all-time aggregate for period, amount and write requests', () => {
  for (const question of ['Shu oy slichitelniy', 'Slichitelniy summasi', 'Slichitelniy F2 qoralama yarat']) {
    expect(discrepancyIntent(question)).toBe(false);
  }
});

it.each(['Ombor #7 qoldig‘i: sement', 'Остатки склада №7: sement', 'Омбор №7 қолдиғи: sement'])(
  'reads current central warehouse stock from the scoped warehouse reader: %s', async question => {
    expect(await (await run(question, 17, { actor: 99 })).json()).toMatchObject({
      provider: 'local', javob: expect.stringMatching(/Sinov sement.*87,375 kg/),
      dalil: { tur: 'ombor', id: 7, rpc: 't2_sklad_markaziy_qoldiq_v1', yol: '/admin/logistika' },
    });
    expect(JSON.parse(String(called('t2_sklad_markaziy_qoldiq_v1')[0][1]?.body))).toEqual({
      p_actor_id: 7, p_kompaniya_id: 17, p_sklad_id: 7, p_qidir: 'sement', p_limit: 9,
    });
    expect(ai).not.toHaveBeenCalled();
  },
);

it('warehouse permission is scoped to the active company and respects explicit denial', async () => {
  men = () => Response.json({ ok: true, context_kompaniyalar: [
    { kompaniya_id: 17, permissions: ['warehouse.read'], explicit_denials: ['warehouse.read'] },
    { kompaniya_id: 99, permissions: ['warehouse.read'] },
  ] });
  expect(await (await run('Ombor #7 qoldig‘i')).json()).toMatchObject({ rad: true });
  expect(called('t2_sklad_markaziy_qoldiq_v1')).toHaveLength(0);
  expect(ai).not.toHaveBeenCalled();
});

it('unavailable warehouse and empty result are distinct and never manufacture zero', async () => {
  stock = () => Response.json({ ok: false, code: 'WAREHOUSE_SCOPE_MISMATCH' });
  const denied = await (await run('Ombor #7 qoldig‘i')).json();
  expect(denied).toMatchObject({ rad: true });
  expect(denied).not.toHaveProperty('dalil');
  stock = () => Response.json({ ok: true, qatorlar: [] });
  expect(await (await run('Ombor #7 qoldig‘i: sement')).json()).toMatchObject({
    javob: expect.stringContaining('musbat qoldiq topilmadi'),
  });
  expect(ai).not.toHaveBeenCalled();
});

it('warehouse intent asks for a warehouse ID and bypasses write or object balance requests', async () => {
  expect(await (await run('Markaziy ombor qoldig‘i qancha?')).json()).toMatchObject({ javob: expect.stringContaining('Ombor raqamini yozing') });
  expect(called('t2_sklad_markaziy_qoldiq_v1')).toHaveLength(0);
  expect(warehouseIntent('Ombor #7 qoldig‘ini hisobdan chiqar')).toBeNull();
  expect(warehouseIntent('Obyekt omborining qoldig‘i')).toBeNull();
});

it('salom va help model yoki DB chaqirmaydi', async () => {
  for (const q of ['salom', 'nimalar qila olasan']) expect((await run(q)).status).toBe(200);
  expect(rpc).not.toHaveBeenCalled(); expect(ai).not.toHaveBeenCalled();
});
it('boshqa kompaniya model va DBga chiqmaydi', async () => {
  expect((await run('F2 qancha', 99)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled(); expect(ai).not.toHaveBeenCalled();
});
it('QQS follow-up umumiy yadroda tarix orqali obyektni topadi', async () => {
  const r = await run('QQS bilan shu obyekt qancha?', 17, { tarix: [{ rol: 'user', matn: 'Sinov Bino haqida' }], actor: 300 });
  expect(await r.json()).toMatchObject({ ok: true, provider: 'local', javob: expect.stringMatching(/Sinov Bino[\s\S]*QQS bilan[\s\S]*140/) });
  expect(JSON.parse(String(called('t2_obyekt_nakrutka_v1')[0][1]?.body))).toMatchObject({ p_actor_id: 7, p_obyekt_id: 34 });
  expect(ai).not.toHaveBeenCalled();
});
it('smeta_pul ruxsati bo‘lmasa moliya RPCsi va model chaqirilmaydi', async () => {
  categories = ['obyektlar'];
  const r = await run('Sinov Bino smeta summasi QQS bilan qancha?');
  expect(await r.json()).toMatchObject({ ok: true, rad: true });
  expect(called('t2_obyekt_nakrutka_v1')).toHaveLength(0);
  expect(ai).not.toHaveBeenCalled();
});
it('model taklifi eski chatdan yozilmaydi, chaqiruv hisobli', async () => {
  const worker = vi.fn();
  ai.mockResolvedValue({
    text: JSON.stringify({ javob: 'Sinov javob', harakatlar: [{ amal: 'test', parametrlar: {}, tushuntirish: 'sinov', aniq: true }] }),
    provider: 'openrouter', model: 'test',
  });
  const r = await run('Narxlar haqida tushuntir', 17, { mode: 'interactive' }, { AI: { run: worker } });
  expect(await r.json()).toMatchObject({ ok: true, provider: 'openrouter', harakatlar: [], requires_approval: false });
  expect(ai.mock.calls[0].slice(1, 5)).toEqual([7, 17, 'company_access', 'kasb_savol']);
  expect(called('t2_agent_harakat_taklif_v1')).toHaveLength(0);
  expect(called('t2_agent_jurnal_yoz_v1')).toHaveLength(0);
  expect(worker).not.toHaveBeenCalled();
});
it('limit ishlamasa legacy 402 kontrakti saqlanadi', async () => {
  ai.mockRejectedValue(new ByudjetXatosi('BYUDJET_YOQ', 'AI uchun oylik limit belgilanmagan'));
  const r = await run('Narxlar haqida tushuntir');
  expect(r.status).toBe(402);
  expect(await r.json()).toMatchObject({ ok: false, code: 'BYUDJET_YOQ', xabar: expect.stringContaining('oylik limit') });
});
it('sessiyasiz help ham yopiq', async () => {
  auth.mockResolvedValue(null);
  expect((await run('nimalar qila olasan')).status).toBe(401);
});

it.each(['Sinov Bino F2 jami qancha?', 'Итого по КС-2', 'Ф2 жами қанча?'])('canonical F2 with evidence: %s', async (savol) => {
  categories.push('f2_fakt_pul');
  const response = await run(savol, 17, { actor: 400, tarix: [{ rol: 'user', matn: 'Sinov Bino haqida' }] });
  expect(await response.json()).toMatchObject({
    provider: 'local', javob: expect.stringMatching(/Ma’lum qismi -102,75.*1 qatorning summasi noma’lum/),
    dalil: { tur: 'obyekt', id: 34, rpc: 't2_object_financials_v1', maydon: 'f2', yol: '/admin/f2-tarix?obyekt=34' },
  });
  expect(JSON.parse(String(called('t2_object_financials_v1')[0][1]?.body))).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_object_ids: [34] });
  expect(ai).not.toHaveBeenCalled();
});

it('fakt NULL remains unknown even when the object is selected', async () => {
  categories.push('f2_fakt_pul');
  const body = await (await run('Shu obyekt fakt summasi qancha?', 17, { obyekt_id: 34 })).json();
  expect(body).toMatchObject({ javob: expect.stringContaining('Summa noma’lum.'), dalil: { maydon: 'fakt' } });
  expect(ai).not.toHaveBeenCalled();
});

it('RPC permission denial cannot fall through to the model', async () => {
  categories.push('f2_fakt_pul');
  finance = () => Response.json({ code: '42501' }, { status: 403 });
  expect(await (await run('Sinov Bino F2 jami qancha?')).json()).toMatchObject({ rad: true, provider: 'local' });
  expect(ai).not.toHaveBeenCalled();
});

it('mismatched company from the finance reader returns no amount or evidence', async () => {
  categories.push('f2_fakt_pul');
  finance = () => Response.json({ ok: true, kompaniya_id: 99, basis: 'direct', objects: [{ obyekt_id: 34 }] });
  const body = await (await run('Sinov Bino F2 jami qancha?')).json();
  expect(body).not.toHaveProperty('dalil');
  expect(body).toMatchObject({ javob: expect.stringContaining('tizimdan olib bo‘lmadi') });
  expect(ai).not.toHaveBeenCalled();
});

it('unavailable object context cannot silently fall back to an older object', async () => {
  categories.push('f2_fakt_pul');
  const body = await (await run('F2 jami qancha?', 17, { obyekt_id: 99, tarix: [{ rol: 'user', matn: 'Sinov Bino haqida' }] })).json();
  expect(body).not.toHaveProperty('dalil');
  expect(called('t2_object_financials_v1')).toHaveLength(0);
  expect(ai).not.toHaveBeenCalled();
});

it.each(['Shu oy F2 jami qancha?', 'Сумма по КС-2 за ноябрь', 'F2 jami summasini yoz', 'Сумма по акту КС-2 № 7', 'Fakt hajmi va summa'])(
  'scoped or non-read request does not become an all-time total: %s', (savol) => {
    expect(objectTotalIntent(savol)).toBeNull();
  },
);

it('F2 status is read from the same object register, without requiring access to financial totals', async () => {
  const body = await (await run('Статус КС-2 № S-2', 17, { obyekt_id: 34, actor: 400 })).json();
  expect(body).toMatchObject({
    provider: 'local', javob: expect.stringContaining('№ S-2 · 2026-06 · Yuborilgan'),
    dalil: { tur: 'f2-reestr', id: 34, akt_ids: [52], yol: '/admin/f2-tarix?obyekt=34' },
  });
  expect(JSON.parse(String(called('t2_akt_reestr_obyekt_v1')[0][1]?.body))).toEqual({ p_actor_id: 7, p_obyekt_id: 34, p_tur: 'f2' });
  expect(ai).not.toHaveBeenCalled();
});

it('F2 listing excludes archived drafts and can filter a period and status', async () => {
  const list = await (await run('Ф2 рўйхати', 17, { obyekt_id: 34 })).json();
  expect(list).toMatchObject({ dalil: { akt_ids: [51, 52] } });
  const filtered = await (await run('Sinov Bino 2026-06 tasdiqlangan F2 ro‘yxati')).json();
  expect(filtered).toMatchObject({ dalil: { akt_ids: [51] } });
  expect(ai).not.toHaveBeenCalled();
});

it('current object is verified by ID when it falls outside the company snapshot', async () => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (url, init) => {
    if (url.endsWith('/t2_agent_fakt_v1') && JSON.parse(String(init?.body)).p_obyekt_id === null) {
      return Response.json({ ok: true, fakt: { obyektlar: [] } });
    }
    return original(url, init);
  });
  try {
    expect(await (await run('F2 ro‘yxati', 17, { obyekt_id: 34 })).json())
      .toMatchObject({ dalil: { id: 34, akt_ids: [51, 52] } });
    const asks = called('t2_agent_fakt_v1').map(([, init]) => JSON.parse(String(init?.body)).p_obyekt_id);
    expect(asks).toEqual([null, 34]);
  } finally {
    rpc.mockImplementation(original);
  }
});

it('F2 register rejects a mixed-company payload and never falls back to LLM', async () => {
  register = () => Response.json({ ok: true, qatorlar: [{ id: 70, obyekt_id: 34, kompaniya_id: 99, tur: 'f2', raqam: 'Private', oy: '2026-06-01', holat: 'tasdiqlangan' }] });
  const bad = await (await run('Sinov Bino F2 reestri')).json();
  expect(bad).not.toHaveProperty('dalil');
  expect(bad).toMatchObject({ javob: expect.not.stringContaining('Private') });
  register = () => Response.json({ code: '42501' }, { status: 403 });
  expect(await (await run('Sinov Bino F2 reestri')).json()).toMatchObject({ rad: true });
  expect(ai).not.toHaveBeenCalled();
});

it('an ambiguous month is clarified and write or amount intents do not enter the register reader', async () => {
  const body = await (await run('Shu oy F2 ro‘yxati', 17, { obyekt_id: 34 })).json();
  expect(body).toMatchObject({ javob: expect.stringContaining('YYYY-MM') });
  expect(called('t2_akt_reestr_obyekt_v1')).toHaveLength(0);
  expect(f2RegisterIntent('F2 № S-2 ni tasdiqla')).toBeNull();
  expect(f2RegisterIntent('F2 reestri summasi qancha')).toBeNull();
});
