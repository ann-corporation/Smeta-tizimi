/**
 * O'rganish halqasi — TAJRIBA (learned defaults). Bitta mexanizm, uch daraja: user -> kompaniya -> tizim.
 *
 *  - `tajribaTaklif(domen, kalit, ctx)` eng yaxshi taklifni va SABABini qaytaradi («siz oxirgi 2 marta shunday tanlagansiz»).
 *  - `tajribaYoz(...)` foydalanuvchi tasdiqlaganda yoki tuzatganda chaqiriladi (tasdiq / rad / tuzatish).
 *  - QOIDA: taklif pul/yuridik hujjatga O'ZI qo'llanmaydi — maydonga oldindan to'ldiriladi va ko'rinadigan «taklif (tajribadan)» belgisi
 *    bilan turadi; foydalanuvchi tasdiqlaydi (saqlaganda `tajribaYoz` ketadi).
 *  - Daraja va ko'tarilish qoidalari serverda (DB funksiya `_t2_tajriba_taklif`): user >=2 tasdiq; kompaniya >=2 foydalanuvchi va >=3 tasdiq;
 *    tizim — faqat platforma egasi qabul qilgan taklif. Bu yerda faqat mijoz tomoni (kesh, kalit normallashi, matn).
 */
import { t } from '../../i18n/til';
import { osuvchiTaklifOl, osuvchiYoz, type TajribaTaklifJavob } from '../../api/t2-osuvchi';

export type TajribaTaklif = { daraja: 'user' | 'kompaniya' | 'tizim'; qiymat: string; sabab: string; tasdiq: number };
export type TajribaKontekst = { kompaniyaId: number | null | undefined };

/** Taklif kaliti: kichik harf, tinish belgilarsiz, bo'shliqlar yig'ilgan, ≤160 belgi (lotin va kirill o'z holicha). */
export function tajribaKalit(s: string): string {
  return s.toLowerCase().replace(/[ʻʼ’‘`´']/g, '').replace(/[^\p{L}\p{N}\s.\-/]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** Foydalanuvchiga ko'rsatiladigan sabab (i18n). */
export function tajribaSabab(x: Pick<TajribaTaklifJavob, 'daraja' | 'tasdiq' | 'foydalanuvchi_soni'>): string {
  if (x.daraja === 'user') return t('siz oxirgi {n} marta shunday tanlagansiz', { n: x.tasdiq ?? 2 });
  if (x.daraja === 'kompaniya') return t('kompaniyangizda {n} marta shunday tanlangan ({k} kishi)', { n: x.tasdiq ?? 3, k: x.foydalanuvchi_soni ?? 2 });
  return t('tizim lug‘atida shunday qabul qilingan');
}
export const TAJRIBA_BELGI = () => t('taklif (tajribadan)');

type Eslatma = { vaqt: number; taklif: TajribaTaklif | null };
const kesh = new Map<string, Eslatma>();
const KESH_MS = 60_000;
const keshKalit = (k: number, d: string, kl: string) => `${k}|${d}|${kl}`;
/** Faqat testlar uchun. */
export const tajribaKeshniTozala = () => kesh.clear();

export async function tajribaTaklif(domen: string, kalit: string, ctx: TajribaKontekst): Promise<TajribaTaklif | null> {
  const k = ctx.kompaniyaId;
  const kl = tajribaKalit(kalit);
  if (!k || !kl) return null;
  const ck = keshKalit(k, domen, kl);
  const eski = kesh.get(ck);
  if (eski && Date.now() - eski.vaqt < KESH_MS) return eski.taklif;
  const r = await osuvchiTaklifOl(k, domen, kl);
  const taklif: TajribaTaklif | null = r && r.daraja && r.qiymat
    ? { daraja: r.daraja, qiymat: r.qiymat, sabab: tajribaSabab(r), tasdiq: r.tasdiq ?? 0 } : null;
  kesh.set(ck, { vaqt: Date.now(), taklif });
  return taklif;
}

export type TajribaYozParam = {
  domen: string; kalit: string; qiymat: string;
  /** Foydalanuvchi aslida nima qildi: taklifni tasdiqladi / rad etdi / boshqasini tanladi. Taklif bo'lmasa — 'tasdiq' (o'z tanlovi). */
  natija?: 'tasdiq' | 'rad' | 'tuzatish';
  /** `tuzatish` da: qaysi taklif rad etildi. */
  taklifQiymat?: string | null;
};

/** Foydalanuvchi tasdiqlaganda chaqiriladi. Hech qachon xato otmaydi (o'rganish asosiy ishni to'xtatmasligi kerak). */
export async function tajribaYoz(p: TajribaYozParam, ctx: TajribaKontekst): Promise<boolean> {
  const k = ctx.kompaniyaId;
  const kl = tajribaKalit(p.kalit);
  const qiy = p.qiymat.trim();
  if (!k || !kl || !qiy) return false;
  try {
    const r = await osuvchiYoz({ kompaniyaId: k, amal: 'tajriba_yoz', yuk: {
      domen: p.domen, kalit: kl, qiymat: qiy.slice(0, 600), natija: p.natija ?? 'tasdiq', ...(p.taklifQiymat ? { taklif_qiymat: p.taklifQiymat.slice(0, 600) } : {}),
    } });
    kesh.delete(keshKalit(k, p.domen, kl));
    return !!r.ok;
  } catch { return false; }
}

/** Saqlash paytida: foydalanuvchi tanlagan qiymat taklifga mos keldimi — natijani aniqlaydi. */
export function tajribaNatija(taklif: { qiymat: string } | null | undefined, tanlangan: string): Pick<TajribaYozParam, 'natija' | 'taklifQiymat'> {
  if (!taklif) return { natija: 'tasdiq' };
  return taklif.qiymat === tanlangan ? { natija: 'tasdiq' } : { natija: 'tuzatish', taklifQiymat: taklif.qiymat };
}
