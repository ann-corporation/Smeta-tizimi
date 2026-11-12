import { useEffect, useState } from 'react';
import { smetaOzgarishQatlamOl, type SmetaOzgarishQatlam } from '../../api/t2-ozgarish';

/**
 * Smeta qatlami (asl / o'zgarishlar / joriy) — server paketi, YAGONA manba (`t2_smeta_ozgarish_qatlam_v1`).
 * Ekranlar «smeta» raqamini shu paketdan oladi; o'qilmasa `null` (chaqiruvchi mijoz hisobiga yiqilmaydi, jim 0 ham ko'rsatmaydi).
 */
export function useSmetaQatlam(obyektId: number | null | undefined): SmetaOzgarishQatlam | null {
  const [d, setD] = useState<{ id: number; q: SmetaOzgarishQatlam } | null>(null);
  useEffect(() => {
    if (obyektId == null) return;
    let tirik = true;
    Promise.resolve().then(() => smetaOzgarishQatlamOl(obyektId))
      .then((r) => { if (tirik && r.ok) setD({ id: obyektId, q: r.natija }); })
      .catch(() => undefined);
    return () => { tirik = false; };
  }, [obyektId]);
  return d && d.id === obyektId ? d.q : null;
}
