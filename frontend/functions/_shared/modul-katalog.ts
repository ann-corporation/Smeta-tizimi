/**
 * MOBIL MODUL KATALOGI (Android "Barcha modullar") — SERVER-DRIVEN, sof mantiq (tarmoqsiz, Pages turlarisiz).
 *
 * Yagona manba — sahifa reestri (src/lib/reestr/sahifa.ts) va uning menyu filtri (src/lib/nav/navFiltr.ts `menyuQur`):
 * veb yon menyu nimani ko'rsatsa, ilova ham AYNAN shuni oladi (ruxsat, kompaniya moduli, rol yopiqligi, superadmin qatlami).
 * Ikkinchi ro'yxat yo'q; `native` — ilovada tayyor native ekran bor sahifalar jadvali (NATIVE_YOL), qolgani ilova ichidagi veb
 * konteynerda ochiladi (/api/mobil/web-bilet → web-kirish). Bu faqat KO'RINISH: sahifani server va RuxsatGuard baribir qo'riqlaydi.
 */
import type { Modul } from '../../src/lib/modul-tur';
import { menyuQur } from '../../src/lib/nav/navFiltr';
import { tanlovFiltr } from '../../src/lib/modullarim/modullarim';
import { NAV_GURUH_META, SAHIFALAR } from '../../src/lib/reestr/sahifa';
import nomlar from './katalog-nom.json';

export const KATALOG_VERSIYA = 1;

/**
 * Veb yo'l -> ilovadagi native ekran kodi (Android core/data/Modules.kt ModuleCatalog kodlari bilan bir xil).
 * Faqat HAQIQATAN native ekrani bor sahifalar; yangi native ekran tayyor bo'lsa shu yerga bitta qator qo'shiladi.
 * (Native-only kirish nuqtalari — Jarvis, Tasdiq, Bugun, Ombor — sahifa reestrida yo'q; ular ilovaning o'z uyasida.)
 */
export const NATIVE_YOL: Readonly<Record<string, string>> = {
  '/admin/obyektlar': 'obyektlar',
  '/admin/fakt': 'fakt',
  '/admin/foto': 'foto',
  '/admin/dashboard': 'rahbar',
  '/admin/zayavka': 'zayavka',
};

type Til3 = { uz: string; ru: string; en: string };
const NOM = nomlar as Record<string, { ru?: string; en?: string }>;
/** O'zbekcha reestr nomi -> uz/ru/en. Tarjima topilmasa o'zbekcha ko'rinadi (veb `t()` bilan bir xil qoida). */
export const nomUch = (uz: string): Til3 => ({ uz, ru: NOM[uz]?.ru ?? uz, en: NOM[uz]?.en ?? uz });

export type KatalogGuruh = { id: string; nom: Til3; ikonka: string; qatlam: string };
export type KatalogBand = {
  /** Reestr kaliti ('smeta-studio'). Yagona. */
  id: string; nom: Til3; guruh: string; band: Til3; ikonka: string; yol: string;
  /** Native ekran kodi yoki null (veb konteynerda ochiladi). */
  native: string | null;
  /** Foydalanuvchi o'zi tanlagan ilovalar (pin) ichidami; tanlov yo'q bo'lsa hammasi true. Faqat ko'rsatma: ruxsat bermaydi. */
  tanlangan: boolean;
  holat: 'tayyor' | 'beta' | 'texnik';
  qoshimcha: boolean;
};
export type Katalog = { ok: true; versiya: number; kompaniya_id: number | null; rol: string; guruhlar: KatalogGuruh[]; sahifalar: KatalogBand[] };

export type KatalogKirish = {
  superadmin: boolean;
  /** Joriy kompaniyadagi effektiv rol ('' — kompaniya tanlanmagan). */
  rol: string;
  permissions: readonly string[] | null;
  /** Kompaniya o'chirgan modul kodlari (module.moliya ...). */
  modullarOff: readonly string[];
  /** Foydalanuvchi tanlagan ilova kodlari (/api/modullarim). */
  tanlangan?: readonly string[] | null;
  tizimXaritasi?: boolean;
  kompaniyaId: number | null;
};

const SAH = new Map(SAHIFALAR.map((s) => [s.yol, s]));
const GURUH = new Map(NAV_GURUH_META.map((g) => [g.id, g]));

export function katalogQur(k: KatalogKirish): Katalog {
  const modullar: Modul[] = k.modullarOff.map((kod) => ({ kod, nom: kod, izoh: null, holat: 'off', manba: 'kompaniya', versiya: 0 }));
  const tanlov = tanlovFiltr(k.tanlangan ?? null);
  const menyu = menyuQur({
    superadmin: k.superadmin, rol: k.rol, permissions: k.permissions, modullar, tizimXaritasi: k.tizimXaritasi ?? k.superadmin,
    ilova: 'hammasi', qoshimcha: 'hammasi',
  });
  const guruhlar: KatalogGuruh[] = [];
  const sahifalar: KatalogBand[] = [];
  const korilgan = new Set<string>();
  for (const g of menyu) {
    guruhlar.push({ id: g.id, nom: nomUch(GURUH.get(g.id)?.nom ?? g.nom), ikonka: g.ikonka, qatlam: g.qatlam });
    for (const b of g.bandlar) {
      const yollar = b.tablar ? b.tablar : [{ yol: b.yol, nom: b.nom }];
      for (const t of yollar) {
        const s = SAH.get(t.yol);
        if (!s || korilgan.has(s.kalit)) continue; // bir sahifa ikki bandda takrorlanmasin
        korilgan.add(s.kalit);
        sahifalar.push({
          id: s.kalit, nom: nomUch(s.nom), guruh: g.id, band: nomUch(s.navBand), ikonka: b.ikonka, yol: s.yol,
          native: NATIVE_YOL[s.yol] ?? null, tanlangan: tanlov ? tanlov(s.yol) : true, holat: s.holat, qoshimcha: !!s.qoshimcha,
        });
      }
    }
  }
  return { ok: true, versiya: KATALOG_VERSIYA, kompaniya_id: k.kompaniyaId, rol: k.rol, guruhlar, sahifalar };
}
