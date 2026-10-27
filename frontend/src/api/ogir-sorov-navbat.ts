/**
 * Og'ir so'rovlar navbati (prod 2026-10-27: katta obyektda Nakopitelniy sahifalari bilan bir vaqtda
 * `t2_pul_tahlil_v2` / `t2_akt_reestr` ham yuborilib, kichik DB instansi CPU ga to'yinib 30 s timeout berdi).
 * Nakopitelniy to'liq yuklanayotganda boshqa og'ir o'qishlar shu yuklash tugashini kutadi
 * (ko'pi bilan `maksMs` — hech narsa abadiy osilib qolmaydi). Yuklash yo'q bo'lsa — kutish yo'q.
 */
let faol = 0;
let kutuvchilar: Array<() => void> = [];

/** Og'ir yuklash boshlandi; qaytgan funksiya — tugadi (takror chaqirish xavfsiz). */
export function ogirYuklashBoshla(): () => void {
  faol++;
  let tugadi = false;
  return () => {
    if (tugadi) return;
    tugadi = true;
    faol = Math.max(0, faol - 1);
    if (faol === 0) {
      const k = kutuvchilar;
      kutuvchilar = [];
      for (const f of k) f();
    }
  };
}

/** Faol og'ir yuklash bo'lsa — tugashini (yoki `maksMs`) kutadi. */
export function ogirYuklashKut(maksMs = 60_000): Promise<void> {
  if (faol === 0) return Promise.resolve();
  return new Promise((res) => {
    let taymer: ReturnType<typeof setTimeout> | undefined;
    const f = () => { if (taymer) clearTimeout(taymer); res(); };
    kutuvchilar.push(f);
    taymer = setTimeout(() => { kutuvchilar = kutuvchilar.filter((x) => x !== f); res(); }, maksMs);
  });
}

/** Faqat testlar uchun. */
export function ogirYuklashFaol(): number { return faol; }
