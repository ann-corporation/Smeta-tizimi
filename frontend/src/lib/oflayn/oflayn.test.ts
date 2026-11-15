import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from './sha256';
import { koprigaUlan, SAYT_ORIGIN } from './kopri';
import { keshKaliti, oflaynFetch } from './fetch';
import { FaktNavbat } from './navbat';
import { oflaynKorinish, oflaynTozalaTest, oflaynYangila } from './holat';
import { bannerMatni, bannerQoy, vaqtMatni } from './banner';
import { oflaynBoshlash } from './index';
import { oflaynUchunTayyorla } from './tayyorla';
import { OP1, OP2, OP3, soxtaKopri } from './test-yordam';

const ORIGIN = 'https://smeta-tizimi.pages.dev';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const sb = (body: object) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const kut = () => new Promise((r) => setTimeout(r, 0));
const tarmoqXato = () => Promise.reject(new TypeError('Failed to fetch'));

type Setup = { kopri: ReturnType<typeof soxtaKopri>; base: ReturnType<typeof vi.fn>; navbat: FaktNavbat; f: typeof fetch; onlayn: { v: boolean } };
function setup(opts: { tayyor?: boolean } = {}): Setup {
  const kopri = soxtaKopri({ tayyor: opts.tayyor });
  const base = vi.fn();
  const onlayn = { v: true };
  const navbat = new FaktNavbat({ kopri, base: base as unknown as typeof fetch });
  const f = oflaynFetch(base as unknown as typeof fetch, { kopri, navbat, tayyor: () => kopri.holat(), origin: ORIGIN, onlayn: () => onlayn.v });
  return { kopri, base, navbat, f, onlayn };
}

beforeEach(() => oflaynTozalaTest());
afterEach(() => { oflaynTozalaTest(); vi.restoreAllMocks(); });

describe('sha256', () => {
  it('standart vektorlar', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('koprigaUlan: faqat Tauri + jonli sayt origin', () => {
  const w = (origin: string, invoke?: unknown) => ({ location: { origin }, __TAURI_INTERNALS__: invoke ? { invoke } : undefined }) as unknown as Window;
  it('oddiy brauzerda yoki boshqa origin\'da yo\'q', () => {
    expect(koprigaUlan(w(ORIGIN))).toBeNull();
    expect(koprigaUlan(w('http://tauri.localhost', async () => null))).toBeNull();
    expect(koprigaUlan(w('https://evil.example', async () => null))).toBeNull();
  });
  it('buyruq nomlari tor oflayn_* to\'plami', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    const k = koprigaUlan(w(SAYT_ORIGIN, invoke))!;
    await k.holat(); await k.yoz('r_x', 'v'); await k.oqi('r_x'); await k.tozala(); await k.navbatQosh('i', 'v'); await k.navbatRoyxat(); await k.navbatOchir('i'); await k.qobiqTayyor('v1');
    expect(invoke.mock.calls.map((c) => c[0]).sort()).toEqual([
      'oflayn_holat', 'oflayn_kesh_oqi', 'oflayn_kesh_tozala', 'oflayn_kesh_yoz', 'oflayn_navbat_ochir', 'oflayn_navbat_qosh', 'oflayn_navbat_royxat', 'oflayn_qobiq_tayyor',
    ]);
    // Aktyor/kompaniya parametri YO'Q: doira faqat Rust'da.
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/foydalanuvchi|kompaniya|actor/i);
  });
  it('oddiy brauzerda oflaynBoshlash hech narsa o\'rnatmaydi va fetch\'ni almashtirmaydi', () => {
    const asl = window.fetch;
    expect(oflaynBoshlash()).toBeNull();
    expect(window.fetch).toBe(asl);
    expect(document.querySelector('[data-oflayn-banner]')).toBeNull();
  });
});

describe('o\'qish interceptori', () => {
  it('onlayn: javob o\'tadi va keshga yoziladi (xuddi shu baytlar)', async () => {
    const s = setup();
    const body = { ok: true, qatorlar: [{ id: 1, summa: 123456789.5, narx: null }] };
    s.base.mockResolvedValue(json(body));
    const r = await s.f('/api/sb', sb({ jadval: 't2_daraxt', filtr: 'obyekt_id=eq.1' }));
    expect(await r.json()).toEqual(body);
    await kut(); await kut(); await kut();
    expect(s.kopri.kesh.size).toBe(1);
    const [kalit, yoz] = [...s.kopri.kesh.entries()][0];
    expect(kalit).toBe(keshKaliti({ method: 'POST', yol: '/api/sb', body: JSON.stringify({ jadval: 't2_daraxt', filtr: 'obyekt_id=eq.1' }) }));
    expect(JSON.parse(yoz.qiymat).b).toBe(JSON.stringify(body));
  });

  it('tarmoq uzilsa keshdan beriladi, pul qiymatlari o\'zgarmaydi, banner vaqti ko\'rinadi', async () => {
    const s = setup();
    const body = { ok: true, qatorlar: [{ id: 1, summa: 1234567890.25, narx: null, f2: 0 }] };
    const so = sb({ jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.1' });
    s.base.mockResolvedValueOnce(json(body));
    await s.f('/api/sb', so);
    await kut(); await kut(); await kut();
    s.base.mockImplementation(tarmoqXato);
    const r = await s.f('/api/sb', so);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(JSON.stringify(body)); // aynan o'sha baytlar: null null, 0 nol
    expect(r.headers.get('X-Smeta-Oflayn')).toBe(String(s.kopri.vaqt));
    expect(oflaynKorinish().oflayn).toBe(true);
    expect(oflaynKorinish().eskiMs).toBe(s.kopri.vaqt);
    expect(bannerMatni(oflaynKorinish()).asosiy).toContain(vaqtMatni(s.kopri.vaqt));
  });

  it('keshda yo\'q so\'rov — asl tarmoq xatosi (hech narsa to\'qilmaydi)', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    await expect(s.f('/api/sb', sb({ jadval: 'x' }))).rejects.toBeInstanceOf(TypeError);
    expect(oflaynKorinish().oflayn).toBe(false);
  });

  it('server javob bergan bo\'lsa (xato bo\'lsa ham) kesh HECH QACHON berilmaydi', async () => {
    const s = setup();
    const so = sb({ jadval: 't2_akt_reestr', filtr: 'obyekt_id=eq.1' });
    s.base.mockResolvedValueOnce(json({ ok: true, qatorlar: [{ id: 9 }] }));
    await s.f('/api/sb', so);
    await kut(); await kut(); await kut();
    for (const status of [401, 403, 404, 500, 502]) {
      s.base.mockResolvedValueOnce(json({ ok: false, error: 'x' }, status));
      const r = await s.f('/api/sb', so);
      expect(r.status).toBe(status);
      expect(r.headers.get('X-Smeta-Oflayn')).toBeNull();
    }
    // 200 + ok:false ham keshga YOZILMAYDI (xato javob eski to'g'ri javobni ezmasin).
    s.base.mockResolvedValueOnce(json({ ok: false, error: 'xato' }));
    await s.f('/api/sb', so);
    await kut(); await kut(); await kut();
    expect(JSON.parse([...s.kopri.kesh.values()][0].qiymat).b).toContain('"id":9');
    expect(oflaynKorinish().oflayn).toBe(false);
  });

  it('yozuvchi/begona so\'rovlar keshga tushmaydi: POST /api/sb-yoz, boshqa origin, /api/gas', async () => {
    const s = setup();
    s.base.mockResolvedValue(json({ ok: true }));
    await s.f('/api/sb-yoz', sb({ amal: 'f2_yarat', obyekt_id: 1 }));
    await s.f('https://evil.example/api/sb', sb({ jadval: 'x' }));
    await s.f('/api/gas', sb({ fn: 'x' }));
    await s.f('/api/kirish', sb({ email: 'a' }));
    await kut(); await kut(); await kut();
    expect(s.kopri.kesh.size).toBe(0);
    expect(s.kopri.chaqiruvlar.filter((x) => x === 'yoz')).toHaveLength(0);
  });

  it('ko\'prik tayyor emas (aktyor/lease) — kesh ham yozilmaydi, ham berilmaydi', async () => {
    const s = setup({ tayyor: false });
    s.base.mockResolvedValueOnce(json({ ok: true, qatorlar: [] }));
    await s.f('/api/sb', sb({ jadval: 'a' }));
    await kut(); await kut(); await kut();
    expect(s.kopri.kesh.size).toBe(0);
    s.base.mockImplementation(tarmoqXato);
    await expect(s.f('/api/sb', sb({ jadval: 'a' }))).rejects.toBeInstanceOf(TypeError);
  });

  it('AbortError qayta tashlanadi (timeout/foydalanuvchi bekori keshdan javob olmaydi)', async () => {
    const s = setup();
    const so = sb({ jadval: 'a' });
    s.base.mockResolvedValueOnce(json({ ok: true }));
    await s.f('/api/sb', so);
    await kut(); await kut(); await kut();
    s.base.mockRejectedValueOnce(new DOMException('x', 'AbortError'));
    await expect(s.f('/api/sb', so)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('GET o\'qishlar (sessiya, kompaniya, paket) ham keshlanadi; o\'zgarmagan javob qayta yozilmaydi', async () => {
    const s = setup();
    s.base.mockImplementation(async () => json({ ok: true, foydalanuvchi_id: 5 }));
    await s.f('/api/sessiya');
    await s.f('/api/sessiya');
    await s.f('/api/company?me=1');
    await s.f('/api/obyekt-paket?obyekt_id=3');
    await kut(); await kut(); await kut(); await kut();
    expect(s.kopri.kesh.size).toBe(3);
    expect(s.kopri.chaqiruvlar.filter((x) => x === 'yoz')).toHaveLength(3);
  });

  it('onlayn=false va keshda bor — tarmoqsiz darhol keshdan', async () => {
    const s = setup();
    const so = sb({ jadval: 'a' });
    s.base.mockResolvedValueOnce(json({ ok: true, v: 1 }));
    await s.f('/api/sb', so);
    await kut(); await kut(); await kut();
    s.onlayn.v = false;
    s.base.mockClear();
    const r = await s.f('/api/sb', so);
    expect(await r.json()).toEqual({ ok: true, v: 1 });
    expect(s.base).not.toHaveBeenCalled();
  });

  it('tarmoq qaytganda banner o\'chadi (oflayn=false)', async () => {
    const s = setup();
    oflaynYangila({ oflayn: true, eskiMs: 1 });
    s.base.mockResolvedValueOnce(json({ ok: true }));
    await s.f('/api/sb', sb({ jadval: 'a' }));
    expect(oflaynKorinish().oflayn).toBe(false);
    expect(oflaynKorinish().eskiMs).toBeNull();
  });
});

describe('Fakt yozish navbati', () => {
  const faktTana = (op: string | undefined, hajm = 5) => ({ amal: 'fakt_yoz_v2', obyekt_id: 1, sana: '2026-11-15', qatorlar: [{ qator_id: 10, hajm }], ...(op ? { operation_id: op } : {}) });

  it('tarmoq yo\'q: Fakt navbatga tushadi, javob "navbatda (yuborilmagan)", server so\'rovi qayta yuborilmaydi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    const r = await s.f('/api/sb-yoz', sb(faktTana(OP1)));
    const j = await r.json();
    expect(r.status).toBe(202);
    expect(j).toMatchObject({ ok: false, navbatda: true, code: 'OFLAYN_NAVBATDA', operation_id: OP1 });
    expect(s.base).toHaveBeenCalledTimes(1);
    expect(oflaynKorinish().navbat).toBe(1);
    expect(oflaynKorinish().oflayn).toBe(true);
    expect(bannerMatni(oflaynKorinish()).navbat).toContain('1');
  });

  it('operation_id yo\'q bo\'lsa yaratiladi (UUID), shu bosish ikki marta navbatga tushmaydi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    const a = await (await s.f('/api/sb-yoz', sb(faktTana(undefined)))).json();
    expect(a.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    const b = await (await s.f('/api/sb-yoz', sb(faktTana(a.operation_id)))).json();
    expect(b.operation_id).toBe(a.operation_id);
    expect(s.kopri.navbat.size).toBe(1);
  });

  it('F-2, imzo, to\'lov, import oflayn navbatga KIRMAYDI — asl tarmoq xatosi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    for (const amal of ['f2_yarat', 'f2_tasdiqla', 'imzo_qoy', 'tolov_yoz', 'f2_import_job_yarat']) {
      await expect(s.f('/api/sb-yoz', sb({ amal, obyekt_id: 1 }))).rejects.toBeInstanceOf(TypeError);
    }
    expect(s.kopri.navbat.size).toBe(0);
  });

  it('navbat yoza olmasa (kvota va h.k.) — foydalanuvchi asl xatoni ko\'radi, jim "saqlandi" yo\'q', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    s.kopri.navbatQosh = async () => { throw 'OFLAYN_QUOTA'; };
    await expect(s.f('/api/sb-yoz', sb(faktTana(OP1)))).rejects.toBeInstanceOf(TypeError);
  });

  it('aloqa qaytganda TARTIB bilan va o\'sha operation_id bilan yuboriladi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    await s.f('/api/sb-yoz', sb(faktTana(OP1, 1)));
    await s.f('/api/sb-yoz', sb(faktTana(OP2, 2)));
    await s.f('/api/sb-yoz', sb(faktTana(OP3, 3)));
    const yuborilgan: string[] = [];
    s.base.mockReset();
    s.base.mockImplementation(async (_u: string, init: RequestInit) => {
      yuborilgan.push(JSON.parse(String(init.body)).operation_id);
      return json({ ok: true, akt_id: 1 });
    });
    const n = await s.navbat.yubor();
    expect(yuborilgan).toEqual([OP1, OP2, OP3]);
    expect(n).toMatchObject({ yuborildi: 3, qoldi: 0, toxtadi: null });
    expect(s.kopri.navbat.size).toBe(0);
    expect(oflaynKorinish().navbat).toBe(0);
  });

  it('takrorlangan yuborish (takror:true) — yuborilgan hisoblanadi, ikkinchi hujjat yo\'q', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    await s.f('/api/sb-yoz', sb(faktTana(OP1)));
    s.base.mockReset();
    s.base.mockResolvedValue(json({ ok: true, takror: true }));
    expect(await s.navbat.yubor()).toMatchObject({ yuborildi: 1, qoldi: 0 });
  });

  it('server ziddiyati JIM yozilmaydi: yozuv navbatda "nizo", foydalanuvchiga ko\'rsatiladi, navbat shu yerda to\'xtaydi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    await s.f('/api/sb-yoz', sb(faktTana(OP1, 1)));
    await s.f('/api/sb-yoz', sb(faktTana(OP2, 2)));
    s.base.mockReset();
    s.base.mockResolvedValue(json({ ok: false, code: 'FAKT_CONFLICT', error: 'Qator boshqa tomonidan o\'zgargan' }, 409));
    const n = await s.navbat.yubor();
    expect(n).toMatchObject({ yuborildi: 0, qoldi: 2, toxtadi: 'nizo' });
    expect(s.base).toHaveBeenCalledTimes(1); // keyingi yozuv ketmadi — tartib saqlandi
    const k = oflaynKorinish();
    expect(k.nizolar).toHaveLength(1);
    expect(k.nizolar[0]).toMatchObject({ kod: 'FAKT_CONFLICT', xato: 'Qator boshqa tomonidan o\'zgargan' });
    expect(k.navbat).toBe(2);
    // Yozuv o'zgarmagan (foydalanuvchi qarori kerak): body bir xil.
    const saqlangan = JSON.parse([...s.kopri.navbat.values()][0]);
    expect(saqlangan.holat).toBe('nizo');
    expect(saqlangan.body.operation_id).toBe(OP1);
    // Nizo hal bo'lmaguncha qayta yuborish ham ikkinchi yozuvni o'tkazmaydi.
    s.base.mockClear();
    expect((await s.navbat.yubor()).toxtadi).toBe('nizo');
    expect(s.base).not.toHaveBeenCalled();
    // Foydalanuvchi bekor qiladi -> navbat davom etadi.
    await s.navbat.bekor(k.nizolar[0].id);
    s.base.mockResolvedValue(json({ ok: true }));
    expect(await s.navbat.yubor()).toMatchObject({ yuborildi: 1, qoldi: 0 });
  });

  it('F-2 tasdiqlangan / akt qulflangan (ok:false, 200) ham nizo sifatida ko\'rsatiladi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    await s.f('/api/sb-yoz', sb(faktTana(OP1)));
    s.base.mockReset();
    s.base.mockResolvedValue(json({ ok: false, sabab: 'akt_qulflangan', error: 'F-2 tasdiqlangan — fakt yozilmaydi' }));
    expect((await s.navbat.yubor()).toxtadi).toBe('nizo');
    expect(oflaynKorinish().nizolar[0].xato).toContain('F-2 tasdiqlangan');
  });

  it('5xx/401 — yozuv saqlanadi, qayta uriniladi (nizo emas); 401 da qayta kirish talab etiladi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    await s.f('/api/sb-yoz', sb(faktTana(OP1)));
    s.base.mockReset();
    s.base.mockResolvedValue(json({ ok: false }, 503));
    expect(await s.navbat.yubor()).toMatchObject({ toxtadi: 'server', qoldi: 1 });
    expect(oflaynKorinish().nizolar).toHaveLength(0);
    s.base.mockResolvedValue(json({ ok: false }, 401));
    expect((await s.navbat.yubor()).toxtadi).toBe('sessiya');
    expect(oflaynKorinish().toxtadi).toBe('sessiya');
    expect(bannerMatni(oflaynKorinish()).sessiya).toBeTruthy();
    s.base.mockImplementation(tarmoqXato);
    expect((await s.navbat.yubor()).toxtadi).toBe('tarmoq');
    expect(s.kopri.navbat.size).toBe(1);
  });

  it('onlayn Fakt oddiy o\'tadi va navbat tegilmaydi', async () => {
    const s = setup();
    s.base.mockResolvedValue(json({ ok: true, akt_id: 7 }));
    const r = await s.f('/api/sb-yoz', sb(faktTana(OP1)));
    expect(await r.json()).toEqual({ ok: true, akt_id: 7 });
    expect(s.kopri.navbat.size).toBe(0);
  });

  it('chiqish: yuborilmagan yozuv bo\'lsa bir marta ogohlantiriladi, keyin kesh+navbat tozalanadi', async () => {
    const s = setup();
    s.base.mockImplementation(tarmoqXato);
    await s.f('/api/sb-yoz', sb(faktTana(OP1)));
    s.base.mockReset();
    s.base.mockImplementation(async (u: string) => (u === '/api/sb-yoz' ? json({ ok: false, error: 'x' }, 502) : json({ ok: true })));
    const birinchi = await s.f('/api/chiqish', { method: 'POST' });
    expect(birinchi.status).toBe(409);
    expect(s.kopri.kesh.size + s.kopri.navbat.size).toBeGreaterThan(0);
    const ikkinchi = await s.f('/api/chiqish', { method: 'POST' });
    expect(ikkinchi.status).toBe(200);
    expect(s.kopri.navbat.size).toBe(0);
    expect(oflaynKorinish().navbat).toBe(0);
  });
});

describe('banner (DOM)', () => {
  it('oflayn matni, navbat va nizo tugmalari chiziladi; tarmoq qaytsa yashirinadi', async () => {
    const s = setup();
    const off = bannerQoy(document, s.navbat);
    const el = document.querySelector('[data-oflayn-banner]') as HTMLElement;
    expect(el.hidden).toBe(true);
    oflaynYangila({ oflayn: true, eskiMs: s.kopri.vaqt, navbat: 2, nizolar: [{ id: 'a', amal: 'fakt_yoz_v2', vaqt: 1, xato: 'ZIDDIYAT', kod: null }] });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain(vaqtMatni(s.kopri.vaqt));
    expect(el.textContent).toContain('ZIDDIYAT');
    expect(el.querySelectorAll('button')).toHaveLength(2);
    oflaynYangila({ oflayn: false, eskiMs: null, navbat: 0, nizolar: [] });
    expect(el.hidden).toBe(true);
    off();
    expect(document.querySelector('[data-oflayn-banner]')).toBeNull();
  });
});

describe('Oflayn uchun tayyorlash', () => {
  it('har obyekt uchun hamma yuklagich chaqiriladi; biri yiqilsa qolganlari davom etadi', async () => {
    const chaqirilgan: string[] = [];
    const yuk = (nom: string, yiq = false) => ({ nom, yukla: async (id: number) => { chaqirilgan.push(`${nom}${id}`); if (yiq && id === 2) throw new Error('x'); } });
    const progress: number[] = [];
    const r = await oflaynUchunTayyorla([1, 2], { yuklagichlar: [yuk('a'), yuk('b', true)], onProgress: (n) => progress.push(n) });
    expect(chaqirilgan).toEqual(['a1', 'b1', 'a2', 'b2']);
    expect(r.tayyor).toEqual([1]);
    expect(r.xato).toEqual([{ obyektId: 2, nom: 'b' }]);
    expect(progress).toEqual([1, 2]);
  });
  it('oflayn paytda rad etiladi (kesh "tayyor" deb yolg\'on aytmasin)', async () => {
    oflaynYangila({ oflayn: true });
    await expect(oflaynUchunTayyorla([1], { yuklagichlar: [] })).rejects.toThrow('OFLAYN_TAYYORLASH_ONLAYN_KERAK');
  });
});
