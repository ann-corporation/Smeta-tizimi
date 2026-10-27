/**
 * Rasmiy F2 reestri (CSV: «№;Lot;Obyekt_ish;Davr;QQSsiz;QQS;QQS_bilan;Holat») — o'qish va tizimga moslash.
 * Ajratuvchi «;» yoki Tab; sarlavha qatori ustun nomlari orqali topiladi (tartib boshqacha bo'lsa ham).
 * Summalar: «25 750 000 000,50» yoki «25750000000.5» → tiyin; bo'sh — null (NULL ≠ 0).
 * Moslash: obyekt nomi (Obyekt_ish) → obyekt → shartnoma; № → shu shartnomaning F2 akti (t2_akt.raqam). Topilmasa — operator tanlaydi;
 * akti topilmagan qator ham yoziladi (reestrda bor, tizimda F2 yo'q — moslashda alohida ogohlantirish).
 */
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { pulOqi } from './tahlil';
import type { MoslashShartnoma, TizimShartnoma } from './turlar';

export type ReestrQator = {
  qator: number; raqam: string; lot: string | null; obyektIsh: string | null; davr: string | null;
  qqssiz: number | null; qqs: number | null; qqsBilan: number | null; holat: string | null;
};
export type ReestrTahlil = { qatorlar: ReestrQator[]; xatolar: { qator: number; matn: string }[] };

const USTUN: Record<string, keyof Omit<ReestrQator, 'qator'>> = {
  '№': 'raqam', 'n': 'raqam', 'raqam': 'raqam', 'lot': 'lot', 'obyekt_ish': 'obyektIsh', 'obyekt': 'obyektIsh', 'davr': 'davr',
  'qqssiz': 'qqssiz', 'qqs': 'qqs', 'qqs_bilan': 'qqsBilan', 'holat': 'holat',
};

function boling(qator: string, ajr: string): string[] {
  const out: string[] = []; let joriy = ''; let qoshtirnoq = false;
  for (let i = 0; i < qator.length; i++) {
    const c = qator[i];
    if (c === '"') { if (qoshtirnoq && qator[i + 1] === '"') { joriy += '"'; i++; } else qoshtirnoq = !qoshtirnoq; }
    else if (c === ajr && !qoshtirnoq) { out.push(joriy.trim()); joriy = ''; }
    else joriy += c;
  }
  out.push(joriy.trim());
  return out;
}

export function reestrCsvOqi(matn: string): ReestrTahlil {
  const satrlar = matn.replace(/^﻿/, '').split(/\r?\n/);
  const xatolar: ReestrTahlil['xatolar'] = [];
  const qatorlar: ReestrQator[] = [];
  let ustunlar: (keyof Omit<ReestrQator, 'qator'> | null)[] | null = null;
  let ajr = ';';
  satrlar.forEach((s, i) => {
    if (!s.trim()) return;
    if (!ustunlar) {
      ajr = s.includes(';') ? ';' : s.includes('\t') ? '\t' : ',';
      const nomlar = boling(s, ajr).map((x) => USTUN[x.toLowerCase().replace(/\s+/g, '_')] ?? null);
      if (nomlar.includes('raqam') && (nomlar.includes('qqssiz') || nomlar.includes('qqsBilan'))) ustunlar = nomlar;
      return;
    }
    const k = boling(s, ajr);
    const q: ReestrQator = { qator: i + 1, raqam: '', lot: null, obyektIsh: null, davr: null, qqssiz: null, qqs: null, qqsBilan: null, holat: null };
    ustunlar.forEach((u, j) => {
      const v = (k[j] ?? '').trim();
      if (!u) return;
      if (u === 'qqssiz' || u === 'qqs' || u === 'qqsBilan') q[u] = pulOqi(v);
      else if (u === 'raqam') q.raqam = v.replace(/^№\s*/, '');
      else q[u] = v || null;
    });
    if (!q.raqam || /итого|jami|всего/i.test(q.raqam)) { if (q.raqam) return; xatolar.push({ qator: i + 1, matn: s.slice(0, 160) }); return; }
    if (q.qqssiz == null && q.qqsBilan == null) { xatolar.push({ qator: i + 1, matn: s.slice(0, 160) }); return; }
    qatorlar.push(q);
  });
  if (!ustunlar) xatolar.push({ qator: 0, matn: 'Sarlavha topilmadi: №;Lot;Obyekt_ish;Davr;QQSsiz;QQS;QQS_bilan;Holat' });
  return { qatorlar, xatolar };
}

const raqamKaliti = (s: string | null | undefined) => qidiruvKaliti(String(s ?? '').replace(/^№\s*/, '')).replace(/[\s.№-]/g, '');

export type ReestrMoslash = ReestrQator & { shartnomaId: number | null; aktId: number | null; obyektId: number | null };

/** Obyekt nomi bo'yicha shartnoma va № bo'yicha akt. `tanlov` — operator qo'lda (qator → shartnoma). */
export function reestrMosla(qatorlar: readonly ReestrQator[], shartnomalar: readonly TizimShartnoma[], moslash: readonly MoslashShartnoma[],
  tanlov: Readonly<Record<number, number | null>> = {}): ReestrMoslash[] {
  const obyektlar = shartnomalar.flatMap((s) => s.obyektlar.map((o) => ({ ...o, shartnomaId: s.id, k: qidiruvKaliti(o.nom) })));
  return qatorlar.map((q) => {
    const k = qidiruvKaliti(q.obyektIsh ?? '');
    const topilgan = k ? obyektlar.filter((o) => o.k && (k.includes(o.k) || o.k.includes(k))) : [];
    const shIdlar = [...new Set(topilgan.map((o) => o.shartnomaId))];
    const shartnomaId = Object.prototype.hasOwnProperty.call(tanlov, q.qator) ? tanlov[q.qator] : shIdlar.length === 1 ? shIdlar[0] : null;
    const obyektId = topilgan.length === 1 ? topilgan[0].id : null;
    const m = moslash.find((x) => x.id === shartnomaId);
    const aktlar = (m?.f2 ?? []).filter((a) => raqamKaliti(a.raqam) === raqamKaliti(q.raqam) && (obyektId == null || a.obyekt_id === obyektId));
    return { ...q, shartnomaId: shartnomaId ?? null, aktId: aktlar.length === 1 ? aktlar[0].akt_id : null, obyektId };
  });
}
