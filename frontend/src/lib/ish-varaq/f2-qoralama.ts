/**
 * Ish varag'i «F2» rejimi — sof mantiq (DOM/tarmoq yo'q). Narx qoidasi YANGIDAN yozilmaydi: F2 qatorlari va narx
 * (max(smeta, xarid/protokol) — `narxTaklif`) F2 tayyorlashdagi mavjud zanjirdan: `f2Qur` → `f2Qatorlar` → `f2ZamenaQolla` → `f2Yuk`.
 * Varaq F2 ni TASDIQLAMAYDI: faqat joriy oyning QORALAMA aktiga hajm yozadi (qoralama qatorlari jim yo'qolmasin —
 * mavjud qoralama `aktdanKiritma` bilan kiritmalarga ochiladi, varaq o'zgartirgan hajmlar ustiga qo'yiladi).
 */
import type { T2Qator } from '../../api/supabase';
import { aktdanKiritma, type AktBand } from '../f2-akt-kiritma';
import { stornoQatorimi } from '../f2-storno';
import {
  f2Jami, f2KatKesim, f2Qatorlar, f2Qur, f2Yuk, f2ZamenaQolla, sonMatn, sonOqi,
  type F2Bolim, type F2Holat, type F2Jami, type F2Kiritma, type F2Manba, type F2Qator, type F2ZamenaKontekst, type ProtokolNarxlari,
} from '../f2-tayyor';
import type { F2NativePayloadRow } from '../f2-native-preparation';
import type { KatKesim } from '../ustamali-summa';

const sonQ = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** F2 hisobi uchun serverdan o'qilgan manbalar (hammasi o'qilgan bo'lishi shart — jim bo'sh qiymat narxni buzardi). */
export type F2Manbalar = {
  rows: readonly T2Qator[];
  holat: readonly F2Holat[];
  protokolNarx: ProtokolNarxlari;
  /** BOSHQA F2 qoralamalaridagi hajm (joriy qoralama istisno) — ikki marta olinmasin. */
  qoralamaHajm: ReadonlyMap<number, number>;
  chiqarilgan: ReadonlySet<number>;
  zamenaAsl: ReadonlyMap<number, number>;
  miqdor: ReadonlyMap<number, number>;
  /** Joriy oyning mavjud F2 qoralamasi qatorlari (yo'q bo'lsa bo'sh). */
  aktQatorlar: readonly AktBand[];
};

export type F2Asos = {
  manba: F2Manba;
  bolimlar: F2Bolim[];
  /** Saqlangan qoralama kiritmalari (hajm/narx/summa/narxsiz). */
  kSaqlangan: F2Kiritma;
  /** Varaqda F2 hajmi kiritiladigan qatorlar (ish, mustaqil resurs) — F2 tayyorlashdagi bilan bir xil to'plam. */
  tahrirIdlar: ReadonlySet<number>;
  zamenaKtx: F2ZamenaKontekst | null;
  /** Qoralamada storno bloki (pereraschet) bor — varaq tegmaydi, F2 tayyorlashda tahrirlanadi. */
  storno: boolean;
};

/** Qoralamada saqlangan hajm manbai (`raw_snapshot.hajmManba`); yo'q bo'lsa — fakt bor obyektda `fakt`, aks holda `smeta`. */
export function f2ManbaTanla(holat: readonly F2Holat[], aktQatorlar: readonly AktBand[]): F2Manba {
  const saqlangan = aktQatorlar.map((x) => (x.raw_snapshot as { hajmManba?: unknown } | null | undefined)?.hajmManba).find((m): m is F2Manba => m === 'fakt' || m === 'smeta');
  if (saqlangan) return saqlangan;
  const faktBor = holat.some((h) => h.fakt_hajm != null && Number(h.fakt_hajm) !== 0) || holat.some((h) => Number(h.f2_mumkin_hajm) > 0);
  return faktBor ? 'fakt' : 'smeta';
}

export function f2AsosQur(m: F2Manbalar): F2Asos {
  const manba = f2ManbaTanla(m.holat, m.aktQatorlar);
  // F2TayyorlashNative bilan bir xil: qoralamada fakt ≥ 0 qatorga minus hajm bor bo'lsa — ortiqcha F2 chegirmasi yoqiladi.
  const faktBy = new Map(m.holat.map((h) => [h.qator_id, h.fakt_hajm == null ? null : Number(h.fakt_hajm)]));
  const ortiqchaChegir = m.aktQatorlar.some((x) => { if (stornoQatorimi(x)) return false; const q = sonQ(x.certified_quantity) ?? sonQ(x.hajm); const f = faktBy.get(x.qator_id); return q != null && q < 0 && f != null && f >= 0; });
  const bolimlar = f2Qur([...m.rows], [...m.holat], m.protokolNarx, manba, m.qoralamaHajm, { chiqarilgan: m.chiqarilgan, zamenaAsl: m.zamenaAsl, ortiqchaChegir });
  const { k } = aktdanKiritma(m.aktQatorlar, bolimlar);
  const tahrir = new Set<number>();
  for (const b of bolimlar) {
    for (const i of b.ishlar) { tahrir.add(i.id); for (const r of i.resurslar) if (!r.avto && !r.chiqarilgan) tahrir.add(r.id); }
    for (const r of b.alohida) if (!r.chiqarilgan) tahrir.add(r.id);
  }
  const zamenaKtx: F2ZamenaKontekst | null = m.zamenaAsl.size
    ? (() => {
      const oldingi = new Map<number, number>(); const serverAlm = new Map<number, number>();
      for (const h of m.holat) {
        const f2 = Number(h.f2_hajm ?? 0); if (Number.isFinite(f2) && f2 !== 0) oldingi.set(h.qator_id, f2);
        const a = Number((h as F2Holat & { almashtirilgan_hajm?: number | null }).almashtirilgan_hajm ?? 0); if (Number.isFinite(a) && a > 0) serverAlm.set(h.qator_id, a);
      }
      return { rows: m.rows.map((r) => ({ id: r.id, ota_id: r.ota_id ?? null, tur: r.tur, birlik: r.birlik, hajm: r.hajm == null ? null : Number(r.hajm) })), zamenaAsl: m.zamenaAsl, miqdor: m.miqdor, oldingi, serverAlm };
    })()
    : null;
  return { manba, bolimlar, kSaqlangan: k, tahrirIdlar: tahrir, zamenaKtx, storno: m.aktQatorlar.some(stornoQatorimi) };
}

/** Saqlangan qoralama hajmi (matn) — katakning boshlang'ich qiymati. Yo'q — ''. */
export const f2SaqlanganMatn = (asos: Pick<F2Asos, 'kSaqlangan'>, id: number): string => asos.kSaqlangan.hajm[id] ?? '';

/**
 * Foydalanuvchi o'zgarishini (id → matn; '' = qoralamadan olib tashlash) saqlangan kiritmaga qo'yadi.
 * Saqlangan qiymatga teng yozuv o'zgarish emas.
 */
export function f2Ozgarishlar(asos: Pick<F2Asos, 'kSaqlangan'>, matnlar: Readonly<Record<number, string>>): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [id, v] of Object.entries(matnlar)) {
    const t = v.trim();
    if (t === f2SaqlanganMatn(asos, Number(id))) continue;
    out[Number(id)] = t;
  }
  return out;
}

export function f2Kiritma(asos: Pick<F2Asos, 'kSaqlangan'>, ozgarish: Readonly<Record<number, string>>): F2Kiritma {
  const hajm = { ...asos.kSaqlangan.hajm };
  for (const [id, v] of Object.entries(ozgarish)) { if (v === '') delete hajm[Number(id)]; else hajm[Number(id)] = v; }
  return { ...asos.kSaqlangan, hajm };
}

export type F2Hisob = {
  k: F2Kiritma; qatorlar: F2Qator[]; byId: ReadonlyMap<number, F2Qator>; yuk: F2NativePayloadRow[];
  jami: F2Jami; kesim: KatKesim; xatoSoni: number;
};

/** Qoralama qatorlari (kiritmalardan): mavjud F2 zanjiri — narx qoidasi shu yerda emas, `f2Qur`/`f2Qatorlar` ichida. */
export function f2Hisobla(asos: Pick<F2Asos, 'bolimlar' | 'zamenaKtx' | 'manba'>, k: F2Kiritma, raqam: string): F2Hisob {
  const xom = f2Qatorlar(asos.bolimlar, k);
  const qatorlar = f2ZamenaQolla(xom, asos.bolimlar, k, asos.zamenaKtx).qatorlar;
  return { k, qatorlar, byId: new Map(qatorlar.map((x) => [x.id, x])), yuk: f2Yuk(qatorlar, raqam, asos.manba), jami: f2Jami(qatorlar), kesim: f2KatKesim(qatorlar), xatoSoni: qatorlar.filter((x) => x.xato).length };
}

/** Katak kiritmasi (matn) yaroqlimi: son (minus mumkin); 0 va son bo'lmagan — xato. Bo'sh — o'chirish (xato emas). */
export function f2MatnXatomi(matn: string): boolean {
  const t = matn.trim();
  if (!t) return false;
  const v = sonOqi(t);
  return v === 'xato' || v === 0;
}

/**
 * Ogohlantirish (BLOKLAMAYDI — egasi qoidasi: hajm bloklanmaydi): shu qatorning jami F2 si (tasdiqlangan + shu qoralama) fakt yoki
 * smetadan oshsa. Taqqoslash faqat hajm bo'yicha; pul/narx yo'q.
 */
export function f2Ogoh(o: { tasdiqlangan: number | null | undefined; qoralama: number | null; fakt: number | null | undefined; smeta: number | null | undefined }): { faktdanOshdi: boolean; smetadanOshdi: boolean } {
  if (o.qoralama == null || !Number.isFinite(o.qoralama) || o.qoralama === 0) return { faktdanOshdi: false, smetadanOshdi: false };
  const jami = Number(o.tasdiqlangan ?? 0) + o.qoralama;
  const eps = 1e-9;
  const sm = o.smeta == null ? null : Number(o.smeta);
  const fk = o.fakt == null ? null : Number(o.fakt);
  return {
    faktdanOshdi: fk != null && (sm != null && sm < 0 ? jami < fk - eps : jami > fk + eps),
    smetadanOshdi: sm != null && (sm < 0 ? jami < sm - eps : jami > sm + eps),
  };
}

/** Qoralama hajmi (son) — kiritilgan matndan yoki saqlanganidan; yo'q/xato — null. */
export function f2Son(matn: string | undefined): number | null {
  if (matn == null) return null;
  const v = sonOqi(matn);
  return typeof v === 'number' ? v : null;
}

export { sonMatn };
