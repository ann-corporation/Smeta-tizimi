/** Test yordamchisi: QulfStore xotirada (SQL funksiyalarining qoidalarini aks ettiradi: 5 xato -> 15 daq blok, 10 xato -> qayta kirish). Productionda ishlatilmaydi. */
import type { KalitQator, QulfStore } from './qulf-amal';
import type { QulfQator, Rejim, Talab } from './qulf';

export function xotiraStore(hozir: () => number = () => Date.now()): QulfStore & { qator: Map<number, QulfQator>; kl: KalitQator[]; siyosat: Map<number, Rejim>; ishlatilgan: Set<string> } {
  const qator = new Map<number, QulfQator>(); const kl: KalitQator[] = []; const siyosat = new Map<number, Rejim>(); const ishlatilgan = new Set<string>();
  let nid = 1;
  const yangiQator = (uid: number): QulfQator => ({ foydalanuvchi_id: uid, pin_hash: null, xato_soni: 0, jami_xato: 0, bloklangan_gacha: null, qayta_kirish_vaqti: null, bosh_vaqt_daq: 10 });
  return {
    qator, kl, siyosat, ishlatilgan,
    async holat(uid) { return qator.get(uid) ?? null; },
    async pinYoz(uid, hash) { const q = qator.get(uid) ?? yangiQator(uid); qator.set(uid, { ...q, pin_hash: hash, xato_soni: 0, jami_xato: 0, bloklangan_gacha: null }); },
    async pinOchir(uid) { const q = qator.get(uid); if (q) qator.set(uid, { ...q, pin_hash: null, xato_soni: 0, jami_xato: 0, bloklangan_gacha: null }); },
    async vaqtYoz(uid, daq) { qator.set(uid, { ...(qator.get(uid) ?? yangiQator(uid)), bosh_vaqt_daq: daq }); },
    async urinish(uid, ok) {
      const q = qator.get(uid); if (!q) return { code: 'PIN_YOQ' };
      if (ok) { qator.set(uid, { ...q, xato_soni: 0, jami_xato: 0, bloklangan_gacha: null }); return {}; }
      let { xato_soni, jami_xato, bloklangan_gacha, qayta_kirish_vaqti } = q; xato_soni++; jami_xato++;
      if (xato_soni >= 5) { bloklangan_gacha = new Date(hozir() + 15 * 60_000).toISOString(); xato_soni = 0; }
      let code = bloklangan_gacha && Date.parse(bloklangan_gacha) > hozir() ? 'BLOKLANGAN' : 'PIN_NOTOGRI';
      if (jami_xato >= 10) { qayta_kirish_vaqti = new Date(hozir()).toISOString(); jami_xato = 0; xato_soni = 0; bloklangan_gacha = null; code = 'QAYTA_KIRISH_KERAK'; }
      qator.set(uid, { ...q, xato_soni, jami_xato, bloklangan_gacha, qayta_kirish_vaqti });
      return { code };
    },
    async chaqiriqIshlat(jti) { if (ishlatilgan.has(jti)) return false; ishlatilgan.add(jti); return true; },
    async kalitlar(uid) { return kl.filter(x => x.foydalanuvchi_id === uid); },
    async kalitQosh(uid, k) { kl.push({ ...k, id: nid++, foydalanuvchi_id: uid, yaratildi: new Date(hozir()).toISOString(), oxirgi_ishlatildi: null }); },
    async kalitHisob(id, hisob) { const x = kl.find(y => y.id === id); if (x) x.hisob = hisob; },
    async kalitOchir(uid, id) { const i = kl.findIndex(x => x.id === id && x.foydalanuvchi_id === uid); if (i < 0) return false; kl.splice(i, 1); return true; },
    async siyosatOl(kid) { return siyosat.get(kid) ?? null; },
    async siyosatYoz(kid, r) { siyosat.set(kid, r); },
    async talab(uid, kid): Promise<Talab> {
      const rejim: Rejim = (kid != null ? siyosat.get(kid) : (siyosat.size > 0 && [...siyosat.values()].every(v => v === 'off') ? 'off' : undefined)) ?? 'pin';
      const pin = !!qator.get(uid)?.pin_hash; const kalit = kl.some(x => x.foydalanuvchi_id === uid);
      return { rejim, pin, kalit: kalit && pin, talab: rejim !== 'off' && pin };
    },
  };
}
