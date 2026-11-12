/**
 * Buxgalteriya ekranlari uchun toza hisob (DOM/tarmoq yo'q). Pul — faqat `lib/hisob-yadro` orqali (yaxlit2/yigindi2).
 * Qoidalar: null = noma'lum (0 emas); minus ruxsat (storno); saldo = Debet − Kredit.
 */
import { yaxlit2, yigindi2 } from '../hisob-yadro';
import type { BuxHujjatQator, BuxKontragentQator, BuxNdsQator, BuxOsv } from '../../api/t2-bux-hisob';

/** Sof saldo (Dt − Kt) → qaysi tomonda turgani. 0 = tomonsiz. */
export function saldoTomoni(net: number | null | undefined): { dt: number | null; kt: number | null } {
  if (net == null || !Number.isFinite(net)) return { dt: null, kt: null };
  const x = yaxlit2(net);
  if (x > 0) return { dt: x, kt: null };
  if (x < 0) return { dt: null, kt: yaxlit2(-x) };
  return { dt: null, kt: null };
}

/** ОСВ tekshiruvi: jami Debet = jami Kredit bo'lishi shart (ikki yoqlama yozuv). `farq` ≠ 0 bo'lsa muammo. */
export function osvMuvozanat(o: Pick<BuxOsv, 'jami_dt' | 'jami_kt'>): { farq: number; muvozanatda: boolean } {
  const farq = yaxlit2(o.jami_dt - o.jami_kt);
  return { farq, muvozanatda: farq === 0 };
}

export type KontragentGuruh = {
  kalit: string; kontragent_id: number | null; nom: string; inn: string | null;
  qatorlar: BuxKontragentQator[];
  /** Hisob bo'yicha jamlama: saldo Dt (ular bizga qarz) va Kt (biz qarzmiz) yig'indisi. */
  debitor: number; kreditor: number;
};

/** Kontragent × hisob qatorlarini kontragent bo'yicha guruhlaydi. Debitor = Dt saldolar, kreditor = Kt saldolar (hisob bo'yicha alohida, netlanmaydi). */
export function kontragentGuruhla(qatorlar: ReadonlyArray<BuxKontragentQator>, qidir = ''): KontragentGuruh[] {
  const q = qidir.trim().toLowerCase();
  const m = new Map<string, KontragentGuruh>();
  for (const r of qatorlar) {
    const key = r.kontragent_id == null ? '_yoq' : String(r.kontragent_id);
    let g = m.get(key);
    if (!g) { g = { kalit: key, kontragent_id: r.kontragent_id, nom: r.kontragent ?? '', inn: r.inn, qatorlar: [], debitor: 0, kreditor: 0 }; m.set(key, g); }
    g.qatorlar.push(r);
  }
  const out: KontragentGuruh[] = [];
  for (const g of m.values()) {
    g.debitor = yigindi2(g.qatorlar.map((r) => (r.yopilish > 0 ? r.yopilish : null)));
    g.kreditor = yigindi2(g.qatorlar.map((r) => (r.yopilish < 0 ? -r.yopilish : null)));
    if (q && !`${g.nom} ${g.inn ?? ''}`.toLowerCase().includes(q)) continue;
    out.push(g);
  }
  return out.sort((a, b) => (a.kontragent_id == null ? 1 : 0) - (b.kontragent_id == null ? 1 : 0) || a.nom.localeCompare(b.nom, 'ru'));
}

export type SverkaQator = BuxHujjatQator & { saldo: number };

/** Akt-sverka: ochilish saldosidan boshlab har hujjatdan keyingi yurma saldo (Dt − Kt). */
export function sverkaQatorlari(ochilish: number, hujjatlar: ReadonlyArray<BuxHujjatQator>): { qatorlar: SverkaQator[]; dt: number; kt: number; yopilish: number } {
  let saldo = yaxlit2(ochilish);
  const qatorlar: SverkaQator[] = hujjatlar.map((h) => { saldo = yaxlit2(saldo + h.dt - h.kt); return { ...h, saldo }; });
  return { qatorlar, dt: yigindi2(hujjatlar.map((h) => h.dt)), kt: yigindi2(hujjatlar.map((h) => h.kt)), yopilish: saldo };
}

/** QQS reyestri jami (asos, QQS, QQS bilan). */
export function ndsJami(q: ReadonlyArray<BuxNdsQator>): { asos: number; nds: number; jami: number } {
  return { asos: yigindi2(q.map((x) => x.asos)), nds: yigindi2(q.map((x) => x.nds)), jami: yigindi2(q.map((x) => x.jami)) };
}

/** Qoida/hisob kodi bo'yicha hisob nomi (til: ru yoki o'zbek). */
export function hisobNomi(h: { nom_uz: string | null; nom_ru: string | null } | undefined, ru: boolean): string {
  if (!h) return '';
  return (ru ? h.nom_ru ?? h.nom_uz : h.nom_uz ?? h.nom_ru) ?? '';
}

/** Hujjat manbasi (manba_tur) — foydalanuvchi so'zi (uz) va sahifaga yo'l (drill-down). */
export const MANBA_NOM: Record<string, string> = {
  forma3: 'Forma-3 (realizatsiya)', tolov: 'To‘lov', ombor_kirim: 'Ombor kirimi', qarz_yetkazish: 'Yetkazib berish', qarz_ish: 'Bajarilgan ish (akt)',
  qarz_tolov: 'To‘lov (qarz asosi)', qarz_boshlangich: 'Boshlang‘ich qoldiq', qolda: 'Qo‘lda provodka',
  xarajat: 'Xarajat', taqdim: 'Qabul qilingan Forma-2',
};
export function manbaYol(manbaTur: string): string | null {
  if (manbaTur === 'forma3') return '/admin/moliya';
  if (manbaTur === 'tolov' || manbaTur === 'xarajat') return '/admin/moliya';
  if (manbaTur.startsWith('qarz_') || manbaTur === 'ombor_kirim') return '/admin/qarzdorlik';
  return null;
}
