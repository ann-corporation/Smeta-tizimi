/**
 * Jarvis (Ctrl+K AI buyruq satri) uchun naryad o'qish vositasi — sof funksiya. Faqat o'qiydi (yozuv — «Naryad» sahifasida, tasdiq bilan).
 * Raqam, usta, summa to'qilmaydi: foydalanuvchi sessiyasida o'qilgan ro'yxatdan. Summa — QQS siz (usta narxi to'g'ri xarajat); narxsiz — «noma'lum».
 */
import type { T2Qator } from '../../api/supabase';
import { koefParametrdan } from '../ish-kartasi';
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import { HOLAT_NOMI, NARYAD_HOLATLAR, holatSoni, qatorMehnat, type NaryadHolat, type NaryadQisqa } from './index';
import type { TarixQator } from '../../api/t2-naryad';
import { koefBirlikdan, koefTarixdan, kelishuvHisob, ustaBirlikNorm } from './kelishuv';

const raqam = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 }));

/** arg: bo'sh — oxirgi naryadlar va holat soni; holat nomi (berildi/bajarildi/qabul/hisoblandi) yoki raqam («N-2026-0001») yoki usta nomi bo'yicha filtr. */
export function naryadMatni(list: readonly NaryadQisqa[] | undefined, arg: string | null, limit = 15): string {
  if (!list) return 'Naryadlar o‘qilmadi (ruxsat yoki tarmoq). «Naryad» sahifasini oching.';
  if (!list.length) return 'Bu obyekt bo‘yicha naryad yo‘q. Yangisi: «Naryad» sahifasi → «Yangi naryad».';
  const q = (arg ?? '').trim().toLowerCase();
  const holat = (NARYAD_HOLATLAR as readonly string[]).includes(q) ? (q as NaryadHolat) : null;
  const l = list.filter((n) => (holat ? n.holat === holat : !q || n.raqam.toLowerCase().includes(q) || n.usta_nom.toLowerCase().includes(q)));
  const s = holatSoni(list);
  const bosh = `Naryadlar: ${list.length} (berildi ${s.berildi}, bajarildi ${s.bajarildi}, qabul ${s.qabul}, hisoblandi ${s.hisoblandi}, bekor ${s.bekor}).`;
  if (!l.length) return `${bosh}\n«${arg}» bo‘yicha naryad topilmadi.`;
  return [bosh, ...l.slice(0, limit).map((n) => `- ${n.raqam} | ${n.usta_nom}${n.brigada ? ` (${n.brigada})` : ''} | ${HOLAT_NOMI[n.holat]} | ${n.qator_soni} ish | to‘lov ${raqam(n.xarajat_summa ?? n.reja_summa)} so‘m (QQS siz)${n.narxsiz_soni ? ` | ${n.narxsiz_soni} ta ishda narx kelishilmagan` : ''}${n.holat === 'qabul' && n.fakt_holat !== 'yozildi' ? ' | fakt yozilmagan' : ''}`),
    ...(l.length > limit ? [`… yana ${l.length - limit} ta`] : [])].join('\n');
}

/** «250 ming», «250000», «1,2 mln» → so'm. Tanilmasa null. */
export function narxOqi(s: string): number | null {
  const m = /(\d[\d\s.,]*)\s*(ming|mln|million|k)?/i.exec(s.toLowerCase());
  if (!m) return null;
  const raw = m[1].replace(/\s/g, '').replace(',', '.');
  const x = Number(raw);
  if (!Number.isFinite(x)) return null;
  const k = m[2] === 'ming' || m[2] === 'k' ? 1e3 : m[2] ? 1e6 : 1;
  return x * k;
}

const raqam2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('ru-RU').replace(/\s/g, ' '));

/**
 * kelishuv (Jarvis): «rigel; metr; 250 ming; 20x40» → usta o'z birligida (metr) narx aytsa, smeta (m³) puliga sig'adimi.
 * arg: ish nomi ; usta birligi ; narx ; [koef yoki kesim bxh (sm/mm)]. Koef noma'lum bo'lsa o'ylab topilmaydi — so'raydi.
 * Smeta puli: shu ish qatorining ЧЕЛ resurslari (hisob-yadro kategoriyasi bilan), ustamasiz, QQS siz.
 */
export function kelishuvIshlari(rows: readonly T2Qator[], arg: string | null): T2Qator[] {
  const p = (arg ?? '').split(/[;|]/).map((s) => s.trim());
  if (p.length < 3 || !p[0]) return [];
  const f = qidiruvTayyorla(p[0]);
  return rows.filter((r) => r.tur === 'bl' && f(`${r.kod ?? ''} ${r.nom ?? ''}`)).slice(0, 3);
}

export type KelishuvOpsiya = {
  /** Kompaniya naryad tarixi (koef va oldin to'langan narx). */
  tarix?: readonly TarixQator[] | null;
  /** Ustamasiz mehnat puli → ustamali (hisob-yadro orqali; ustama ma'lumoti yo'q — null). */
  ustamali?: (ustamasiz: number) => number | null;
};

export function kelishuvMatni(rows: readonly T2Qator[], arg: string | null, o: KelishuvOpsiya = {}): string {
  const p = (arg ?? '').split(/[;|]/).map((s) => s.trim());
  if (p.length < 3 || !p[0]) return 'Format: «ish nomi; usta birligi; narx; [koef yoki kesim 20x40]». Masalan: rigel; metr; 250 ming; 20x40';
  const ishlar = kelishuvIshlari(rows, arg);
  if (!ishlar.length) return `«${p[0]}» bo‘yicha ish qatori topilmadi.`;
  const ub = ustaBirlikNorm(p[1]);
  const narx = narxOqi(p[2]);
  if (narx == null) return `Narxni o‘qib bo‘lmadi: «${p[2]}».`;
  const qosh = (p[3] ?? '').toLowerCase();
  const kesim = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/.exec(qosh);
  const out: string[] = [];
  for (const r of ishlar) {
    const bolalar = rows.filter((c) => c.ota_id === r.id && c.kat != null).map((c) => ({ kat: c.kat, nom: c.nom, birlik: c.birlik, hajm: c.hajm, summa: c.summa }));
    const m = qatorMehnat({ id: r.id, obyekt_id: r.obyekt_id, tur: r.tur, kod: r.kod, nom: r.nom, birlik: r.birlik, hajm: r.hajm, summa: r.summa, bolalar });
    const tarix = (o.tarix ?? []).filter((x) => (x.qator_id != null && x.qator_id === r.id) || (r.kod != null && x.kod === r.kod));
    let koef = koefTarixdan(tarix, ub);
    let manba = koef != null ? 'oldingi naryad tarixi' : 'birlik o‘girish';
    if (koef == null) koef = koefBirlikdan(ub, r.birlik);
    if (koef == null && kesim) {
      const a = Number(kesim[1].replace(',', '.')); const b = Number(kesim[2].replace(',', '.'));
      const mm = a > 100 || b > 100 ? 1 : 10; // 100 dan katta — mm, aks holda sm
      koef = koefParametrdan('rigel', 'м', { b_mm: a * mm, h_mm: b * mm }, r.birlik);
      manba = `kesim ${kesim[1]}×${kesim[2]}`;
    }
    if (koef == null && /^\d+(?:[.,]\d+)?$/.test(qosh)) { koef = Number(qosh.replace(',', '.')); manba = 'siz kiritgan koef'; }
    const nom = `[#${r.id}] ${r.kod ?? ''} ${r.nom ?? ''} | smeta birligi ${r.birlik ?? '—'}`;
    if (koef == null) { out.push(`${nom}\n  Koef noma’lum: 1 ${p[1]} necha ${r.birlik ?? 'smeta birligi'} ekanini ayting (yoki kesim, masalan 20x40) — o‘ylab topmayman.`); continue; }
    const k = kelishuvHisob({ smetaBirlik: r.birlik, ustaBirlik: ub, koef, taklif: narx, smetaPulBirlik: m.mehnatBirlik, tarix, ustamali: o.ustamali });
    out.push([nom,
      `  Koef: 1 ${p[1]} = ${Number(koef.toPrecision(6))} ${r.birlik ?? ''} (${manba}).`,
      `  Usta narxi: ${raqam2(narx)} so‘m / ${p[1]} = ${raqam2(k.taklifSmetaBirlikda)} so‘m / ${r.birlik ?? 'smeta birligi'}.`,
      `  Smetadagi mehnat puli (ustamasiz): ${raqam2(m.mehnatBirlik)} so‘m / ${r.birlik ?? 'smeta birligi'} = ${raqam2(k.adolatli)} so‘m / ${p[1]} (adolatli)${k.adolatliUstamali != null ? `; ustamali ${raqam2(k.adolatliUstamali)} so‘m / ${p[1]}` : ''}.`,
      ...(k.tarixSoni ? [`  Oldin shu ish uchun ${k.tarixSoni} marta to‘langan; eng past ${raqam2(k.tarixPol)} so‘m / ${p[1]}.`] : []),
      `  Natija: ${k.sigadi == null ? 'aniqlab bo‘lmadi' : k.sigadi ? 'SMETAGA SIG‘ADI' : 'SMETAGA SIG‘MAYDI'}${k.farqFoiz != null ? ` (${k.farqFoiz > 0 ? '+' : ''}${k.farqFoiz.toFixed(0)}%)` : ''}. ${k.sabab}`].join('\n'));
  }
  return [...out, '(summalar QQS siz; to‘liq hisob — «Naryad» sahifasida.)'].join('\n');
}
