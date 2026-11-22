/**
 * SMETA IMPORTI: «Расчёт затрат транспорта» varag'i → `transport_yoy` (MCP / RPC `t2_qator_transport_yoy_v1`) yuki.
 * Varaq ustunlari: Наименование материалов, Ед.изм, Кол-во, Кол-во (тн), Дальность возки (км), Грузооборот тн.км., Стоимость тн.км, Стоимость всего.
 * zichlik = Кол-во (тн) ÷ Кол-во; material nomi → resurs kodlari: birlik mosligi + nom o'xshashligi (so'z kesishmasi). Toza mantiq (DOM/tarmoq yo'q).
 * Yuk faqat TAKLIF: tizim uni preview (dry_run) qilib ko'rsatadi, tasdiqlashni foydalanuvchi/AI qiladi. Transport uchun alohida
 * «tender / qo'shimcha» bo'lim YARATILMAYDI — t·km qatorlari materialning o'z ishi ostida (RPC).
 */
import { normBir } from '../f2-match-engine';

type Katak = string | number | null | undefined;
export type VaraqGrid = ReadonlyArray<ReadonlyArray<Katak>>;

export type TransportVaraqQator = { material: string; birlik: string | null; miqdor: number | null; tonna: number | null; km: number | null; hisob_tkm: number | null; narx: number | null; summa: number | null };
export type TransportVaraq = { qatorlar: TransportVaraqQator[]; tkm_narx: number | null; ogohlantirish: string[] };
export type TransportYoyGuruh = { material: string; birlik?: string; miqdor?: number; zichlik: number; km: number; hisob_tkm?: number; kodlar?: string[]; nom_pattern?: string };
export type TransportYoyYuk = { tkm_narx: number | null; qatorlar: TransportYoyGuruh[]; topilmadi: string[]; ogohlantirish: string[] };
export type ResursQator = { kod?: string | null; nom?: string | null; birlik?: string | null };

const s = (x: Katak): string => (x == null ? '' : String(x).replace(/\s+/g, ' ').trim());
const son = (x: Katak): number | null => {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const t = s(x).replace(/\s/g, '').replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

/** Varaq transport hisobi varag'imi: nomi «трансп…» yoki birinchi qatorlarda «Расчёт затрат транспорта». */
export function transportVaraqmi(nom: string, grid: VaraqGrid): boolean {
  if (/трансп/i.test(nom)) return true;
  return grid.slice(0, 15).some((r) => r.some((c) => /расч[её]т\s+затрат\s+транспорт/i.test(s(c))));
}

type Ustunlar = { nom: number; birlik: number; miqdor: number; tonna: number; km: number; tkm: number; narx: number; summa: number; hdr: number };

function ustunTop(grid: VaraqGrid): Ustunlar | null {
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const u: Ustunlar = { nom: -1, birlik: -1, miqdor: -1, tonna: -1, km: -1, tkm: -1, narx: -1, summa: -1, hdr: i };
    grid[i].forEach((c, j) => {
      const t = s(c).toLowerCase();
      if (!t) return;
      if (/наименован/.test(t) && u.nom < 0) u.nom = j;
      else if (/ед\.?\s*изм/.test(t) && u.birlik < 0) u.birlik = j;
      else if (/дальн/.test(t) && u.km < 0) u.km = j;
      else if (/стоимость\s+всего|всего\s*,?\s*(сум|руб)?$/.test(t) && u.summa < 0) u.summa = j;
      else if (/стоимост.*(тн|т)[\s.]*км/.test(t) && u.narx < 0) u.narx = j;
      else if (/грузооборот|^(тн|т)[\s.]*км/.test(t) && u.tkm < 0) u.tkm = j;
      else if (/(кол|колич).*\((тн|т|тонн)/.test(t) && u.tonna < 0) u.tonna = j;
      else if (/^(кол-?во|количество)\.?$/.test(t) && u.miqdor < 0) u.miqdor = j;
    });
    if (u.nom >= 0 && u.km >= 0 && u.tkm >= 0) return u;
  }
  return null;
}

/** Varaqni o'qiydi. Ustunlar topilmasa — null (varaq transport hisobi emas). */
export function transportVaraqOqi(grid: VaraqGrid): TransportVaraq | null {
  const u = ustunTop(grid);
  if (!u) return null;
  const qatorlar: TransportVaraqQator[] = []; const ogoh: string[] = [];
  for (let i = u.hdr + 1; i < grid.length; i++) {
    const r = grid[i]; const nom = s(r[u.nom]);
    if (!nom || /^(итого|всего)/i.test(nom)) continue;
    const km = son(r[u.km]); const tkm = son(r[u.tkm]);
    if (km == null && tkm == null) continue;
    qatorlar.push({ material: nom, birlik: u.birlik >= 0 ? s(r[u.birlik]) || null : null, miqdor: u.miqdor >= 0 ? son(r[u.miqdor]) : null, tonna: u.tonna >= 0 ? son(r[u.tonna]) : null,
      km, hisob_tkm: tkm, narx: u.narx >= 0 ? son(r[u.narx]) : null, summa: u.summa >= 0 ? son(r[u.summa]) : null });
  }
  if (!qatorlar.length) return { qatorlar, tkm_narx: null, ogohlantirish: ['Transport varag\'ida qator topilmadi'] };
  // Yagona t·km narxi: eng ko'p uchragan; farqli narxlar bo'lsa ogohlantirish (RPC bitta narx qabul qiladi).
  const sanoq = new Map<number, number>();
  for (const q of qatorlar) { const n = q.narx ?? (q.summa != null && q.hisob_tkm ? q.summa / q.hisob_tkm : null); if (n != null && n > 0) { const k = Number(n.toFixed(2)); sanoq.set(k, (sanoq.get(k) ?? 0) + 1); } }
  const sirala = [...sanoq.entries()].sort((a, b) => b[1] - a[1]);
  if (sirala.length > 1) ogoh.push(`t·km narxi bir necha xil: ${sirala.map((x) => x[0]).join(', ')} — eng ko'pi olindi`);
  return { qatorlar, tkm_narx: sirala[0]?.[0] ?? null, ogohlantirish: ogoh };
}

const SOZ = (t: string): string[] => t.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter((x) => x.length >= 3 && !/^(для|при|тип|марка|класс|мм|см)$/.test(x));

/** Material nomi ↔ resurs nomi: so'z kesishmasi (Jaccard, so'z boshi bo'yicha) — 0..1. */
export function nomOxshashligi(a: string, b: string): number {
  const x = SOZ(a); const y = SOZ(b);
  if (!x.length || !y.length) return 0;
  const mos = x.filter((w) => y.some((v) => v.startsWith(w.slice(0, 5)) || w.startsWith(v.slice(0, 5)))).length;
  return mos / (x.length + y.length - mos);
}

/** zichlik = тн ÷ miqdor (3 xona; 1 ga yaqin — 1). Tonna birligida miqdor = tonna. Topilmasa null. */
export function zichlikHisobla(q: TransportVaraqQator): number | null {
  const tonnaBir = /^(Т|ТН|ТОНН?А?)$/.test(normBir(q.birlik ?? ''));
  const z = q.miqdor && q.tonna ? q.tonna / q.miqdor : tonnaBir ? 1 : null;
  if (z == null || !Number.isFinite(z) || z <= 0) return null;
  const r = Math.round(z * 1000) / 1000;
  return Math.abs(r - 1) < 0.0005 ? 1 : r;
}

/** Varaq qatorlari + smeta resurslari → `transport_yoy` yuki (kodlar: birlik mos va nom o'xshashligi >= chegara). */
export function transportYoyYuki(v: TransportVaraq, resurslar: readonly ResursQator[], chegara = 0.5): TransportYoyYuk {
  const ogoh = [...v.ogohlantirish]; const topilmadi: string[] = []; const qatorlar: TransportYoyGuruh[] = [];
  for (const q of v.qatorlar) {
    const z = zichlikHisobla(q);
    if (z == null || q.km == null) { topilmadi.push(`${q.material}: zichlik/km aniqlanmadi`); continue; }
    const bir = normBir(q.birlik ?? '');
    const kodlar = new Set<string>();
    for (const r of resurslar) {
      if (!r.kod || !r.nom) continue;
      if (bir && r.birlik && normBir(r.birlik) !== bir) continue;
      if (nomOxshashligi(q.material, r.nom) >= chegara) kodlar.add(String(r.kod).trim());
    }
    const sozlar = SOZ(q.material).slice(0, 2);
    const g: TransportYoyGuruh = { material: q.material, zichlik: z, km: q.km, ...(q.birlik ? { birlik: q.birlik } : {}), ...(q.miqdor != null ? { miqdor: q.miqdor } : {}),
      ...(q.hisob_tkm != null ? { hisob_tkm: q.hisob_tkm } : {}) };
    if (kodlar.size) g.kodlar = [...kodlar].slice(0, 100);
    else if (sozlar.length) g.nom_pattern = `%${sozlar.map((w) => w.slice(0, 6)).join('%')}%`;
    if (!kodlar.size) topilmadi.push(`${q.material}: kod topilmadi (nom_pattern taklif qilindi)`);
    qatorlar.push(g);
  }
  return { tkm_narx: v.tkm_narx, qatorlar, topilmadi, ogohlantirish: ogoh };
}

/** Smeta daraxtidan (AktNode/tree) tekis resurslar ro'yxati (kod + nom + birlik). */
export function daraxtResurslari(tree: unknown): ResursQator[] {
  const out: ResursQator[] = [];
  const yur = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const o = n as { kod?: string; nom?: string; bir?: string; birlik?: string; type?: string; children?: unknown[] };
    if (o.kod && o.nom && o.type !== 'rz' && o.type !== 'bl') out.push({ kod: o.kod, nom: o.nom, birlik: o.bir ?? o.birlik ?? null });
    for (const c of o.children ?? []) yur(c);
  };
  if (Array.isArray(tree)) tree.forEach(yur); else yur(tree);
  return out;
}