/**
 * Hujjatlar paketi: Diskdagi F-2 DAN BOSHQA hujjatlar (F-3, nakopitelniy, M-29, slichitelniy, ostatka) eskirganmi - TOZA mantiq.
 * Ro'yxat RPC si (`t2_hujjat_paket_royxat_v1`) navbat holatini faqat F-2 uchun qo'shadi; boshqa turlarda Diskdagi eskirgan versiya jim berilardi.
 * Bu yerda navbat qatorining `manba_id` si (SQL 20270119000501 bilan bir xil kodlash) nomzoddan hisoblanadi va navbat holati bo'yicha
 * `yangilanmoqda` belgisi qo'yiladi: paket uni «eskirgan» deb ko'rsatadi (hech narsa jim tashlanmaydi), fon yangilash esa o'z ishini qiladi.
 */
import type { Nomzod } from './nomzod';

/** Navbatda `manba_id` kodlangan turlar. */
export const NAVBAT_TURLARI: readonly string[] = ['forma3', 'nakopitelniy', 'm29', 'slichitelniy', 'ostatka'];

/** nakopitelniy/m29 = obyekt*1e6 + YYYYMM; slichitelniy/ostatka = obyekt; forma3 = forma3 id. Hisoblab bo'lmasa null. */
export function navbatManbaId(n: Pick<Nomzod, 'tur' | 'obyekt_id' | 'oy' | 'forma3_id'>): number | null {
  switch (n.tur) {
    case 'forma3': return n.forma3_id != null && n.forma3_id > 0 ? n.forma3_id : null;
    case 'slichitelniy': case 'ostatka': return n.obyekt_id != null && n.obyekt_id > 0 ? n.obyekt_id : null;
    case 'nakopitelniy': case 'm29': {
      const oy = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(n.oy ?? '');
      return oy && n.obyekt_id != null && n.obyekt_id > 0 ? n.obyekt_id * 1_000_000 + Number(oy[1] + oy[2]) : null;
    }
    default: return null;
  }
}

/** Navbat holatini so'rash rejasi: tur -> manba_id lar (faqat Diskda fayli bor, boshqa tur hujjatlar). Takrorsiz, tur boshiga <= 500. */
export function navbatSorovlari(nomzodlar: ReadonlyArray<Pick<Nomzod, 'tur' | 'obyekt_id' | 'oy' | 'forma3_id' | 'fayl_id'>>): Map<string, number[]> {
  const m = new Map<string, Set<number>>();
  for (const n of nomzodlar) {
    if (n.fayl_id == null || !NAVBAT_TURLARI.includes(n.tur)) continue;
    const id = navbatManbaId(n);
    if (id == null) continue;
    let s = m.get(n.tur); if (!s) { s = new Set(); m.set(n.tur, s); }
    if (s.size < 500) s.add(id);
  }
  return new Map([...m].map(([t, s]) => [t, [...s]]));
}

type TayyorlaNomzod = Pick<Nomzod, 'kalit' | 'tur' | 'obyekt_id' | 'oy' | 'forma3_id' | 'fayl_id' | 'akt_id' | 'taxminiy' | 'takror'> & { yangilanmoqda?: boolean; navbat_holat?: string | null };

/**
 * Oldindan tayyorlash (egasi 2026-11-21): paketdan oldin qaysi hujjatlar Diskda eskirgan/yo'q. F-2: Diskda yo'q yoki fonda yangilanmoqda;
 * boshqa turlar: faqat yangilanmoqda (yo'qlari yuklab olishda yasaladi). Takror/taxminiy qoida bilan tashlanadi. `navbat_holat='xato'` (6 urinishdan keyin)
 * bu yerda sanalmaydi: ularni yuklab olish yo'li yasaydi.
 */
export function tayyorlashKerak<T extends TayyorlaNomzod>(nomzodlar: readonly T[], tanlov?: ReadonlySet<string> | null): T[] {
  return nomzodlar.filter((n) => {
    if (n.takror || n.taxminiy || (tanlov && !tanlov.has(n.kalit))) return false;
    if (n.navbat_holat === 'xato') return false;
    if (n.tur === 'f2') return n.fayl_id == null || n.yangilanmoqda === true;
    return NAVBAT_TURLARI.includes(n.tur) && n.fayl_id != null && n.yangilanmoqda === true;
  });
}

/** `t2_hujjat_yangila_tezlat_v1` so'rovlari: tur -> manba_id lar (F-2: akt id; boshqalar: navbat kodi). */
export function tezlatSorovlari(kerak: readonly TayyorlaNomzod[]): Map<string, number[]> {
  const m = new Map<string, Set<number>>();
  for (const n of kerak) {
    const id = n.tur === 'f2' ? n.akt_id : navbatManbaId(n);
    if (id == null) continue;
    let s = m.get(n.tur); if (!s) { s = new Set(); m.set(n.tur, s); }
    if (s.size < 500) s.add(id);
  }
  return new Map([...m].map(([t, s]) => [t, [...s]]));
}

/** Navbatda kutayotgan/ishlanayotgan hujjatga `yangilanmoqda` qo'yadi (o'zgartirmaydi - yangi massiv). `holat`: tur -> (manba_id -> navbat holati). */
export function eskirganBelgila<T extends Pick<Nomzod, 'tur' | 'obyekt_id' | 'oy' | 'forma3_id' | 'fayl_id'>>(nomzodlar: readonly T[], holat: ReadonlyMap<string, ReadonlyMap<number, string>>): Array<T & { yangilanmoqda?: boolean; navbat_holat?: string }> {
  return nomzodlar.map((n) => {
    if (n.fayl_id == null || !NAVBAT_TURLARI.includes(n.tur)) return n;
    const id = navbatManbaId(n);
    const h = id == null ? undefined : holat.get(n.tur)?.get(id);
    if (!h) return n;
    return { ...n, navbat_holat: h, yangilanmoqda: h === 'kutmoqda' || h === 'ishlanmoqda' };
  });
}
