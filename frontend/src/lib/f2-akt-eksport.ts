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
import { y6, type F2Bolim, type F2Qator } from './f2-tayyor';
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
  /**
   * `holat` — akt holati. QORALAMA (egasi 2026-11-06, pereraschet «№ 23-С»): yangi hajmlar bloki TIRIK formulalar bilan
   * (texnadzor hajmni o'zgartirsa resurs, summa, jamilar va podval qayta hisoblanadi); storno bloki — eski F2 qiymatlari aynan.
   * Tasdiqlangan / berilmagan — muzlatilgan tarix, formulasiz (egasi 2026-10-02).
   */
  akt: { id: number; oy: string | null; raqam: string | null; holat?: string | null };
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
  const qatorlar = resursBoglanishiniTikla(stornosizQatorlar(kir.qatorlar, eskiB), k.smeta);
  const qoralama = k.akt.holat === 'qoralama';
  return {
    bolimlar: kir.bolimlar, qatorlar, eskiBloklar: eskiB, topilmagan: kir.topilmagan, ozNk, blokNk,
    opsiya: {
      obyektNom: k.obyektNom, davr: k.akt.oy || '', raqam: k.akt.raqam, imzo: ctx.imzo, shartnoma: ctx.shartnoma,
      // Hujjatning o'z podvali bo'lsa - uning foizlari (QQS ham o'ziniki); yo'q - obyekt podvali va tizim QQS stavkasi.
      ndsFoiz: ozNk ? null : NDS_SUKUT_FOIZ, nakrutka: ozNakrutka ?? ctx.nakrutka, podval: ozNk ? null : ctx.podval, nkManba: ozNk ? null : ctx.nkManba ?? null,
      eskiBloklar: eskiB.length ? eskiBloklarHujjat(eskiB, blokNk) : undefined,
      // Tasdiqlangan akt — tarix: faqat sertifikatlangan qiymatlar, formulasiz. Qoralama — tirik (keshlangan natija = sertifikatlangan qiymat).
      formulasiz: !qoralama, rows: k.smeta,
    },
  };
}

/**
 * Resurs miqdori «norma × ish hajmi» formulasiga faqat haqiqatan teng bo'lsa bog'lanadi (`RESURS_CHEGARA` — qiymat).
 * `f2AktKirish` ish hajmini aktning BARCHA qatorlaridan oladi — pereraschetda bir ish storno blokida (minus) ham, yangi blokda ham
 * bo'ladi va minus hajm yangi resurslarni noto'g'ri «muzlatilgan» qilardi. Bu yerda faqat yangi blok ish hajmi bilan qayta tekshiriladi.
 */
function resursBoglanishiniTikla(qatorlar: F2Qator[], smeta: readonly T2Qator[]): F2Qator[] {
  const blHajm = new Map<number, number>();
  for (const x of qatorlar) if (x.tur === 'bl') blHajm.set(x.id, x.hajm);
  const norma = new Map(smeta.map((r) => [r.id, Number((r as T2Qator & { norma?: number | null }).norma)] as const));
  return qatorlar.map((x) => {
    if (x.tur !== 'rs' || x.ishId == null) return x;
    const n = norma.get(x.id);
    if (n == null || !Number.isFinite(n) || n <= 0) return x;
    const bh = blHajm.get(x.ishId);
    const chegara = bh == null || Math.abs(y6(n * bh) - x.hajm) > 1e-6;
    if (chegara === (x.ogoh === 'RESURS_CHEGARA')) return x;
    if (chegara) return { ...x, ogoh: 'RESURS_CHEGARA' };
    const { ogoh: _o, ...qolgan } = x;
    return qolgan as F2Qator;
  });
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
