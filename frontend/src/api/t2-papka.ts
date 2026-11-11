import { sbOqi } from './supabase';

/* ⚡ 2026-08-28 (Claude). Foydalanuvchi: «har bir tashkilot, uni ichida
 * obyekt, ichida turiga ko'ra hujjat ochilganida drive da va mindmapda
 * o'zini tartibidagi folderlar va mindmap yasashi kerak — hozir hammasi
 * pala-partish tashlanaveradi».
 *
 * ⚠️ MUHIM: Drive papkalari va mindmap tugunlari BITTA manbadan —
 * `t2_hujjat_turi` katalogidan — o'qiladi. Ikkalasi uchun alohida ro'yxat
 * yozilsa, ular vaqt o'tib ajralib ketardi (Drive'da bir tartib,
 * ekranda boshqa) va odam qaysi biri to'g'ri ekanini bilmasdi.
 *
 * Tuzilma:
 *     [Kompaniya] → [Loyiha] → [Obyekt] → 01_Smeta … 08_Boshqa
 * Loyiha ixtiyoriy — bo'lmasa bu daraja tushib qoladi.
 */

export type HujjatTuri = {
  kod: string;
  nom: string;
  /** Drive papka nomi — raqamli prefiks bilan (Drive alifbo bo'yicha saralaydi). */
  papka: string;
  tartib: number;
  ikonka: string | null;
  izoh: string | null;
};

export type PapkaTuri = {
  kod: string; nom: string; papka: string; tartib: number;
  ikonka: string | null;
  /** Drive'da hali yaratilmagan bo'lsa `null`. */
  drive_id: string | null;
  hujjat_soni: number;
};

export type PapkaDaraxt = {
  kompaniya_id: number; kompaniya_nom: string;
  loyiha_id: number | null; loyiha_nom: string | null;
  obyekt_id: number; obyekt_nom: string;
  obyekt_drive_id: string | null;
  turlar: PapkaTuri[];
};

/** Hujjat turlari katalogi — mindmap tugun tartibi shundan. */
export function sbHujjatTurlariOl() {
  return sbOqi<HujjatTuri>({
    jadval: 't2_hujjat_turi', tartib: 'tartib.asc', limit: 50,
  });
}

/**
 * Mindmap uchun to'liq daraxt: kompaniya → loyiha → obyekt → hujjat turi.
 * Har turda nechta hujjat borligi ham qaytadi (bo'sh papka ko'rinib tursin —
 * yashirilsa odam "hujjat yo'q" bilan "papka yo'q" ni ajrata olmaydi).
 */
export function sbPapkaDaraxtOl(kompaniyaId: number) {
  return sbOqi<PapkaDaraxt>({
    jadval: 't2_papka_daraxt',
    filtr: 'kompaniya_id=eq.' + kompaniyaId,
    tartib: 'obyekt_nom.asc',
    limit: 2000,
  });
}

/** Bitta obyektning papka tuzilmasi. */
export function sbObyektPapkaOl(obyektId: number) {
  return sbOqi<PapkaDaraxt>({
    jadval: 't2_papka_daraxt',
    filtr: 'obyekt_id=eq.' + obyektId,
    limit: 1,
  });
}

/**
 * Mindmap tugunlariga o'giradi: loyiha bo'yicha guruhlangan daraxt.
 *
 * Loyihasiz obyektlar ATAYLAB yashirilmaydi — ular `loyiha_id: null`
 * guruhida ko'rinadi. Yashirilsa, obyekt "yo'qolgandek" tuyulardi,
 * holbuki u shunchaki loyihaga biriktirilmagan.
 */
export type XaritaTugun = {
  kalit: string;
  tur: 'loyiha' | 'obyekt' | 'papka';
  nom: string;
  /** Drive'da ochish uchun; yaratilmagan bo'lsa null. */
  driveId: string | null;
  soni?: number;
  bolalar: XaritaTugun[];
};

export function papkaXaritaQur(qatorlar: PapkaDaraxt[]): XaritaTugun[] {
  const loyihalar = new Map<string, XaritaTugun>();

  for (const r of qatorlar) {
    const lKalit = r.loyiha_id == null ? 'loyihasiz' : 'l' + r.loyiha_id;
    let l = loyihalar.get(lKalit);
    if (!l) {
      l = {
        kalit: lKalit, tur: 'loyiha',
        nom: r.loyiha_nom ?? 'Loyihaga biriktirilmagan',
        driveId: null, bolalar: [],
      };
      loyihalar.set(lKalit, l);
    }

    l.bolalar.push({
      kalit: 'o' + r.obyekt_id, tur: 'obyekt', nom: r.obyekt_nom,
      driveId: r.obyekt_drive_id,
      bolalar: (r.turlar ?? []).map((t) => ({
        kalit: 'o' + r.obyekt_id + ':' + t.kod,
        tur: 'papka' as const,
        nom: t.nom,
        driveId: t.drive_id,
        soni: t.hujjat_soni,
        bolalar: [],
      })),
    });
  }

  /* Loyihasiz guruh oxirida tursin — u "qoldiq", asosiy narsa emas */
  return [...loyihalar.values()].sort((a, b) =>
    a.kalit === 'loyihasiz' ? 1 : b.kalit === 'loyihasiz' ? -1
      : a.nom.localeCompare(b.nom));
}
