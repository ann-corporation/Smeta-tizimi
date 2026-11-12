/**
 * Mahalliy niyat qatlamining BAHOLASH to'plami (deterministik, CI da yuradi; LLM chaqirilmaydi).
 * Har qator: real uslubdagi gap (uz-lotin, uz-kirill, ru, aralash, imlo xatolari, qisqartmalar) -> kutilgan niyat turi (+ sahifa yo'li).
 * «bilinadi» — hozircha mahalliy qatlam ushlamaydigan gaplar (LLM qatlami hal qiladi): aniqlik hisobiga kiradi, lekin test yiqilmaydi.
 * Aniqlik chegarasi ANIQLIK_MIN dan tushmasligi kerak (regressiya qo'riqchisi).
 */
import { describe, expect, it } from 'vitest';
import { NAV_SAHIFALAR } from '../../nav/navReestr';
import { niyatAniqla, type NiyatKontekst } from '../niyat';

const HAMMA = NAV_SAHIFALAR.map((s) => ({ yol: s.yol, nom: s.nom, guruh: s.guruh.nom }));
const OBYEKTLAR = [{ id: 12, nom: 'Yevropa 1' }, { id: 13, nom: 'Amfiteatr' }, { id: 14, nom: 'Fast Food 1-etaj' }];
const ctx: NiyatKontekst = { sahifalar: HAMMA, obyektlar: OBYEKTLAR, joriyObyekt: OBYEKTLAR[0], bugun: new Date(2026, 10, 11) };

type Q = { m: string; tur: string; yol?: string; bilinadi?: boolean };
export const BAHO: Q[] = [
  // --- navigatsiya (uz-lotin)
  { m: 'mindmapni och', tur: 'navigatsiya', yol: '/admin/mindmap' },
  { m: 'mindmapni ochib ber', tur: 'navigatsiya', yol: '/admin/mindmap' },
  { m: 'aosr sahifasini och', tur: 'navigatsiya', yol: '/admin/aosr' },
  { m: 'F2 tarixini och', tur: 'navigatsiya', yol: '/admin/f2-tarix' },
  { m: 'f2 tayyorlashni och', tur: 'navigatsiya', yol: '/admin/f2-tayyorlash' },
  { m: 'qarzdorlikni ko\'rsat', tur: 'navigatsiya', yol: '/admin/qarzdorlik' },
  { m: 'obyektlar sahifasiga o\'t', tur: 'navigatsiya', yol: '/admin/obyektlar' },
  { m: 'faktni och', tur: 'navigatsiya', yol: '/admin/fakt', bilinadi: true },
  { m: 'nakopitelniyni och', tur: 'navigatsiya', yol: '/admin/nakopitelniy' },
  { m: 'M-29 ni och', tur: 'navigatsiya', yol: '/admin/m29' },
  { m: 'zayavka sahifasiga kir', tur: 'navigatsiya', yol: '/admin/zayavka' },
  { m: 'kursni och', tur: 'navigatsiya', yol: '/admin/kurs' },
  // --- navigatsiya (kirill, ru, en, aralash)
  { m: 'ёпиш мақсад: мындмапни оч', tur: 'navigatsiya', bilinadi: true },
  { m: 'открой майндмап', tur: 'navigatsiya', yol: '/admin/mindmap' },
  { m: 'покажи долги', tur: 'navigatsiya', yol: '/admin/qarzdorlik' },
  { m: 'open debts', tur: 'navigatsiya', yol: '/admin/qarzdorlik' },
  { m: 'open mindmap', tur: 'navigatsiya', yol: '/admin/mindmap' },
  { m: 'АОСР sahifasi', tur: 'navigatsiya', yol: '/admin/aosr' },
  { m: 'открой АОСР', tur: 'navigatsiya', yol: '/admin/aosr' },
  { m: 'мындмапни оч', tur: 'navigatsiya', yol: '/admin/mindmap', bilinadi: true },
  { m: 'ф2 тарихини оч', tur: 'navigatsiya', yol: '/admin/f2-tarix', bilinadi: true },
  { m: 'fakt sahifasini ochib bering iltimos', tur: 'navigatsiya', yol: '/admin/fakt' },
  { m: 'iltimos qarzdorlikni ochib bering', tur: 'navigatsiya', yol: '/admin/qarzdorlik' },
  { m: 'mindmap och tez', tur: 'navigatsiya', yol: '/admin/mindmap' },
  // --- obyekt kontekstli navigatsiya
  { m: 'Yevropa 1 ning F2 sini och', tur: 'navigatsiya', yol: '/admin/f2-tarix' },
  { m: 'Amfiteatr faktini och', tur: 'navigatsiya', yol: '/admin/fakt' },
  { m: 'Yevropa 1 oktabr oyi F2 tayyorlashni och', tur: 'navigatsiya', yol: '/admin/f2-tayyorlash' },
  // --- o'qish
  { m: 'narxsiz qatorlarni ko\'rsat', tur: 'oqish' },
  { m: 'narxsiz qatorlar', tur: 'oqish' },
  { m: 'narxsizlar qancha', tur: 'oqish' },
  { m: 'qoldiq qancha', tur: 'oqish' },
  { m: 'qoldiqlar', tur: 'oqish' },
  { m: 'остатки покажи', tur: 'oqish' },
  { m: 'остаток по объекту', tur: 'oqish' },
  { m: 'Amfiteatr narxsiz qatorlari', tur: 'oqish' },
  { m: 'beton qidir', tur: 'oqish' },
  { m: 'g\'isht devor izla', tur: 'oqish' },
  { m: 'найди бетон', tur: 'oqish' },
  { m: 'obyekt holati', tur: 'oqish', bilinadi: true },
  { m: 'holat qanday', tur: 'oqish' },
  { m: 'Yevropa 1 holati', tur: 'oqish' },
  { m: 'статус объекта', tur: 'oqish', bilinadi: true },
  { m: 'ostatka beton', tur: 'oqish' },
  { m: 'narksiz qatorlar', tur: 'oqish', bilinadi: true },      // imlo xatosi
  { m: 'qoldiq qansha', tur: 'oqish' },
  // --- yozuv (fakt)
  { m: '+5 beton', tur: 'yozuv' },
  { m: '=40 beton B25', tur: 'yozuv' },
  { m: 'beton +5 m3', tur: 'yozuv' },
  { m: 'beton 5 m3 kirit', tur: 'yozuv' },
  { m: 'bugun 12 m3 beton quyildi yoz', tur: 'yozuv' },
  { m: 'faktga 30 kub qo\'sh', tur: 'yozuv' },
  { m: 'g\'isht 200 dona qo\'shib qo\'y', tur: 'yozuv' },
  { m: 'внеси 5 м3 бетона', tur: 'yozuv' },
  { m: 'добавь 10 м3 бетон', tur: 'yozuv' },
  { m: 'Amfiteatr +8 armatura', tur: 'yozuv' },
  { m: 'beton = 40', tur: 'yozuv' },
  { m: 'beton 40 ga o\'zgartir', tur: 'yozuv' },
  { m: 'fakt kirit 15', tur: 'yozuv' },
  // --- hujjatlar
  { m: 'F2 qoralamasini tayyorla', tur: 'f2Qoralama' },
  { m: 'Yevropa 1 F2 qoralama yarat', tur: 'f2Qoralama' },
  { m: 'f2 tuz', tur: 'f2Qoralama' },
  { m: 'создай черновик ф2', tur: 'f2Qoralama', bilinadi: true },
  { m: 'АОСР qoralamasini tayyorla', tur: 'aosrQoralama' },
  { m: 'aosr tuzib ber', tur: 'aosrQoralama' },
  { m: 'aosr yaratib ber', tur: 'aosrQoralama' },
  { m: 'qaysi АОСР yetishmayapti', tur: 'aosrYetishmaydi' },
  { m: 'aosr yetishmayotganlarini ko\'rsat', tur: 'aosrYetishmaydi', bilinadi: true },
  { m: 'F2 lar qancha', tur: 'f2Royxat' },
  { m: 'f2 holati', tur: 'f2Royxat', bilinadi: true },
  { m: 'qarzlar qancha', tur: 'qarz' },
  { m: 'qarzdorlik qancha', tur: 'qarz' },
  { m: 'сколько долгов', tur: 'qarz', bilinadi: true },
  // --- kim
  { m: 'men kimman', tur: 'kim' },
  { m: 'Men kimman?', tur: 'kim' },
  { m: 'кто я', tur: 'kim' },
  { m: 'мен кимман', tur: 'kim' },
  { m: 'mening rolim', tur: 'kim' },
  { m: 'mening rolim nima', tur: 'kim' },
  { m: 'моя роль', tur: 'kim' },
  { m: 'bu qaysi obyekt', tur: 'kim' },
  { m: 'qaysi kompaniya', tur: 'kim' },
  { m: 'mening ruxsatlarim', tur: 'kim' },
  { m: 'who am i', tur: 'kim' },
  // --- yordam
  { m: 'nima qila olasan', tur: 'yordam' },
  { m: 'yordam', tur: 'yordam' },
  { m: 'help', tur: 'yordam' },
  { m: 'что ты умеешь', tur: 'yordam' },
  { m: 'nimalar qila olasiz', tur: 'yordam' },
  // --- kurs / o'rganish
  { m: 'F2 ni qanday tayyorlayman', tur: 'dars', bilinadi: true },
  { m: 'tizim nimani organdi', tur: 'osuvchi' },
  { m: 'qayerda qiynalishyapti', tur: 'osuvchi' },
  // --- tushunarsiz (rad etilmaydi: nomalum -> yaqin sahifalar)
  { m: 'asdfgh', tur: 'nomalum' },
  { m: 'ob-havo qanday', tur: 'nomalum' },
];

const ANIQLIK_MIN = 0.85;
const tekshir = (q: Q) => {
  const n = niyatAniqla(q.m, ctx);
  const turOk = n.tur === q.tur;
  const yolOk = !q.yol || (n.tur === 'navigatsiya' && n.sahifa.yol === q.yol);
  return { ok: turOk && yolOk, n };
};

describe('mahalliy niyat baholash to‘plami', () => {
  it('kamida 80 ta gap', () => { expect(BAHO.length).toBeGreaterThanOrEqual(80); });

  it('aniqlik chegaradan past tushmaydi; «bilinadi» bo‘lmaganlar hammasi to‘g‘ri', () => {
    const natija = BAHO.map((q) => ({ q, ...tekshir(q) }));
    const togri = natija.filter((x) => x.ok).length;
    const aniqlik = togri / BAHO.length;
    const xato = natija.filter((x) => !x.ok && !x.q.bilinadi).map((x) => `${x.q.m} -> ${x.n.tur} (kutilgan ${x.q.tur}${x.q.yol ? ' ' + x.q.yol : ''})`);
    // eslint-disable-next-line no-console
    console.log(`NIYAT-BAHO: ${togri}/${BAHO.length} = ${(aniqlik * 100).toFixed(1)}%; bilinadigan xatolar: ${natija.filter((x) => !x.ok && x.q.bilinadi).length}`);
    expect(xato).toEqual([]);
    expect(aniqlik).toBeGreaterThanOrEqual(ANIQLIK_MIN);
  });
});
