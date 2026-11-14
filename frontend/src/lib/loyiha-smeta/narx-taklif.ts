/**
 * narx-taklif.ts — «loyihada bor, smetada yo'q» ish uchun mavjud NARX MANBALARIDAN (t2_narx_manba_qator: shartnoma, kommersiya taklifi, bozor, RES) narx taklifi.
 * Faqat o'qiydi; manba va NDS holati ko'rsatiladi; narx QQS SIZ ga keltiriladi (hisob-yadro qqsSizNarx). NDS holati noma'lum manba — taklif qilinmaydi
 * (o'ylab topilmaydi). Narx birlik koeffitsiyenti bilan (100 м3 ↔ м3) loyiha birligiga keltiriladi.
 */
import { qqsSizNarx, yaxlit2 } from '../hisob-yadro';
import { birlikTahlil } from './birlik';

export type ManbaQator = { id: number; manba_id: number; nom: string; birlik: string | null; narx: number | null };
export type ManbaMeta = { id: number; nom: string; raqam: string | null; sana: string | null; tur: string; nds_holati: 'nds_siz' | 'nds_bilan' | 'nomalum' };
export type NarxTaklifi = { narxQQSsiz: number; ball: number; manba: string; manbaTur: string; qatorNom: string; qatorId: number; ndsdan: boolean };

const sozlar = (s: string) => new Set(s.toLowerCase().replace(/[^a-zа-я0-9]+/g, ' ').split(' ').filter((w) => w.length > 3));

export function narxTakliflari(el: { nom: string; birlik: string }, qatorlar: readonly ManbaQator[], manbalar: ReadonlyMap<number, ManbaMeta>, qqsFoiz = 12, limit = 3): NarxTaklifi[] {
  const eb = birlikTahlil(el.birlik); if (!eb.baza) return [];
  const es = sozlar(el.nom); if (es.size === 0) return [];
  const out: NarxTaklifi[] = [];
  for (const q of qatorlar) {
    const m = manbalar.get(q.manba_id);
    if (!m || m.nds_holati === 'nomalum' || q.narx == null || !(q.narx > 0)) continue;
    const qb = birlikTahlil(q.birlik); if (qb.baza !== eb.baza) continue;
    const qs = sozlar(q.nom); const umum = [...es].filter((w) => qs.has(w)).length;
    const ball = umum / Math.max(es.size, 1);
    if (umum < 2 && ball < 0.5) continue;
    const asos = m.nds_holati === 'nds_bilan' ? qqsSizNarx(q.narx, qqsFoiz) : q.narx;
    const birlikka = yaxlit2((asos / qb.koef) * eb.koef);   // manba birligidagi narx -> loyiha birligidagi narx
    out.push({ narxQQSsiz: birlikka, ball: Math.round(ball * 1000) / 1000, manba: [m.nom, m.raqam, m.sana].filter(Boolean).join(' · '), manbaTur: m.tur, qatorNom: q.nom, qatorId: q.id, ndsdan: m.nds_holati === 'nds_bilan' });
  }
  return out.sort((a, b) => b.ball - a.ball || a.narxQQSsiz - b.narxQQSsiz).slice(0, limit);
}
