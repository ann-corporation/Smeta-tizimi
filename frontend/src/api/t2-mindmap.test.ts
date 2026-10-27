import { afterEach, describe, expect, it, vi } from 'vitest';
import { grafOdamsiz, sbMindmapGrafOl, sbMindmapMasul, v4YoqmiXato, type MindmapGraf } from './t2-mindmap';

afterEach(() => vi.unstubAllGlobals());

const v1 = { tugunlar: [{ id: 'kompaniya:1', tur: 'kompaniya', nom: 'K', meta: null, x: null, y: null }], bogichlar: [] };
const v4 = { ...v1, tugunlar: [...v1.tugunlar, { id: 'foydalanuvchi:3', tur: 'foydalanuvchi', nom: 'Ali', meta: { rol: 'pto' }, x: null, y: null }], korinish: { toliq: false, pul: false, rol: 'pto' } };

function stub(javoblar: Record<string, unknown>) {
  const sorovlar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    const soro = JSON.parse(String(init?.body)).soro as string;
    sorovlar.push(soro);
    return Response.json(javoblar[soro]);
  }));
  return sorovlar;
}

describe('sbMindmapGrafOl: v4 → v1 zaxira', () => {
  it('v4 bor — v4 grafi (korinish bilan) qaytadi, v1 chaqirilmaydi', async () => {
    const s = stub({ mindmap_grafi_v4: { ok: true, natija: v4 } });
    const r = await sbMindmapGrafOl(1);
    expect(r.ok && r.graf.korinish).toEqual({ toliq: false, pul: false, rol: 'pto' });
    expect(s).toEqual(['mindmap_grafi_v4']);
  });
  it('v4 RPC yo‘q (404) — v1 ga tushadi, ilova ishlayveradi', async () => {
    const s = stub({ mindmap_grafi_v4: { ok: false, error: "So'rov bajarilmadi (404)" }, mindmap_grafi: { ok: true, natija: v1 } });
    const r = await sbMindmapGrafOl(1);
    expect(r.ok && r.graf.tugunlar).toHaveLength(1);
    expect(r.ok && r.graf.korinish).toBeUndefined();
    expect(s).toEqual(['mindmap_grafi_v4', 'mindmap_grafi']);
  });
  it('eski worker («ochiq emas») — v1 ga tushadi', async () => {
    stub({ mindmap_grafi_v4: { ok: false, error: "So'rov ochiq emas: mindmap_grafi_v4" }, mindmap_grafi: { ok: true, natija: v1 } });
    expect((await sbMindmapGrafOl(1)).ok).toBe(true);
  });
  it('ruxsat/boshqa xatoda v1 ga TUSHMAYDI (butun grafni sizdirmaslik uchun)', async () => {
    const s = stub({ mindmap_grafi_v4: { ok: false, error: "So'rov bajarilmadi (403)" }, mindmap_grafi: { ok: true, natija: v1 } });
    const r = await sbMindmapGrafOl(1);
    expect(r.ok).toBe(false);
    expect(s).toEqual(['mindmap_grafi_v4']);
  });
  it('drilldown v2 ni chaqiradi (v4 emas)', async () => {
    const s = stub({ mindmap_grafi_v2: { ok: true, natija: v1 } });
    await sbMindmapGrafOl(1, { mode: 'taminot', obyektId: 5 });
    expect(s).toEqual(['mindmap_grafi_v2']);
  });
  it('v4YoqmiXato', () => {
    expect(v4YoqmiXato("So'rov bajarilmadi (404)")).toBe(true);
    expect(v4YoqmiXato("So'rov bajarilmadi (500)")).toBe(false);
    expect(v4YoqmiXato(undefined)).toBe(false);
  });
});

describe('grafOdamsiz', () => {
  it('odam tugunlari va chiziqlarini olib tashlaydi (eski kanvas uchun)', () => {
    const g = { ...v4, bogichlar: [{ manba: 'kompaniya:1', maqsad: 'foydalanuvchi:3', tur: 'azo_kompaniya', uzsa_boladi: false }] } as unknown as MindmapGraf;
    const o = grafOdamsiz(g);
    expect(o.tugunlar.map((t) => t.id)).toEqual(['kompaniya:1']);
    expect(o.bogichlar).toEqual([]);
    expect(grafOdamsiz(v1 as unknown as MindmapGraf)).toBe(v1);
  });
});

describe('sbMindmapMasul', () => {
  it('operation_id bilan mindmap_masul yuboradi; ruxsat:null — olib tashlash', async () => {
    const yuklar: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => { yuklar.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }));
    const r = await sbMindmapMasul(17, { obyektId: 5, foydalanuvchiId: 33, ruxsat: null });
    expect(r.ok).toBe(true);
    expect(yuklar[0]).toMatchObject({ amal: 'mindmap_masul', kompaniya_id: 17, obyekt_id: 5, loyiha_id: null, foydalanuvchi_id: 33, ruxsat: null });
    expect(String(yuklar[0].operation_id)).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('server kodini tushunarli xabarga o‘giradi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, code: 'TARGET_NOT_MEMBER' }), { status: 200 })));
    const r = await sbMindmapMasul(17, { loyihaId: 3, foydalanuvchiId: 33, ruxsat: 'read' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/a’zosi emas/);
  });
});
