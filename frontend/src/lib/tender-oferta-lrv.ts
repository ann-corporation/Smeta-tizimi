/**
 * Oferta uchun LRV — F2 (Forma-2) shaklida (egasi talabi 2026-10-08: "oferta qilishda tizim faqat RES beradi, LRV ni ham
 * xuddi F2 day formatda faqat oferta uchun tayyorlab bera olishi kerak").
 *
 * Manba: oferta faylining o'zidagi LRV varag'i (smeta anatomiyasi — to'liq РАЗДЕЛ ierarxiyasi, ish → resurs). Har resursga
 * RES dan hisoblangan oferta narxi (pudratchi birlik narxi) qo'yiladi; summa, ish va bo'lim jamilari — F2 yozuvchisining
 * jonli formulalari (`lrvPlusFaylBaytlari`, rejim `forma2`). Asl fayl o'zgartirilmaydi (yangi hujjat).
 * Narx topilmagan resurs — faqat o'zi bo'sh qoladi va hujjatdagi ro'yxatga tushadi (jamilar ko'rinadi).
 */
import type { T2Qator } from '../api/supabase';
import type { AktNode } from './f2-match-engine/types';
import type { OfertaQatorNatija } from './tender-oferta';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { mashinistMehnati } from './narx-bildirishnoma';
import { lrvDaraxti } from './smeta-anatomiya/yuklash';
import { lrvPlusFaylBaytlari } from './lrv-plus-export';
import { bugunSana, hujjatFaylNomi } from './hujjat-yozuvchi';
import type { SheetGrid } from './f2-import-parse/types';

// LRV va RES bir resursni turli qavsda yozadi: '/ОБЩ.ВЕС-7,49КГ/' ↔ '(ОБЩ.ВЕС-7,49КГ)' — qavs/slash/qo'shtirnoq e'tiborsiz.
const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[()[\]{}/\\«»"'`]/g, ' ').replace(/\s+/g, ' ').trim();
const birlikNorm = (s: string | null | undefined) => norm(s).replace(/[.\s-]/g, '');

export type OfertaLrvNatija = {
  qatorlar: T2Qator[];
  resurslar: number;
  narxlandi: number;
  /** Oferta narxi topilmagan resurslar (nom, birlik). */
  topilmadi: Array<{ nom: string; birlik: string }>;
  /** БЕЗСКЛАД kategoriyali resurs bor — LRV nakrutka jadvalida bu tur yo'q (oferta svodida bor). */
  bezSkladBor: boolean;
};

type Narx = { narx: number; kat: string | null };

/** RES natijalaridan oferta narxlari: kod+nom+birlik, keyin nom+birlik (bir xil kalitda birinchi narx). */
function narxXaritasi(natijalar: readonly OfertaQatorNatija[]) {
  const toliq = new Map<string, Narx>();
  const nomBirlik = new Map<string, Narx>();
  for (const q of natijalar) {
    if (q.rol !== 'RESOURCE' || q.pudratchiBirlikNarx == null) continue;
    const kat = q.samaraliKategoriya && q.samaraliKategoriya !== 'UNKNOWN' ? q.samaraliKategoriya : null;
    const v = { narx: q.pudratchiBirlikNarx, kat };
    const k2 = `${norm(q.nom)}|${birlikNorm(q.birlik)}`;
    if (q.shifr) { const k1 = `${norm(q.shifr)}|${k2}`; if (!toliq.has(k1)) toliq.set(k1, v); }
    if (!nomBirlik.has(k2)) nomBirlik.set(k2, v);
  }
  return (kod: string | undefined, nom: string | undefined, birlik: string | undefined): Narx | null => {
    const k2 = `${norm(nom)}|${birlikNorm(birlik)}`;
    return (kod ? toliq.get(`${norm(kod)}|${k2}`) : undefined) ?? nomBirlik.get(k2) ?? null;
  };
}

const RESURS = new Set(['rs', 'mat', 'ob']);
const KATLAR = new Set(['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'М/К', 'КАБ', 'БЕЗСКЛАД']);

export function ofertaLrvQatorlari(tree: readonly AktNode[], natijalar: readonly OfertaQatorNatija[], obyektNomi: string): OfertaLrvNatija {
  const topNarx = narxXaritasi(natijalar);
  const qatorlar: T2Qator[] = [];
  const topilmadi: OfertaLrvNatija['topilmadi'] = [];
  let id = 0, resurslar = 0, narxlandi = 0, bezSkladBor = false;
  const yur = (nodes: readonly AktNode[], ota: number | null, daraja: number) => {
    for (const n of nodes) {
      const tur = n.type === 'rz' || n.type === 'bl' || RESURS.has(n.type) ? n.type : 'rs';
      const qid = ++id;
      let narx: number | null = null;
      let kat: string | null = null;
      if (RESURS.has(tur)) {
        resurslar++;
        const t = topNarx(n.kod, n.nom, n.bir);
        if (t) { narx = t.narx; kat = t.kat; narxlandi++; if (kat === 'БЕЗСКЛАД') bezSkladBor = true; }
        else if (!mashinistMehnati({ nom: n.nom })) topilmadi.push({ nom: n.nom ?? '', birlik: n.bir ?? '' });
      }
      const norma = (n as AktNode & { norma?: number }).norma;
      qatorlar.push({
        id: qid, obyekt_id: 0, obyekt: obyektNomi, kompaniya_id: 0, ota_id: ota, daraja, tartib: qid, tur,
        kod: n.kod ?? null, nom: n.nom ?? null, birlik: n.bir ?? null,
        hajm: n.hajm ?? null, narx, summa: null,
        kat: kat && KATLAR.has(kat) ? kat : null,
        narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null,
        xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null,
        norma: tur === 'rs' && typeof norma === 'number' ? norma : null,
      } as T2Qator);
      if (n.children?.length) yur(n.children, qid, daraja + 1);
    }
  };
  yur(tree, null, 0);
  return { qatorlar, resurslar, narxlandi, topilmadi, bezSkladBor };
}

export type OfertaLrvHujjat = OfertaLrvNatija & { bytes: Uint8Array; faylNomi: string; togridanJami: number };

/**
 * Oferta faylining LRV varag'idan F2 shaklidagi oferta LRV hujjati. LRV varag'i yo'q yoki anatomiya uni tanimasa — null
 * (oferta RES bilan davom etadi). `nk` — oferta hisobidagi koeffitsientlar (nakrutka jadvali; БЕЗСКЛАД bo'lsa qo'yilmaydi:
 * LRV nakrutka jadvalida bu tur yo'q — oferta svodidagi yakuniy summa asosiy).
 */
export async function ofertaLrvHujjati(o: {
  lrvVaraqNomi: string; rows: SheetGrid; natijalar: readonly OfertaQatorNatija[]; obyektNomi: string;
  nk: NakrutkaKoeffitsientlar; imzo?: { zakazchik?: string; pudratchi?: string }; sana?: string;
}): Promise<OfertaLrvHujjat | null> {
  const d = lrvDaraxti(o.lrvVaraqNomi, o.rows);
  if (!d.anatomiya || !d.tree.length) return null;
  const r = ofertaLrvQatorlari(d.tree, o.natijalar, o.obyektNomi);
  if (!r.resurslar) return null;
  const sana = o.sana ?? bugunSana();
  const bytes = await lrvPlusFaylBaytlari(r.qatorlar, o.obyektNomi, [], {
    rejim: 'forma2',
    sarlavha: `ЛРВ ОФЕРТЫ (форма 2) — ${o.obyektNomi}`,
    davr: sana,
    buyurtmachi: o.imzo?.zakazchik || undefined,
    pudratchi: o.imzo?.pudratchi || undefined,
    ...(r.bezSkladBor ? {} : { nakrutka: o.nk }),
  });
  const togridanJami = Math.round(r.qatorlar.reduce((s, q) => s + (RESURS.has(q.tur ?? '') && q.narx != null && q.hajm != null ? q.hajm * q.narx : 0), 0) * 100) / 100;
  return { ...r, bytes, togridanJami, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ЛРВ_ОФЕРТЫ_Ф-2', davr: sana }) };
}
