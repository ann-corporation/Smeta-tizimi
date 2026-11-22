import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { transportAudit, transportBelgila } from '../../api/transport-api';
import { transportMalumotOl } from '../../api/t2-transport';
import type { T2Qator } from '../../api/supabase';
import type { TransportUsul } from './kirish';
import { transportBelgiXaritasi, type AuditJavob } from './panel';

/**
 * Obyekt transport ma'lumoti: belgi xaritasi (smeta ro'yxati belgilari) + audit (panel). Transport maydonlari `t2_daraxt` da yo'q —
 * alohida kichik o'qish (`transportMalumotOl`). O'qilmasa belgi ko'rinmaydi, lekin sahifa buzilmaydi (xato panelda ko'rsatiladi).
 */
export function useTransport(kompaniyaId: number | null, obyektId: number | null, qatorlar: readonly T2Qator[], tayyor: boolean, auditKerak: boolean) {
  const [malumot, setMalumot] = useState<Awaited<ReturnType<typeof transportMalumotOl>> | null>(null);
  const [audit, setAudit] = useState<AuditJavob | null>(null);
  const [xato, setXato] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const eng = useRef(0);

  const yangila = useCallback(async () => {
    if (kompaniyaId == null || obyektId == null) return;
    const n = ++eng.current;
    setYuklanmoqda(true); setXato('');
    try {
      const [m, a] = await Promise.all([transportMalumotOl(obyektId), auditKerak ? transportAudit(kompaniyaId, obyektId) : Promise.resolve(null)]);
      if (n !== eng.current) return;
      setMalumot(m);
      if (a) { if (a.ok) setAudit(a); else setXato(a.xabar ?? a.code ?? 'AUDIT_XATO'); }
    } catch { if (n === eng.current) setXato('TRANSPORT_OQILMADI'); }
    finally { if (n === eng.current) setYuklanmoqda(false); }
  }, [kompaniyaId, obyektId, auditKerak]);

  useEffect(() => { setMalumot(null); setAudit(null); }, [obyektId, kompaniyaId]);
  useEffect(() => { if (tayyor) void yangila(); }, [tayyor, yangila, qatorlar.length]);

  /** Daraxt qatorlari + transport maydonlari (belgisiz qator o'zgarmaydi). */
  const birlashgan = useMemo(() => (!malumot?.size ? qatorlar : qatorlar.map((r) => {
    const x = malumot.get(r.id);
    return x ? { ...r, transport_usul: x.transport_usul, transport_manba_qator_id: x.transport_manba_qator_id == null ? null : Number(x.transport_manba_qator_id) } : r;
  })), [qatorlar, malumot]);
  const belgilar = useMemo(() => transportBelgiXaritasi(birlashgan), [birlashgan]);

  const belgila = useCallback(async (qatorId: number, usul: TransportUsul) => {
    if (kompaniyaId == null || obyektId == null) return { ok: false, code: 'OBYEKT_KERAK' };
    const r = await transportBelgila(kompaniyaId, obyektId, [qatorId], usul);
    if (r.ok) await yangila();
    return r;
  }, [kompaniyaId, obyektId, yangila]);

  return { qatorlar: birlashgan, belgilar, audit, xato, yuklanmoqda, yangila, belgila };
}
