/** F2/fakt import: eski → aktual qator voris zanjiri va mavjud fakt (FAQAT O'QISH; yozish sbFaktYoz yo'lida). Mantiq — lib/f2-moslash-v3/aktual. */
import { sbOqi } from './supabase';
import { vorisXaritasi, type AQator } from '../lib/f2-moslash-v3/aktual';

type Eski = { id: number; ota_id: number | null; kod: string | null; nom: string | null; birlik: string | null };

/** Obyektning almashtirilgan qatorlari bo'lsa — voris xaritasi (eski id → faol id); yo'q bo'lsa bo'sh. */
export async function aktualVorisOl(obyektId: number, faol: ReadonlyArray<AQator>): Promise<Map<number, number>> {
  const eski = await sbOqi<Eski>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&versiya_holat=eq.almashtirilgan`, ustunlar: 'id,ota_id,kod,nom,birlik', limit: 50000 }).catch(() => null);
  if (!eski || !eski.ok || !(eski.qatorlar ?? []).length) return new Map();
  const vers = await sbOqi<{ id: number }>({ jadval: 't2_smeta_versiya', filtr: `obyekt_id=eq.${obyektId}`, ustunlar: 'id', limit: 200 }).catch(() => null);
  const vIds = (vers && vers.ok ? vers.qatorlar ?? [] : []).map((v) => v.id);
  let juftlar: Array<{ eskiId: number; yangiId: number }> = [];
  if (vIds.length) {
    const f = `versiya_id=in.(${vIds.join(',')})`;
    const [poz, mos] = await Promise.all([
      sbOqi<{ id: number; manba: { qator_id?: number } | null }>({ jadval: 't2_smeta_versiya_pozitsiya', filtr: f, ustunlar: 'id,manba', limit: 50000 }).catch(() => null),
      sbOqi<{ pozitsiya_id: number | null; qator_id: number | null; tasdiq: string }>({ jadval: 't2_smeta_versiya_moslik', filtr: f, ustunlar: 'pozitsiya_id,qator_id,tasdiq', limit: 50000 }).catch(() => null),
    ]);
    const eskiId = new Map((poz && poz.ok ? poz.qatorlar ?? [] : []).filter((p) => p.manba?.qator_id != null).map((p) => [p.id, Number(p.manba!.qator_id)]));
    juftlar = (mos && mos.ok ? mos.qatorlar ?? [] : []).flatMap((m) => (m.pozitsiya_id != null && m.qator_id != null && m.tasdiq !== 'rad' && eskiId.has(m.pozitsiya_id) ? [{ eskiId: eskiId.get(m.pozitsiya_id)!, yangiId: Number(m.qator_id) }] : []));
  }
  const barcha: AQator[] = [...faol, ...(eski.qatorlar ?? []).map((q) => ({ id: q.id, otaId: q.ota_id, kod: q.kod, nom: q.nom, birlik: q.birlik, faol: false }))];
  return vorisXaritasi(barcha, juftlar);
}

/** Tizimdagi fakt (t2_akt tur='fakt', bekor emas) — qator bo'yicha yozuvlar (eski qatordagilari ham). */
export async function faktYozuvlariOl(obyektId: number): Promise<Array<{ qatorId: number; hajm: number | null }>> {
  const a = await sbOqi<{ id: number }>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.fakt&holat=neq.bekor`, ustunlar: 'id', limit: 50000 });
  if (!a.ok) throw new Error('Fakt hujjatlari o‘qilmadi.');
  const ok = new Set((a.qatorlar ?? []).map((x) => x.id));
  if (!ok.size) return [];
  const q = await sbOqi<{ akt_id: number; qator_id: number; hajm: number | null }>({ jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${obyektId}`, ustunlar: 'akt_id,qator_id,hajm', limit: 200000 });
  if (!q.ok) throw new Error('Fakt qatorlari o‘qilmadi.');
  return (q.qatorlar ?? []).filter((x) => ok.has(x.akt_id)).map((x) => ({ qatorId: x.qator_id, hajm: x.hajm }));
}
