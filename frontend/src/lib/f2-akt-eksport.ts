/**
 * SAQLANGAN F2 AKTI — Ф-2 hujjati va pul bahosi uchun YAGONA tayyorlash (F2 tarixi va F2 portfeli, egasi 2026-11-05).
 * F2 tarixidagi «Ф-2 Excel» mantiqi shu yerga ko'chirildi (yangi formula yo'q):
 *  - storno bloklari (`raw_snapshot.stornoOf`) hujjat TEPASIDA, har biri o'z hujjat podvali bilan (`pereraschetBloklari`);
 *  - qolgan («yangi») qatorlar — aktning O'Z podvali (`t2_akt_podval`, blok '') bo'lsa o'shaniki, yo'q — obyekt smeta podvali;
 *  - pul: `f2Baholash` (hisob yadrosi, SQL `_t2_summa_paket_v1` bilan bir model). NULL ≠ 0.
 */
import type { T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import type { F2HujjatKonteksti } from '../api/f2-hujjat-kontekst';
import { f2AktKirish } from './f2-akt-hujjat';
import { eskiBloklarHujjat, pereraschetBloklari, stornosizQatorlar, type PereraschetAktQator, type PereraschetBlok } from './f2-pereraschet';
import type { AktPodvalQator } from './akt-podval';
import { NDS_SUKUT_FOIZ, f2Baholash, yaxlit2, type AktPodvalNk, type F2Baho, type F2Blok } from './hisob-yadro';
import { katKesimYigish } from './ustamali-summa';
import type { F2Bolim, F2Qator } from './f2-tayyor';
import type { F2HujjatOpsiya } from './f2-hujjat';
import type { AktMoliya } from './f2-oylik-paket/oylik';

export type F2AktEksportKirish = {
  /** Obyekt smeta daraxti (F2 tarixi bilan bir xil o'qish). */
  smeta: readonly T2Qator[];
  /** Shu aktning tafsilot qatorlari (`t2_f2_tafsilot`). */
  lines: readonly F2Tafsilot[];
  /** Shu aktning `t2_akt_qator` qatorlari (raw_snapshot bilan — storno bloklari uchun). */
  aktQatorlar: readonly PereraschetAktQator[];
  /** `aktPodvalXaritasi` natijasi: `akt:blok` → podval. */
  podvallar: ReadonlyMap<string, Pick<AktPodvalQator, 'nk'>>;
  kontekst: F2HujjatKonteksti;
  akt: { id: number; oy: string | null; raqam: string | null };
  obyektNom: string;
  /** Akt id → raqam (storno bloki sarlavhasi). */
  raqamlar: ReadonlyMap<number, string | null>;
};

export type F2AktTayyor = {
  bolimlar: F2Bolim[];
  /** «Yangi» qatorlar (storno bloklari qatorlari chiqarilgan). */
  qatorlar: F2Qator[];
  eskiBloklar: PereraschetBlok[];
  topilmagan: number;
  ozNk: AktPodvalNk | null;
  blokNk: (manbaAktId: number) => AktPodvalNk | null;
  opsiya: F2HujjatOpsiya;
};

/** Ф-2 hujjati kirishi. Aktda chiqariladigan qator bo'lmasa null. */
export function f2AktTayyorla(k: F2AktEksportKirish): F2AktTayyor | null {
  const kir = f2AktKirish(k.smeta, k.lines);
  if (!kir.qatorlar.length) return null;
  const eskiB = pereraschetBloklari(k.aktQatorlar, new Map(k.smeta.map((r) => [r.id, r] as const)), k.raqamlar);
  const ozNk = k.podvallar.get(`${k.akt.id}:`)?.nk ?? null;
  const blokNk = (m: number) => k.podvallar.get(`${k.akt.id}:${m}`)?.nk ?? k.podvallar.get(`${m}:`)?.nk ?? null;
  const ozNakrutka = ozNk ? (Object.fromEntries(Object.entries(ozNk).filter(([, v]) => v != null).map(([kk, v]) => [kk, Number(v)])) as F2HujjatKonteksti['nakrutka']) : null;
  const ctx = k.kontekst;
  return {
    bolimlar: kir.bolimlar, qatorlar: stornosizQatorlar(kir.qatorlar, eskiB), eskiBloklar: eskiB, topilmagan: kir.topilmagan, ozNk, blokNk,
    opsiya: {
      obyektNom: k.obyektNom, davr: k.akt.oy || '', raqam: k.akt.raqam, imzo: ctx.imzo, shartnoma: ctx.shartnoma,
      // Hujjatning o'z podvali bo'lsa - uning foizlari (QQS ham o'ziniki); yo'q - obyekt podvali va tizim QQS stavkasi.
      ndsFoiz: ozNk ? null : NDS_SUKUT_FOIZ, nakrutka: ozNakrutka ?? ctx.nakrutka, podval: ozNk ? null : ctx.podval, nkManba: ozNk ? null : ctx.nkManba ?? null,
      eskiBloklar: eskiB.length ? eskiBloklarHujjat(eskiB, blokNk) : undefined,
      // Saqlangan akt — tarix: faqat sertifikatlangan qiymatlar, formulasiz (Excel hech narsani qayta hisoblamaydi).
      formulasiz: true, rows: k.smeta,
    },
  };
}

/** Aktning yadro bahosi: storno bloklari o'z podvali bilan, yangi qatorlar — aktning o'z podvali yoki smeta podvali. */
export function f2AktBaho(t: F2AktTayyor, kontekst: Pick<F2HujjatKonteksti, 'podval' | 'nakrutka'>): F2Baho & { qatorSoni: number; narxsizQator: number } {
  const yangi = t.qatorlar.filter((x) => x.tur !== 'bl' && !x.xato);
  const bloklar: F2Blok[] = t.eskiBloklar.map((b) => ({ kalit: `s:${b.manbaAktId}`, nom: b.raqam ?? String(b.manbaAktId), kesim: b.kesim, nk: t.blokNk(b.manbaAktId) }));
  let narxsiz = t.eskiBloklar.reduce((s, b) => s + b.nomalum, 0);
  if (yangi.length) {
    const kesim = katKesimYigish(yangi, (x: F2Qator) => x.kat ?? null, (x: F2Qator) => (x.narxsiz ? null : x.summa));
    narxsiz += kesim.summasizSoni;
    bloklar.push({ kalit: 'yangi', nom: 'yangi', kesim, nk: t.ozNk });
  }
  const baho = f2Baholash(bloklar, { podval: kontekst.podval, koef: kontekst.nakrutka });
  return { ...baho, qatorSoni: yangi.length + t.eskiBloklar.reduce((s, b) => s + b.qatorlar.length, 0), narxsizQator: narxsiz };
}

/** Yadro bahosi → paket/portfel `AktMoliya` (aktMoliya bilan bir xil qoidalar: kat hammasi noma'lum — ustamali noma'lum). */
export function bahoMoliya(b: ReturnType<typeof f2AktBaho>, hujjatJami: number | null): AktMoliya {
  if (!b.birliklar.length) {
    return { ustamasiz: hujjatJami == null ? null : yaxlit2(hujjatJami), ustamali: null, taxminiy: false, nds: null, jami: null, narxsizQator: 0, qatorSoni: 0, sabab: 'QATOR_YOQ' };
  }
  const n = b.birliklar.map((u) => u.natija);
  const yadroSabab = n.find((x) => x.sabab)?.sabab ?? null;
  const nomalumSoni = n.reduce((s, x) => s + x.nomalumSoni, 0);
  const nomalumSumma = n.reduce((s, x) => s + x.nomalumSumma, 0);
  const hechBiriYoq = nomalumSoni > 0 && yaxlit2(b.ustamasiz - nomalumSumma) === 0;
  const sabab: AktMoliya['sabab'] = yadroSabab ?? (hechBiriYoq ? 'KAT_NOMALUM' : null);
  const ustamali = sabab ? null : b.ustamali;
  return {
    ustamasiz: b.ustamasiz, ustamali, taxminiy: ustamali != null && n.some((x) => x.taxminiy),
    nds: ustamali == null ? null : b.qqs, jami: ustamali == null ? null : b.qqsBilan,
    narxsizQator: b.narxsizQator, qatorSoni: b.qatorSoni, sabab,
  };
}
