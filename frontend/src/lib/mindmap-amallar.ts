/**
 * Mindmap tugun AMALLARI reestri (A1 — «mindmap boshqaruv markazi», 1-bosqich).
 *
 * Tugundan to‘g‘ridan-to‘g‘ri amal: tugun turiga qarab menyu. BITTA deklarativ ro‘yxat (`AMALLAR`) — komponentlarda
 * tur bo‘yicha alohida switch yo‘q. Har amal faqat MAVJUD sahifa yoki buyruqqa olib boradi:
 *   • `yol`   — kanonik sahifaga o‘tish (lib/mindmap-yollar); ko‘rinish ruxsati — yagona navigatsiya reestridan
 *               (lib/nav: menyu qaysi sahifani ko‘rsatsa, menyu ham shuni ochiq ko‘rsatadi);
 *   • `modal` — mavjud server buyrug‘i (`sbMindmapMasul` → t2_mindmap_masul_v1, `topshiriqBer` → t2_topshiriq_ber_v1):
 *               ruxsat va audit SERVERDA, UI faqat oldindan tushuntiradi;
 *   • `panel` — xaritaning o‘zidagi mavjud UI (tugunni tanlash, «Mas‘ullar» blokiga fokus).
 * Yangi biznes mantiq va yangi RPC yo‘q. Pul bilan bog‘liq amallar `pul=false` (moliyaviy ruxsat yo‘q) bo‘lsa — chiqmaydi.
 * Bu fayl SOF hisob (React yo‘q) — testlar to‘g‘ridan-to‘g‘ri tekshiradi.
 */
import { t } from '../i18n/til';
import { navSahifa } from './nav/navReestr';
import { sahifaKorinadi } from './nav/navFiltr';
import { AZOLAR_YOLI, SAHIFA_YOLI, obyektHolatYoli, obyektPtoYoli, obyektZayavkaYoli } from './mindmap-yollar';
import type { RuxsatKirish } from './mindmap-ruxsat';
import type { XTugun } from './mindmap-korinish';
import type { MindmapTugun } from '../api/t2-mindmap';
import { ROLE_PERMISSIONS, type CompanyMembershipRole } from './company-authorization/effective-authorization';

/** Menyu chiqadigan tugun turlari: xarita tugunlari (`XTur`) va panel ro‘yxatidagi resurslar (`TugunTur`). */
export type AmalTur =
  | 'kompaniya' | 'loyiha' | 'obyekt' | 'jamoa' | 'odam'
  | 'shartnoma' | 'sklad' | 'zayavka' | 'kontragent' | 'texnika' | 'kadr';

export type AmalBajar = 'yol' | 'modal' | 'panel' | 'pult';
export type AmalModal = 'masul' | 'vazifa';
/** `tanla` — tugunni tanlaydi (panelda ro‘yxat); `masul` — «Mas‘ullar» blokidagi biriktirish maydoniga fokus. */
export type AmalPanel = 'tanla' | 'masul';
export type AmalIkon =
  | 'gauge' | 'fakt' | 'f2' | 'tarix' | 'jamlanma' | 'yuklash' | 'zayavka' | 'yangi' | 'masul' | 'vazifa'
  | 'royxat' | 'loyiha' | 'hujjat' | 'shartnoma' | 'tolov' | 'sklad' | 'odamlar' | 'rol' | 'kontragent' | 'texnika' | 'kadr'
  /** Boshqaruv pulti amallari (lib/mindmap-pult): biriktirish / uzish / nomlash. */
  | 'ulash' | 'uzish' | 'nomlash';

/** Amal nishoni — menyu ochilgan tugun (yoki panel ro‘yxatidagi resurs). */
export type AmalNishon = {
  tur: AmalTur;
  /** Tugun id (`obyekt:5`, `foydalanuvchi:12`, `shartnoma:3` …). */
  id: string;
  /** Jadval id (`t2_obyekt.id`, `t2_loyiha.id`, …); noma’lum — `null`. */
  entityId: number | null;
  nom: string;
  /** Obyekt konteksti: obyekt tugunida — o‘zi; resurs qatorida — panel obyekti yoki yagona bog‘langan obyekt. */
  obyektId?: number | null;
  /** Odam: `t2_foydalanuvchi.id`. */
  foydalanuvchiId?: number | null;
  /** Obyekt/loyiha: «Mas‘ullar» bloki chiqadimi (server odamlarni yuborgan — v4). */
  masulBlok?: boolean;
};

/** Ko‘ruvchi konteksti — `amalKontekstiQur` bilan quriladi. */
export type AmalKontekst = {
  superadmin: boolean;
  /** Joriy kompaniyadagi effektiv rol ('' — tanlanmagan). */
  rol: string;
  /** Joriy kompaniya capability lari; `null` — eski `t2_men` (rolning frontend ko‘zgusi ishlatiladi). */
  permissions: readonly string[] | null;
  /** Xarita joriy kompaniyaniki emas — joriy kompaniya ruxsati u yerga tegishli emas. */
  boshqaKompaniya: boolean;
  /** Server `korinish.pul` (moliyaviy ruxsat). `false` — pul amallari chiqmaydi. */
  pul: boolean;
  /** `mindmapMasulRuxsati` natijasi. */
  masul: boolean;
};

export type AmalTarif = {
  kalit: string;
  tur: AmalTur;
  nom: () => string;
  ikon: AmalIkon;
  bajar: AmalBajar;
  /** Pul bilan bog‘liq (summalar, to‘lov, sverka) — `pul=false` bo‘lsa yashiriladi. */
  pul?: boolean;
  /** `yol`: manzil; `null` — nishonda kerakli id yo‘q (amal chiqmaydi). */
  yol?: (n: AmalNishon) => string | null;
  modal?: AmalModal;
  panel?: AmalPanel;
  /** Amal shu nishonda umuman mavjudmi (masalan odam id si yoki Mas‘ullar bloki yo‘q). Sukut — mavjud. */
  bor?: (n: AmalNishon) => boolean;
  /** Qo‘shimcha ruxsat: `null` — mumkin; matn — nega yopiq (tooltip). `yol` amallarida sahifa ruxsati avtomatik. */
  ruxsat?: (k: AmalKontekst) => string | null;
};

export type Amal = {
  kalit: string;
  nom: string;
  ikon: AmalIkon;
  bajar: AmalBajar;
  yol: string | null;
  modal: AmalModal | null;
  panel: AmalPanel | null;
  mumkin: boolean;
  /** Yopiq bo‘lsa — qisqa sabab (tooltip). */
  sabab: string | null;
  /** bajar === 'pult': lib/mindmap-pult amal kaliti (oldindan ko‘rish + tasdiq modali ochiladi). */
  pult?: string | null;
};

/* ───────────── Ruxsat yordamchilari ───────────── */

/** Ko‘ruvchi capability lari (eski javobda — rolning frontend ko‘zgusi, menyu filtri bilan bir xil). */
const sahifaKontekst = (k: AmalKontekst) => ({ superadmin: k.superadmin, rol: k.rol, permissions: k.permissions });

/** Sahifa menyuda shu ko‘ruvchiga ko‘rinadimi (yagona navigatsiya reestri; reestrda yo‘q yo‘l — yopiq). */
export function yolRuxsati(yol: string, k: AmalKontekst): boolean {
  const asos = yol.split('?')[0];
  const s = navSahifa(asos);
  return !!s && sahifaKorinadi(s.guruh, asos, sahifaKontekst(k));
}

/** Capability bormi (superadmin — ha; eski javob — rol ko‘zgusi orqali `sahifaKorinadi` bilan bir xil manba). */
function capabilityBor(k: AmalKontekst, kod: string): boolean {
  if (k.superadmin) return true;
  if (k.permissions) return k.permissions.includes(kod);
  // Eski javob: rolning frontend ko‘zgusi (navFiltr bilan bir xil manba).
  return ((ROLE_PERMISSIONS[k.rol as CompanyMembershipRole] ?? []) as readonly string[]).includes(kod);
}

const masulSababi = (k: AmalKontekst) => (k.masul ? null : t('Mas‘ul biriktirish uchun «A’zolarni boshqarish» ruxsati kerak.'));
/** Topshiriq berish: server `t2_topshiriq_ber_v1` `fakt.write` ni talab qiladi. */
export const VAZIFA_RUXSATI = 'fakt.write';
const vazifaSababi = (k: AmalKontekst) => (capabilityBor(k, VAZIFA_RUXSATI) ? null : t('Topshiriq berish uchun «Fakt kiritish» (fakt.write) ruxsati kerak.'));

const oid = (n: AmalNishon) => (n.entityId != null && n.entityId > 0 ? n.entityId : null);
/** Obyekt id (obyektning o‘zi yoki resurs konteksti). */
const kontekstObyekt = (n: AmalNishon) => (n.tur === 'obyekt' ? oid(n) : n.obyektId != null && n.obyektId > 0 ? n.obyektId : null);
const obyektli = (f: (id: number) => string) => (n: AmalNishon) => { const id = kontekstObyekt(n); return id == null ? null : f(id); };

/* ───────────── REESTR ───────────── */

export const AMALLAR: readonly AmalTarif[] = [
  // ── Obyekt ──
  { kalit: 'obyekt.holat', tur: 'obyekt', nom: () => t('Smeta va LRV (obyekt holati)'), ikon: 'gauge', bajar: 'yol', yol: (n) => { const id = oid(n); return id == null ? null : SAHIFA_YOLI.obyekt!(id, n.nom); } },
  { kalit: 'obyekt.fakt', tur: 'obyekt', nom: () => t('Fakt kiritish'), ikon: 'fakt', bajar: 'yol', yol: obyektli((id) => obyektPtoYoli('fakt', id)) },
  { kalit: 'obyekt.f2', tur: 'obyekt', nom: () => t('F2 tayyorlash'), ikon: 'f2', bajar: 'yol', yol: obyektli((id) => obyektPtoYoli('f2-tayyorlash', id)) },
  { kalit: 'obyekt.f2-tarix', tur: 'obyekt', nom: () => t('F2 tarixi va tasdiqlash'), ikon: 'tarix', bajar: 'yol', yol: obyektli((id) => obyektPtoYoli('f2-tarix', id)) },
  { kalit: 'obyekt.nakopitelniy', tur: 'obyekt', nom: () => t('Nakopitelniy va F3'), ikon: 'jamlanma', bajar: 'yol', pul: true, yol: obyektli((id) => obyektPtoYoli('nakopitelniy', id)) },
  { kalit: 'obyekt.smeta-yuklash', tur: 'obyekt', nom: () => t('Smeta yuklash va versiyalar'), ikon: 'yuklash', bajar: 'yol', yol: obyektli((id) => obyektHolatYoli(id, true)) },
  { kalit: 'obyekt.zayavkalar', tur: 'obyekt', nom: () => t('Zayavkalar'), ikon: 'zayavka', bajar: 'yol', yol: obyektli((id) => obyektZayavkaYoli(id)) },
  { kalit: 'obyekt.zayavka-yarat', tur: 'obyekt', nom: () => t('Zayavka yaratish'), ikon: 'yangi', bajar: 'yol', yol: obyektli((id) => obyektZayavkaYoli(id, true)) },
  { kalit: 'obyekt.masul', tur: 'obyekt', nom: () => t('Mas‘ul biriktirish'), ikon: 'masul', bajar: 'panel', panel: 'masul', bor: (n) => !!n.masulBlok && oid(n) != null, ruxsat: masulSababi },
  { kalit: 'obyekt.vazifa', tur: 'obyekt', nom: () => t('Topshiriq berish'), ikon: 'vazifa', bajar: 'modal', modal: 'vazifa', bor: (n) => oid(n) != null, ruxsat: vazifaSababi },

  // ── Loyiha ──
  { kalit: 'loyiha.obyektlar', tur: 'loyiha', nom: () => t('Obyektlarini ko‘rsatish'), ikon: 'royxat', bajar: 'panel', panel: 'tanla' },
  { kalit: 'loyiha.reestr', tur: 'loyiha', nom: () => t('Loyihalar sahifasi'), ikon: 'loyiha', bajar: 'yol', yol: (n) => SAHIFA_YOLI.loyiha!(oid(n) ?? 0, n.nom) },
  { kalit: 'loyiha.shartnomalar', tur: 'loyiha', nom: () => t('Shartnomalar va tomonlar'), ikon: 'shartnoma', bajar: 'yol', yol: (n) => SAHIFA_YOLI.shartnoma!(oid(n) ?? 0, n.nom) },
  { kalit: 'loyiha.hujjatlar', tur: 'loyiha', nom: () => t('Hujjatlar'), ikon: 'hujjat', bajar: 'yol', yol: () => '/admin/documents' },
  { kalit: 'loyiha.masul', tur: 'loyiha', nom: () => t('Mas‘ul biriktirish'), ikon: 'masul', bajar: 'panel', panel: 'masul', bor: (n) => !!n.masulBlok && oid(n) != null, ruxsat: masulSababi },

  // ── Odam (kompaniya a’zosi) ──
  { kalit: 'odam.masul', tur: 'odam', nom: () => t('Mas‘ul qilish…'), ikon: 'masul', bajar: 'modal', modal: 'masul', bor: (n) => n.foydalanuvchiId != null, ruxsat: masulSababi },
  { kalit: 'odam.vazifa', tur: 'odam', nom: () => t('Topshiriq berish…'), ikon: 'vazifa', bajar: 'modal', modal: 'vazifa', bor: (n) => n.foydalanuvchiId != null, ruxsat: vazifaSababi },
  { kalit: 'odam.obyektlar', tur: 'odam', nom: () => t('Mas‘ul bo‘lgan obyektlar'), ikon: 'royxat', bajar: 'panel', panel: 'tanla' },
  { kalit: 'odam.rol', tur: 'odam', nom: () => t('Rolni o‘zgartirish (A’zolar)'), ikon: 'rol', bajar: 'yol', yol: () => AZOLAR_YOLI, ruxsat: masulSababi },

  // ── Jamoa va kompaniya ──
  { kalit: 'jamoa.azolar', tur: 'jamoa', nom: () => t('Rolni o‘zgartirish (A’zolar)'), ikon: 'odamlar', bajar: 'yol', yol: () => AZOLAR_YOLI },
  { kalit: 'kompaniya.loyihalar', tur: 'kompaniya', nom: () => t('Loyihalar sahifasi'), ikon: 'loyiha', bajar: 'yol', yol: () => '/admin/loyiha' },
  { kalit: 'kompaniya.obyektlar', tur: 'kompaniya', nom: () => t('Obyektlar'), ikon: 'royxat', bajar: 'yol', yol: () => '/admin/obyektlar' },
  { kalit: 'kompaniya.topshiriqlar', tur: 'kompaniya', nom: () => t('Mening topshiriqlarim'), ikon: 'vazifa', bajar: 'yol', yol: () => '/admin/topshiriqlar' },

  // ── Resurslar (panel ro‘yxati) ──
  { kalit: 'shartnoma.ochish', tur: 'shartnoma', nom: () => t('Shartnomalar va tomonlar'), ikon: 'shartnoma', bajar: 'yol', yol: (n) => SAHIFA_YOLI.shartnoma!(oid(n) ?? 0, n.nom) },
  { kalit: 'shartnoma.sverka', tur: 'shartnoma', nom: () => t('To‘lov va akt-sverka (Nakopitelniy)'), ikon: 'jamlanma', bajar: 'yol', pul: true, yol: obyektli((id) => obyektPtoYoli('nakopitelniy', id)) },
  { kalit: 'shartnoma.tolov', tur: 'shartnoma', nom: () => t('To‘lovlar (Moliya)'), ikon: 'tolov', bajar: 'yol', pul: true, yol: () => '/admin/moliya' },
  { kalit: 'sklad.harakat', tur: 'sklad', nom: () => t('Prixod / rasxod (Ta’minot va sklad)'), ikon: 'sklad', bajar: 'yol', yol: (n) => SAHIFA_YOLI.sklad!(oid(n) ?? 0, n.nom) },
  { kalit: 'zayavka.ochish', tur: 'zayavka', nom: () => t('Zayavkani ochish'), ikon: 'zayavka', bajar: 'yol', yol: (n) => { const id = kontekstObyekt(n); return id == null ? SAHIFA_YOLI.zayavka!(0, n.nom) : obyektZayavkaYoli(id); } },
  { kalit: 'kontragent.ochish', tur: 'kontragent', nom: () => t('Kontragentlar (CRM)'), ikon: 'kontragent', bajar: 'yol', yol: (n) => SAHIFA_YOLI.kontragent!(oid(n) ?? 0, n.nom) },
  { kalit: 'texnika.ochish', tur: 'texnika', nom: () => t('Kadrlar va texnika'), ikon: 'texnika', bajar: 'yol', yol: (n) => SAHIFA_YOLI.texnika!(oid(n) ?? 0, n.nom) },
  { kalit: 'kadr.ochish', tur: 'kadr', nom: () => t('Kadrlar va texnika'), ikon: 'kadr', bajar: 'yol', yol: (n) => SAHIFA_YOLI.kadr!(oid(n) ?? 0, n.nom) },
];

/**
 * Nishon uchun ko‘ruvchiga chiqadigan amallar (reestr tartibida).
 * Yashiriladi: boshqa tur; nishonda kerakli id yo‘q; pul amali va `pul=false`.
 * Yopiq (ko‘rinadi, bosilmaydi, sabab bilan): sahifa ruxsati yo‘q, buyruq ruxsati yo‘q, boshqa kompaniya xaritasi.
 */
export function tugunAmallari(n: AmalNishon, k: AmalKontekst): Amal[] {
  const natija: Amal[] = [];
  for (const a of AMALLAR) {
    if (a.tur !== n.tur) continue;
    if (a.pul && !k.pul) continue;
    if (a.bor && !a.bor(n)) continue;
    const yol = a.bajar === 'yol' ? a.yol?.(n) ?? null : null;
    if (a.bajar === 'yol' && !yol) continue;
    let sabab: string | null = null;
    if (k.boshqaKompaniya && a.bajar !== 'panel') sabab = t('Faqat ko‘rish: bu xarita joriy kompaniyangiz emas.');
    else if (a.ruxsat) sabab = a.ruxsat(k);
    if (!sabab && yol && !yolRuxsati(yol, k)) sabab = t('Bu sahifaga ruxsatingiz yo‘q');
    natija.push({ kalit: a.kalit, nom: a.nom(), ikon: a.ikon, bajar: a.bajar, yol, modal: a.modal ?? null, panel: a.panel ?? null, mumkin: !sabab, sabab });
  }
  return natija;
}

/** Ko‘ruvchining sahifa konteksti (pul va mas‘ul ruxsatisiz — ular xarita ichida qo‘shiladi). */
export type AmalKorish = Omit<AmalKontekst, 'pul' | 'masul'>;

/** Ko‘ruvchi kontekstini `useKompaniya` qiymatlaridan quradi (mindmap-ruxsat bilan bir xil kirish). */
export function amalKorishQur(kirish: RuxsatKirish): AmalKorish {
  const j = kirish.joriy;
  return {
    superadmin: !!kirish.superadmin,
    rol: j?.rol ?? '',
    permissions: j?.permissions ?? null,
    boshqaKompaniya: !j || (kirish.kompaniyaId != null && kirish.kompaniyaId !== j.id),
  };
}

/** Xarita tugunidan nishon (`guruh` — loyihasiz obyektlar guruhi — amalsiz: `null`). */
export function tugunNishoni(x: XTugun, jamoaBor: boolean): AmalNishon | null {
  // Tizim xaritasi tugunlari (tizim / modul / platforma) — o'z paneli va havolalari bor; biznes amallari yo'q.
  if (x.tur === 'guruh' || x.tur === 'tizim' || x.tur === 'modul' || x.tur === 'platforma') return null;
  const n = Number(x.id.split(':')[1]);
  const entityId = x.manba?.entity_id ?? (Number.isSafeInteger(n) && n > 0 ? n : null);
  return {
    tur: x.tur, id: x.id, entityId, nom: x.nom,
    obyektId: x.tur === 'obyekt' ? entityId : null,
    foydalanuvchiId: x.tur === 'odam' ? x.odam?.sonId ?? null : null,
    masulBlok: jamoaBor && !!x.manba && (x.tur === 'obyekt' || x.tur === 'loyiha'),
  };
}

const RESURS_TURLARI: readonly AmalTur[] = ['shartnoma', 'sklad', 'zayavka', 'kontragent', 'texnika', 'kadr'];

/** Panel ro‘yxatidagi resurs (shartnoma, sklad …) dan nishon. `obyektId` — panel obyekti; berilmasa shartnomaning
 *  yagona bog‘langan obyekti (bir nechta bo‘lsa — obyektga bog‘liq amal chiqmaydi, taxmin qilinmaydi). */
export function resursNishoni(r: MindmapTugun, obyektId?: number | null): AmalNishon | null {
  if (!RESURS_TURLARI.includes(r.tur as AmalTur)) return null;
  const n = Number(r.id.split(':')[1]);
  const idlar = Array.isArray(r.meta?.obyekt_idlar) ? (r.meta.obyekt_idlar as unknown[]).map(Number).filter((v) => Number.isSafeInteger(v) && v > 0) : [];
  return {
    tur: r.tur as AmalTur, id: r.id, nom: r.nom,
    entityId: r.entity_id ?? (Number.isSafeInteger(n) && n > 0 ? n : null),
    obyektId: obyektId ?? (idlar.length === 1 ? idlar[0] : null),
  };
}

/** Menyu ekran ichida qolishi uchun joy (popover kengligi/balandligi bilan; pastga sig‘masa — tepaga). */
export function menyuJoyi(x: number, y: number, w: number, h: number, ekranW: number, ekranH: number, chet = 8): { left: number; top: number } {
  const left = Math.max(chet, Math.min(x, ekranW - w - chet));
  const top = y + h + chet > ekranH ? Math.max(chet, Math.min(y - h, ekranH - h - chet)) : Math.max(chet, y);
  return { left, top };
}
