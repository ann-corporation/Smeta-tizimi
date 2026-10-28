/**
 * F2 jadvallari (reestr, F2 tayyorlash) uchun Excel uslubidagi ustun ta'riflari va yordamchilar (egasi 2026-10-27:
 * «hamma ustunlarda professional, xuddi Excel'dagidek filtr»). Qiymatlar katakda ko'rinadigan maydonlardan olinadi.
 */
import { t, tilLocale } from '../../i18n/til';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { shifrKorinish } from '../../lib/f2-resurs-guruh';
import { bosqich, type F2Bosqich, type ReestrAkt, type ReestrQator } from '../../lib/f2-reestr/reestr';
import { reestrUlush } from '../../lib/f2-reestr/reestr-korinish';
import type { F2Bolim, F2Ish, F2Resurs } from '../../lib/f2-tayyor';
import type { Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';

export const BOSQICH_NOMI: Record<F2Bosqich, string> = { tasdiqlangan: 'Tasdiqlangan', jarayonda: 'Jarayonda', rad: 'Rad etilgan', bekor: 'Bekor qilingan' };
export const davrMatni = (oy: string | null | undefined): string => (oy ? davrNomi(oy, tilLocale()) || oy.slice(0, 7) : '');

// ── F2 reestri ──────────────────────────────────────────────────────────────────────────────────────────────

/** «Jarayonda · rad · bekor» katagidagi so'zlar (hammasi nol — bo'sh). */
export function reestrHolatMatni(q: ReestrQator): string | null {
  const { jarayonda, rad, bekor } = q.boyicha;
  const s: string[] = [];
  if (jarayonda.soni > 0) s.push(t('{n} jarayonda', { n: jarayonda.soni }));
  if (rad.soni > 0) s.push(t('{n} rad etilgan', { n: rad.soni }));
  if (bekor.soni > 0) s.push(t('{n} bekor', { n: bekor.soni }));
  return s.length ? s.join(', ') : null;
}
export function shartnomaMatni(q: ReestrQator): string | null {
  return q.shartnomalar.length ? q.shartnomalar.map((s) => `№ ${s.raqam}${s.nom ? ` · ${s.nom}` : ''}`).join('; ') : null;
}
/** Summa ustuni: akt bo'lmasa — bo'sh (katakda «—»). Ma'lum qism (noma'lumlar chip bilan alohida). */
const summaQiymat = (s: { malum: number; soni: number }): number | null => (s.soni ? s.malum : null);

export function reestrUstunlar(smeta: (q: ReestrQator) => number | null | undefined): Ustun<ReestrQator>[] {
  return [
    { kalit: 'obyekt', nom: t('Obyekt'), tur: 'matn', qiymat: (q) => q.obyekt.nom },
    { kalit: 'loyiha', nom: t('Loyiha'), tur: 'matn', qiymat: (q) => q.loyiha },
    { kalit: 'shartnoma', nom: t('Shartnoma'), tur: 'matn', qiymat: shartnomaMatni },
    { kalit: 'smeta', nom: t('Smeta'), tur: 'son', qiymat: smeta },
    { kalit: 'tasdiq', nom: t('Tasdiqlangan F2'), tur: 'son', qiymat: (q) => summaQiymat(q.boyicha.tasdiqlangan) },
    { kalit: 'nisbat', nom: t('Smetaga nisbatan'), tur: 'son', qiymat: (q) => {
      const u = reestrUlush({ tasdiqlangan: q.boyicha.tasdiqlangan, tasdiqImport: q.tasdiqImport, tasdiqTizim: q.tasdiqTizim }, q.obyekt.jami);
      return u.foiz == null ? null : Math.round(u.foiz);
    } },
    { kalit: 'import', nom: t('Import'), tur: 'son', qiymat: (q) => summaQiymat(q.tasdiqImport) },
    { kalit: 'tizim', nom: t('Tizimda tayyorlangan'), tur: 'son', qiymat: (q) => summaQiymat(q.tasdiqTizim) },
    { kalit: 'holat', nom: t('Jarayonda · rad · bekor'), tur: 'matn', qiymat: reestrHolatMatni },
    { kalit: 'oy', nom: t('Oxirgi oy'), tur: 'matn', qiymat: (q) => davrMatni(q.oxirgiOy) },
  ];
}

/** Akt manbasi katakdagi kabi: tizimda / import (fayl yoki hujjat №) / aniqlanmadi. */
export function aktManbaMatni(a: ReestrAkt, fayl: string | null): string {
  if (a.manba === 'tizim') return t('Tizimda yasalgan');
  if (a.manba !== 'import') return t('aniqlanmadi');
  const izoh = fayl ? ` · ${fayl}` : a.hujjat_id ? ` · ${t('hujjat №{n}', { n: a.hujjat_id })}` : '';
  return t('Import') + izoh;
}

export function aktUstunlar(fayl: (a: ReestrAkt) => string | null): Ustun<ReestrAkt>[] {
  return [
    { kalit: 'oy', nom: t('Oy'), tur: 'matn', qiymat: (a) => davrMatni(a.oy) },
    { kalit: 'raqam', nom: t('Raqam'), tur: 'matn', qiymat: (a) => a.raqam },
    { kalit: 'manba', nom: t('Manba'), tur: 'matn', qiymat: (a) => aktManbaMatni(a, fayl(a)) },
    { kalit: 'holat', nom: t('Holat'), tur: 'matn', qiymat: (a) => t(BOSQICH_NOMI[bosqich(a)]) },
    { kalit: 'summa', nom: t('Summa'), tur: 'son', qiymat: (a) => a.hujjat_jami },
    { kalit: 'qatorlar', nom: t('Qatorlar'), tur: 'son', qiymat: (a) => a.qator_soni },
  ];
}

// ── F2 tayyorlash: ishlar ro'yxati (kartalar) ───────────────────────────────────────────────────────────────

/** Ro'yxat elementi: bo'limdagi ish yoki alohida material. */
export type F2Element = { kalit: string; bolimId: number | null; bolimNom: string; ish: F2Ish | null; resurs: F2Resurs | null };

export function f2Elementlar(bolimlar: readonly F2Bolim[]): F2Element[] {
  const out: F2Element[] = [];
  for (const b of bolimlar) {
    for (const i of b.ishlar) out.push({ kalit: 'i' + i.id, bolimId: b.id, bolimNom: b.nom, ish: i, resurs: null });
    for (const r of b.alohida) out.push({ kalit: 'r' + r.id, bolimId: b.id, bolimNom: b.nom, ish: null, resurs: r });
  }
  return out;
}

/** Filtrlangan (va saralangan) elementlardan bo'limlarni qayta yig'adi: bo'lim tartibi saqlanadi, ichida — natija tartibi; bo'sh bo'lim tushadi. */
export function f2QaytaQur(bolimlar: readonly F2Bolim[], natija: readonly F2Element[]): F2Bolim[] {
  const tartib = new Map(natija.map((e, n) => [e.kalit, n]));
  const out: F2Bolim[] = [];
  for (const b of bolimlar) {
    const ishlar = b.ishlar.filter((i) => tartib.has('i' + i.id)).sort((x, y) => tartib.get('i' + x.id)! - tartib.get('i' + y.id)!);
    const alohida = b.alohida.filter((r) => tartib.has('r' + r.id)).sort((x, y) => tartib.get('r' + x.id)! - tartib.get('r' + y.id)!);
    if (ishlar.length || alohida.length) out.push({ ...b, ishlar, alohida });
  }
  return out;
}

export type F2FiltrKontekst = {
  /** Kiritilgan F2 hajmi (son; kiritilmagan/xato — null). */
  hajm: (id: number) => number | null;
  /** Hisoblangan F2 summasi (kiritilmagan — null). */
  summa: (id: number) => number | null;
  /** Holat matni (xato / ogohlantirish / kiritilgan / kiritilmagan). */
  holat: (id: number) => string | null;
};

/** Ish summasi — katakdagi kabi resurslari summasi; nol bo'lsa bo'sh. */
export function ishSummasi(i: F2Ish, summa: (id: number) => number | null): number | null {
  const s = i.resurslar.reduce((a, r) => a + (summa(r.id) ?? 0), 0);
  return s ? s : null;
}

export function f2ElementUstunlar(c: F2FiltrKontekst): Ustun<F2Element>[] {
  const id = (e: F2Element) => (e.ish ? e.ish.id : e.resurs!.id);
  return [
    { kalit: 'bolim', nom: t('Bo‘lim'), tur: 'matn', qiymat: (e) => e.bolimNom },
    { kalit: 'kod', nom: t('Shifr'), tur: 'matn', qiymat: (e) => shifrKorinish((e.ish ?? e.resurs)!.kod) },
    { kalit: 'nom', nom: t('Nomi'), tur: 'matn', qiymat: (e) => (e.ish ?? e.resurs)!.nom },
    { kalit: 'birlik', nom: t('Birlik'), tur: 'matn', qiymat: (e) => (e.ish ?? e.resurs)!.birlik },
    { kalit: 'hajm', nom: t('F2 hajmi'), tur: 'son', qiymat: (e) => c.hajm(id(e)) },
    { kalit: 'mumkin', nom: t('F2 mumkin'), tur: 'son', qiymat: (e) => (e.ish ?? e.resurs)!.mumkin },
    { kalit: 'smeta', nom: t('Smeta'), tur: 'son', qiymat: (e) => (e.ish ? e.ish.smeta : e.resurs!.smeta ?? null) },
    { kalit: 'olingan', nom: t('Tasdiqlangan F2'), tur: 'son', qiymat: (e) => (e.ish && e.ish.olingan > 0 ? e.ish.olingan : null) },
    { kalit: 'qoralama', nom: t('Qoralamada'), tur: 'son', qiymat: (e) => { const v = (e.ish ?? e.resurs)!.qoralama ?? 0; return v > 0 ? v : null; } },
    { kalit: 'summa', nom: t('Summa'), tur: 'son', qiymat: (e) => (e.ish ? ishSummasi(e.ish, c.summa) : c.summa(e.resurs!.id)) },
    { kalit: 'holat', nom: t('Holat'), tur: 'matn', qiymat: (e) => c.holat(id(e)) },
  ];
}

/** Ish ichidagi resurslar jadvali ustunlari. */
export function f2ResursUstunlar(c: F2FiltrKontekst & { /** Amaldagi narx (kiritilgan yoki taklif). */ narx: (r: F2Resurs) => number | null }): Ustun<F2Resurs>[] {
  return [
    { kalit: 'nom', nom: t('Resurs'), tur: 'matn', qiymat: (r) => r.nom },
    { kalit: 'birlik', nom: t('Birlik'), tur: 'matn', qiymat: (r) => r.birlik },
    { kalit: 'hajm', nom: t('Hajm'), tur: 'son', qiymat: (r) => c.hajm(r.id) },
    { kalit: 'narx', nom: t('Narx · manba'), tur: 'son', qiymat: (r) => c.narx(r) },
    { kalit: 'summa', nom: t('Summa'), tur: 'son', qiymat: (r) => c.summa(r.id) },
    { kalit: 'holat', nom: t('Holat'), tur: 'matn', qiymat: (r) => (r.chiqarilgan ? t('ishdan chiqarilgan') : c.holat(r.id)) },
  ];
}
