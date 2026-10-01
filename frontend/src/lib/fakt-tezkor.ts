/**
 * Tezkor fakt kiritish (egasi, 2026-10-01): "har bir faktni kiritib biroz kutish kerak ...
 * birdan bittada bir nechtasini saqlay oladigan qilish kerak".
 *
 * Operator jadvalda bir nechta qatorga bugungi bajarilgan hajmni yozadi; hammasi BITTA
 * `fakt_yoz_v2` chaqiruvida (bitta operation_id, bitta tranzaksiya) saqlanadi. Bu modul sof
 * mantiq: qator ro'yxati (bo'lim yo'li bilan) va kiritilgan qiymatlarni paketga aylantirish.
 */
import type { T2Qator } from '../api/supabase';
import { faktQoldaKiritiladimi } from './fakt-input-policy';

export type TezkorHolat = { qator_id: number; smeta_hajm: number | null; fakt_hajm: number | null; f2_mumkin_hajm?: number | null };

export type TezkorQator = {
  id: number; tur: string; kod: string | null; nom: string; birlik: string | null;
  /** Bo'lim yo'li: "1. Земляные работы › 1.2 ..." */
  bolim: string; bolimId: number | null;
  /** Zamena qilinadigan qatorning otasi (addrepl `ota_qator_id`) va uning versiyasi. */
  otaId: number | null; otaVersiya: number | null;
  smeta: number | null; fakt: number; qoldiq: number | null;
  qoshimcha: boolean; zamena: boolean;
};

/** Daraxt qatorlaridan fakt kiritiladigan (BL/MAT/OB) qatorlar ro'yxati — daraxt tartibida. */
export function tezkorQatorlar(rows: readonly T2Qator[], states: readonly TezkorHolat[]): TezkorQator[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const bolimYoli = (r: T2Qator): { yol: string; id: number | null } => {
    const qism: string[] = []; let id: number | null = null;
    let p = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    while (p) {
      if (p.tur === 'rz') { qism.unshift([p.kod, p.nom].filter(Boolean).join(' ')); id ??= p.id; }
      p = p.ota_id != null ? byId.get(p.ota_id) : undefined;
    }
    return { yol: qism.join(' › '), id };
  };
  const out: TezkorQator[] = [];
  for (const r of rows) {
    if (!faktQoldaKiritiladimi(r.tur || '')) continue;
    const h = holat.get(r.id);
    const b = bolimYoli(r);
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    const smeta = h?.smeta_hajm ?? r.hajm ?? null;
    const fakt = Number(h?.fakt_hajm ?? 0);
    out.push({
      id: r.id, tur: r.tur || '', kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik,
      bolim: b.yol, bolimId: b.id, otaId: r.ota_id ?? null, otaVersiya: ota?.versiya ?? null,
      smeta, fakt, qoldiq: smeta == null ? null : Math.round((smeta - fakt) * 1e6) / 1e6,
      qoshimcha: !!r.qoshimcha && !r.zamena, zamena: !!r.zamena,
    });
  }
  return out;
}

/** "12,5" → 12.5; bo'sh → null; noto'g'ri → NaN. */
export function sonOqi(v: string): number | null {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export type TezkorXato = { qatorId: number; xato: 'SON_EMAS' | 'NOL' | 'MANFIY_KATTA' };

/**
 * Kiritilgan "bugun bajarildi" qiymatlarini bitta paketga aylantiradi.
 * Manfiy qiymat (tuzatish) ruxsat — lekin jami faktni manfiyga tushirmasligi kerak.
 */
export function tezkorPaket(kiritilgan: Readonly<Record<number, string>>, qatorlar: readonly TezkorQator[]) {
  const byId = new Map(qatorlar.map((q) => [q.id, q]));
  const qatorlarOut: { qator_id: number; hajm: number }[] = [];
  const xatolar: TezkorXato[] = [];
  for (const [k, v] of Object.entries(kiritilgan)) {
    const id = Number(k); const q = byId.get(id);
    if (!q) continue;
    const n = sonOqi(v);
    if (n == null) continue;
    if (!Number.isFinite(n)) { xatolar.push({ qatorId: id, xato: 'SON_EMAS' }); continue; }
    if (n === 0) { xatolar.push({ qatorId: id, xato: 'NOL' }); continue; }
    if (q.fakt + n < 0) { xatolar.push({ qatorId: id, xato: 'MANFIY_KATTA' }); continue; }
    qatorlarOut.push({ qator_id: id, hajm: n });
  }
  return { qatorlar: qatorlarOut, xatolar, ok: xatolar.length === 0 && qatorlarOut.length > 0 };
}

export const TEZKOR_XATO_MATN: Record<TezkorXato['xato'], string> = {
  SON_EMAS: 'Son emas',
  NOL: '0 kiritilmaydi',
  MANFIY_KATTA: 'Jami fakt manfiy bo‘lib qoladi',
};
