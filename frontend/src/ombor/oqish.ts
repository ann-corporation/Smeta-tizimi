import type { PaketJavob } from '../api/t2-obyekt-paket';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { paketDekod, paketdanHolatlar, paketdanQatorlar } from './paket';
import type { ObyektOmbor } from './obyekt-ombor';
import type { OmborSessiya } from './sessiya';

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
  /** No trusted object authorizer wired => server only, no cache access. */
  sessiya?: OmborSessiya;
};
/** API portli o'qish oqimi. Shlyuz har safar haqiqiy vakolatni tekshiradi. */
export async function obyektOqi(t: Tanlov, port: OqishPort): Promise<void> {
  if (!t.joriy()) return;
  const korsat = (v: OqishNatija) => { if (t.joriy()) t.korsat(v); };
  if (!t.yoqilgan || !t.paketRuxsat) {
    const x = await port.eski(t.obyektId);
    korsat({ ...x, serverTasdiq: true, manba: 'eski' }); return;
  }
  const ruxsat = await t.sessiya?.tekshirObyekt(t.obyektId, t.kompaniyaId);
  if (ruxsat && !ruxsat.ok) {
    if (ruxsat.status === 403 && ruxsat.eskiJoriy?.() && t.joriy()) {
      const x = await port.eski(t.obyektId);
      if (ruxsat.eskiJoriy() && t.joriy()) korsat({ ...x, serverTasdiq: true, manba: 'eski' });
    }
    return;
  }
  const oqish = ruxsat?.ok ? ruxsat.oqish : undefined;
  const joriy = () => t.joriy() && (!oqish || oqish.joriy());
  if (!joriy()) return;
  // Online object authorization has completed BEFORE memory or disk access.
  let serverTugadi = false;
  void oqish?.och().then(h => {
    if (h?.paket && !serverTugadi && joriy()) korsat({ rows: paketdanQatorlar(h.paket), states: paketdanHolatlar(h.paket), serverTasdiq: false, manba: 'kesh' });
  }).catch(() => {});
  let r: PaketJavob;
  try { r = await port.paket(t.obyektId); }
  finally { serverTugadi = true; }
  if (!joriy()) return;
  if (!r.ok) {
    let eskiJoriy = joriy;
    // 403 paketning kengroq f2/narx vakolati yo'qligi bo'lishi mumkin.
    // Kesh authoritative emas; eski API o'z ruxsatini serverda tekshiradi.
    if (r.status === 401 || r.status === 403) {
      // Invalidate immediately, without waiting for a blocked disk write.
      if (t.sessiya) eskiJoriy = t.sessiya.paketRad();
      void t.ombor?.yop().catch(() => {});
    }
    if (r.status === 403) {
      const x = await port.eski(t.obyektId);
      if (eskiJoriy() && t.joriy()) korsat({ ...x, serverTasdiq: true, manba: 'eski' }); return;
    }
    throw new Error('OBYEKT_PAKET_READ_FAILED');
  }
  if (r.paket.obyekt_id !== t.obyektId || r.paket.kompaniya_id !== t.kompaniyaId) {
    void t.sessiya?.yop();
    throw new Error('OMBOR_SCOPE_MISMATCH');
  }
  const p = paketDekod(r.paket);
  korsat({ rows: paketdanQatorlar(p), states: paketdanHolatlar(p), serverTasdiq: true, manba: 'paket' });
  // Disk quota/private mode serverning yaroqli javobini bekor qilmaydi.
  if (joriy()) void oqish?.serverdan(r.paket).catch(() => {});
}
