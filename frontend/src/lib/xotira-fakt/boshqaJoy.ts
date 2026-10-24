/**
 * «Boshqa joydan olish» — ish smetaning boshqa razdelida yoki boshqa obyekt smetasida bo'lsa, o'sha qatorni (resurslari, narxi
 * bilan) shablon qilib kerakli razdelga QO'SHIMCHA qator yaratish. Asl smeta qatorlari o'zgarmaydi. Manba qator id sababga yoziladi
 * (server `t2_ish_abc_saqla_v1`: sabab majburiy, audit va aktga tushadi) — migratsiyasiz.
 */
import type { IshTuriVariant } from '../../api/t2-ish-abc';
import { katAniqla, type AbcResurs } from '../ish-abc';
import { birlikTahlil } from './moslash';
import type { XotiraQator } from './parse';

const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

/** Manba ish turi tarkibi → shablon resurslar (norma, narx, narx manbasi; narx yo'q bo'lsa 'qolda' va bo'sh — narxsiz). */
export function variantResurslari(v: IshTuriVariant): AbcResurs[] {
  return v.sostav.map((c) => ({
    kat: katAniqla(c.kat, c.tur, c.birlik), kod: c.kod ?? '', nom: c.nom, birlik: c.birlik ?? '',
    norma: c.norma != null && c.norma > 0 ? String(c.norma) : '', hajm: '',
    narx: c.narx != null ? String(c.narx) : '', manba: c.narx != null ? 'smeta' : 'qolda',
  }));
}

/** Matndagi son miqdorni manba ishining birligiga o'tkazadi; birliklar mos kelmasa null (operator o'zi kiritadi). */
export function boshlangichHajm(q: XotiraQator, birlik: string | null): string {
  if (q.turi !== 'son' || q.qiymat == null) return '';
  if (!q.birlik || !birlik) return String(q.qiymat);
  const a = birlikTahlil(q.birlik), b = birlikTahlil(birlik);
  if (!a || !b || a.baza !== b.baza) return '';
  return String(yaxlit(q.qiymat / b.koef * a.koef));
}

/** Server sababi (majburiy): qayerdan olingani izlanadi. */
export function boshqaJoySabab(v: Pick<IshTuriVariant, 'qator_id' | 'kod' | 'nom' | 'shu_obyekt'>, xom: string): string {
  const joy = v.shu_obyekt ? 'shu obyekt smetasi' : 'boshqa obyekt smetasi';
  return `Xotiradan fakt: «${xom.trim()}» — boshqa joydan olindi (manba qator #${v.qator_id ?? '?'}, ${joy}${v.kod ? `, ${v.kod}` : ''})`.slice(0, 500);
}

/**
 * Smetada umuman yo'q ish (katalog/resurs qidiruvidan qo'shimcha): `IshAbcModal` ni matn bo'yicha oldindan to'ldirish.
 * Ish nomi — matndagi nom; birlik/hajm — matnda aytilgan bo'lsa (smeta birligi yo'q — operator tanlaydi); fakt = hajm.
 */
export function katalogBoshlang(q: XotiraQator): { ish: { kod: string; nom: string; birlik: string; hajm: string }; fakt: string; sabab: string } {
  const hajm = q.turi === 'son' && q.qiymat != null ? String(q.qiymat) : '';
  return {
    ish: { kod: '', nom: q.nom.toUpperCase(), birlik: q.turi === 'son' ? q.birlik ?? '' : '', hajm },
    fakt: hajm,
    sabab: `Xotiradan fakt: «${q.xom.trim()}» — smetada yo'q (katalog/resurs qidiruvidan qo'shildi)`.slice(0, 500),
  };
}