import type { PaketJavob } from '../api/t2-obyekt-paket';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { paketDekod, paketdanHolatlar, paketdanQatorlar } from './paket';
import type { ObyektOmbor } from './obyekt-ombor';

export type OqishNatija = { rows: T2Qator[]; states: T2QatorHolat[]; serverTasdiq: boolean; manba: 'kesh' | 'paket' | 'eski' };
export type OqishPort = {
  paket: (id: number) => Promise<PaketJavob>;
  eski: (id: number) => Promise<{ rows: T2Qator[]; states: T2QatorHolat[] }>;
};
type Tanlov = {
  obyektId: number; kompaniyaId: number; yoqilgan: boolean; paketRuxsat: boolean;
  /** Joriy session/obyekt epoch tekshiruvi: eski so'rov yangi UIga yozmaydi. */
  joriy: () => boolean;
  korsat: (natija: OqishNatija) => void;
  ombor?: ObyektOmbor;
};
/** API portli o'qish oqimi. Shlyuz har safar haqiqiy vakolatni tekshiradi. */
export async function obyektOqi(t: Tanlov, port: OqishPort): Promise<void> {
  if (!t.joriy()) return;
  const korsat = (v: OqishNatija) => { if (t.joriy()) t.korsat(v); };
  if (!t.yoqilgan || !t.paketRuxsat) {
    const x = await port.eski(t.obyektId);
    korsat({ ...x, serverTasdiq: true, manba: 'eski' }); return;
  }
  // Server so'rovi diskni kutmay boshlanadi. Cache serverdan keyin ko'rinmasin.
  let serverTugadi = false;
  void t.ombor?.och(t.obyektId).then(h => {
    if (h?.paket && !serverTugadi) korsat({ rows: paketdanQatorlar(h.paket), states: paketdanHolatlar(h.paket), serverTasdiq: false, manba: 'kesh' });
  }).catch(() => {});
  let r: PaketJavob;
  try { r = await port.paket(t.obyektId); }
  finally { serverTugadi = true; }
  if (!t.joriy()) return;
  if (!r.ok) {
    // 403 paketning kengroq f2/narx vakolati yo'qligi bo'lishi mumkin.
    // Kesh authoritative emas; eski API o'z ruxsatini serverda tekshiradi.
    if (r.status === 401 || r.status === 403) await t.ombor?.yop();
    if (r.status === 403) {
      const x = await port.eski(t.obyektId);
      korsat({ ...x, serverTasdiq: true, manba: 'eski' }); return;
    }
    throw new Error('OBYEKT_PAKET_READ_FAILED');
  }
  if (r.paket.obyekt_id !== t.obyektId || r.paket.kompaniya_id !== t.kompaniyaId) throw new Error('OMBOR_SCOPE_MISMATCH');
  const p = paketDekod(r.paket);
  korsat({ rows: paketdanQatorlar(p), states: paketdanHolatlar(p), serverTasdiq: true, manba: 'paket' });
  // Disk quota/private mode serverning yaroqli javobini bekor qilmaydi.
  if (t.ombor && t.joriy()) void t.ombor.serverdan(r.paket).catch(() => {});
}
