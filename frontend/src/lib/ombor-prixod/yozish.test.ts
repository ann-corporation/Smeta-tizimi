import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { prixodKitobOqi } from './kitob';
import {
  BOLAK_HAJMI, kirimRejaBajar, kirimRejaQur, kirimRuxsat, miqdorMatni, stornoMumkin, takrorBelgila, yukQator,
  type ImportChaqir, type KirimBolak, type KirimReja,
} from './yozish';
import type { PrixodQator } from './turlar';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = 'a'.repeat(64);
const header = ['№', 'тип материала', 'Дата', 'Наименование', 'Ед.изм', 'Приход', 'С/Ф подтвержденный', 'Поставщик'];

function qator(i: number, o: Partial<PrixodQator> = {}): PrixodQator {
  return { manbaQator: i, manbaRaqam: String(i), sana: '2026-01-05', nom: `Synthetic ${i % 7}`, birlik: 't', miqdor: 1 + (i % 5),
    miqdorMatni: String(1 + (i % 5)), tur: 'Материал', yetkazuvchi: 'Synthetic supplier', hujjat: '', narx: null, summa: null, qqs: null,
    kalit: null, holat: 'yangi', xatolar: [], ogohlar: [], ...o };
}

/** RPC semantikasining sintetik nusxasi: bo'lak atomar, operation_id idempotent, (sha, qator) bo'yicha takror yo'q. */
function soxtaServer(opts: { uzilish?: number[] } = {}) {
  const ops = new Map<string, string>();
  const qatorlar = new Map<number, string>();
  let chaqiruv = 0;
  const chaqir: ImportChaqir = async ({ bolak }: { documentId: number; bolak: KirimBolak }) => {
    chaqiruv++;
    if (opts.uzilish?.includes(chaqiruv)) throw new Error('NETWORK');
    if (bolak.qatorlar.length < 1 || bolak.qatorlar.length > 1000) return { ok: false, code: 'BATCH_INVALID' };
    const yuk = JSON.stringify(bolak.qatorlar);
    const bor = ops.get(bolak.operationId);
    if (bor != null) return bor === yuk ? { ok: true, qator_soni: bolak.qatorlar.length } : { ok: false, code: 'OPERATION_ID_CONFLICT' };
    if (bolak.qatorlar.some((q) => qatorlar.has(q.source_row))) return { ok: false, code: 'SOURCE_ROW_ALREADY_POSTED' };
    for (const q of bolak.qatorlar) qatorlar.set(q.source_row, bolak.operationId);
    ops.set(bolak.operationId, yuk);
    return { ok: true, qator_soni: bolak.qatorlar.length };
  };
  return { chaqir, qatorlar, ops, get chaqiruv() { return chaqiruv; }, yozilgan: async () => new Set(qatorlar.keys()) };
}

const reja = (n: number) => kirimRejaQur({ kompaniyaId: 1, skladId: 2, sha256: SHA, faylNomi: 's.xlsx',
  qatorlar: Array.from({ length: n }, (_, i) => qator(i + 2)) }).then((r): KirimReja => ({ ...r, documentId: 77 }));

describe('C11 kirim yozish rejasi', () => {
  it('miqdor eksponentasiz o‘nlik matn bo‘ladi; 0/manfiy yuborilmaydi', () => {
    expect(miqdorMatni(5)).toBe('5');
    expect(miqdorMatni(12.25)).toBe('12.25');
    expect(miqdorMatni(1e-7)).toBe('0.0000001');
    expect(miqdorMatni(0)).toBeNull();
    expect(miqdorMatni(-2)).toBeNull();
  });

  it('xato va takror qatorlar yukka kirmaydi; yukda narx/summa yo‘q', () => {
    expect(yukQator(qator(3, { holat: 'xato', xatolar: ['MIQDOR_SANA'], miqdor: null }))).toBeNull();
    expect(yukQator(qator(4, { holat: 'takror' }))).toBeNull();
    const y = yukQator(qator(5))!;
    expect(y).toEqual({ source_row: 5, sana: '2026-01-05', nomi: 'Synthetic 5', birligi: 't', obyomi: '1',
      postavshik: 'Synthetic supplier', manba_turi: 'Материал', sf_tasdiq: null });
    expect(Object.keys(y).some((k) => /narx|summa|qqs/.test(k))).toBe(false);
  });

  it('≤1000 lik bo‘laklar, operation_id deterministik va UUID', async () => {
    const a = await reja(2500); const b = await reja(2500);
    expect(a.bolaklar.map((x) => x.qatorlar.length)).toEqual([BOLAK_HAJMI, BOLAK_HAJMI, 500]);
    expect(a.bolaklar.map((x) => x.operationId)).toEqual(b.bolaklar.map((x) => x.operationId));
    expect(new Set(a.bolaklar.map((x) => x.operationId)).size).toBe(3);
    for (const x of a.bolaklar) expect(x.operationId).toMatch(UUID);
    expect(a.jamiQator).toBe(2500);
  });

  it('uzilgandan keyin shu operation_id bilan davom etadi — ikki marta yozilmaydi', async () => {
    const srv = soxtaServer({ uzilish: [2] });
    const progress: string[] = [];
    let saqlangan: KirimReja | null = null;
    const r0 = await reja(2500);
    const birinchi = await kirimRejaBajar({ reja: r0, chaqir: srv.chaqir, saqla: (r) => { saqlangan = r; },
      progress: (y, j) => progress.push(`${y} / ${j}`) });
    expect(birinchi.holat).toBe('uzildi');
    expect(birinchi.reja.bajarilgan).toEqual([0]);
    expect(saqlangan!.bajarilgan).toEqual([0]);
    expect(srv.qatorlar.size).toBe(1000);
    // Sahifa qayta ochildi: saqlangan reja bilan davom.
    const ikkinchi = await kirimRejaBajar({ reja: saqlangan!, chaqir: srv.chaqir, progress: (y, j) => progress.push(`${y} / ${j}`) });
    expect(ikkinchi).toMatchObject({ holat: 'tugadi', yozildi: 2500, takrorOtkazildi: 0 });
    expect(srv.qatorlar.size).toBe(2500);
    expect([...srv.ops.keys()]).toEqual(r0.bolaklar.map((b) => b.operationId));
    expect(progress).toContain('1000 / 2500');
    expect(progress.at(-1)).toBe('2500 / 2500');
    // Bir xil bo'lak qayta yuborilsa (javob yo'qolgan holat) — o'sha javob, yangi qator yo'q.
    const takror = await kirimRejaBajar({ reja: { ...r0, bajarilgan: [] }, chaqir: srv.chaqir });
    expect(takror).toMatchObject({ holat: 'tugadi', yozildi: 2500 });
    expect(srv.qatorlar.size).toBe(2500);
  });

  it('boshqa yo‘l bilan yozilgan qatorlar ajratiladi va qolgani yoziladi', async () => {
    const srv = soxtaServer();
    const r = await reja(30);
    await srv.chaqir({ documentId: 77, bolak: { tartib: 0, operationId: '00000000-0000-4000-8000-000000000001', qatorlar: r.bolaklar[0].qatorlar.slice(0, 10) } });
    const n = await kirimRejaBajar({ reja: r, chaqir: srv.chaqir, yozilganlarniOl: srv.yozilgan });
    expect(n).toMatchObject({ holat: 'tugadi', yozildi: 20, takrorOtkazildi: 10 });
    expect(srv.qatorlar.size).toBe(30);
  });

  it('to‘xtatish tugmasi keyingi bo‘lakdan oldin to‘xtatadi', async () => {
    const srv = soxtaServer(); let n = 0;
    const r = await kirimRejaBajar({ reja: await reja(2500), chaqir: srv.chaqir, toxtat: () => n++ >= 1 });
    expect(r.holat).toBe('toxtatildi');
    expect(r.reja.bajarilgan).toEqual([0]);
  });

  it('hujjat (R2) bo‘lmasa hech narsa yuborilmaydi', async () => {
    const srv = soxtaServer();
    const r = await kirimRejaBajar({ reja: { ...(await reja(5)), documentId: null }, chaqir: srv.chaqir });
    expect(r).toMatchObject({ holat: 'uzildi', code: 'SOURCE_DOCUMENT_REQUIRED' });
    expect(srv.chaqiruv).toBe(0);
  });
});

describe('takror ko‘rinishi', () => {
  it('yozilgan manba qatorlari «takror», xato qator xato bo‘lib qoladi; jami qayta sanaladi', () => {
    const kitob = { faylNomi: 's.xlsx', sha256: SHA, varaq: 'Приход' as const, sarlavhaQator: 1, kompaniyaId: 1, skladId: 2,
      takrorTekshirildi: false, otkazilganVaraqlar: [], boshQatorlar: 0, ogohlar: [], nomTakliflari: [],
      qatorlar: [qator(2), qator(3), qator(4, { holat: 'xato', xatolar: ['SANA_YOQ'] })], jami: { yangi: 2, takror: 0, xato: 1, ogohli: 0 } };
    const k = takrorBelgila(kitob, new Set([3, 4]));
    expect(k.takrorTekshirildi).toBe(true);
    expect(k.qatorlar.map((q) => q.holat)).toEqual(['yangi', 'takror', 'xato']);
    expect(k.jami).toMatchObject({ yangi: 1, takror: 1, xato: 1 });
  });
});

describe('ruxsat', () => {
  it('ko‘rish document.read, yozish/storno document.write; ro‘yxat kelmasa qarorni server beradi', () => {
    expect(kirimRuxsat(['document.read'])).toEqual({ korish: true, yozish: false });
    expect(kirimRuxsat(['document.write'])).toEqual({ korish: true, yozish: true });
    expect(kirimRuxsat(['f2.read'])).toEqual({ korish: false, yozish: false });
    expect(kirimRuxsat(undefined)).toEqual({ korish: true, yozish: true });
  });
  it('storno faqat 24 soat ichida va bir marta', () => {
    const hozir = Date.parse('2026-10-29T12:00:00Z');
    expect(stornoMumkin({ storno: false, yaratildi: '2026-10-29T01:00:00Z' }, hozir)).toBe(true);
    expect(stornoMumkin({ storno: false, yaratildi: '2026-10-28T11:00:00Z' }, hozir)).toBe(false);
    expect(stornoMumkin({ storno: true, yaratildi: '2026-10-29T11:00:00Z' }, hozir)).toBe(false);
  });
});

describe('sintetik e2e: 2 000 qatorlik «Приход» → yozish → shu fayl qayta → 0 yangi', () => {
  it('sana formatidagi miqdor xato bo‘ladi va yozilmaydi; qayta yuklashda hammasi takror', async () => {
    const rows: unknown[][] = [['Synthetic receipt journal'], [], header];
    for (let i = 1; i <= 2000; i++) rows.push([i, 'Материал', '05.01.2026', `Synthetic material ${i % 40}`, 'т', (i % 9) + 0.5, null, `Supplier ${i % 3}`]);
    rows.push([null, 'Материал', null, null, null, null, null, 'Supplier template']); // bo'sh shablon
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws.F10 = { t: 'n', v: 46027, z: 'dd.mm.yyyy' }; // miqdor ustunida sana formati
    ws.F11 = { t: 'n', v: 46028, z: 'dd.mm.yyyy' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Приход');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, [1, 'Материал', '05.01.2026', 'Not imported', 'т', 9, null, 'X']]), 'Расход');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    const kitob = await prixodKitobOqi(bytes, { faylNomi: 'synthetic.xlsx', kompaniyaId: 1, skladId: 2 });
    expect(kitob.qatorlar).toHaveLength(2000);
    expect(kitob.boshQatorlar).toBe(1);
    expect(kitob.otkazilganVaraqlar).toEqual(['Расход']);
    const xato = kitob.qatorlar.filter((q) => q.holat === 'xato');
    expect(xato.map((q) => [q.manbaQator, q.xatolar])).toEqual([[10, ['MIQDOR_SANA']], [11, ['MIQDOR_SANA']]]);

    const srv = soxtaServer();
    const r = await kirimRejaQur({ kompaniyaId: 1, skladId: 2, sha256: kitob.sha256, faylNomi: kitob.faylNomi, qatorlar: kitob.qatorlar });
    expect(r.bolaklar.map((b) => b.qatorlar.length)).toEqual([1000, 998]);
    const n = await kirimRejaBajar({ reja: { ...r, documentId: 1 }, chaqir: srv.chaqir });
    expect(n).toMatchObject({ holat: 'tugadi', yozildi: 1998 });

    const qayta = takrorBelgila(await prixodKitobOqi(bytes, { faylNomi: 'synthetic.xlsx', kompaniyaId: 1, skladId: 2 }), await srv.yozilgan());
    expect(qayta.jami).toMatchObject({ yangi: 0, takror: 1998, xato: 2 });
    const r2 = await kirimRejaQur({ kompaniyaId: 1, skladId: 2, sha256: qayta.sha256, faylNomi: 'synthetic.xlsx', qatorlar: qayta.qatorlar });
    expect(r2.bolaklar).toHaveLength(0);
  });
});
