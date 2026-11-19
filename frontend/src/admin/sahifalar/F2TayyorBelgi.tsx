/**
 * F-2 sahifasida yangilik belgisi (egasi 2026-11-19): «Excel tayyor · v5 · 2 daqiqa oldin» yoki «Yangilanmoqda». Diskdagi tayyor versiya holati
 * (t2_hujjat_tayyor_ol_v1); yangilanayotgan bo'lsa har 20 soniyada qayta tekshiriladi. Yuklab olish tugmasi sahifaning o'z yo'lida (Diskdan zudlik bilan).
 */
import { useEffect, useState } from 'react';
import { tayyorHolatOl, type TayyorHolat } from '../../api/hujjat-paket';
import { yangilikMatni } from '../../lib/hujjat-paket/royxat';

export function F2TayyorBelgi({ kompaniyaId, aktId }: { kompaniyaId: number; aktId: number }) {
  const [h, setH] = useState<TayyorHolat | null>(null);
  useEffect(() => {
    let tugadi = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const ol = async () => {
      const r = await tayyorHolatOl(kompaniyaId, aktId);
      if (tugadi) return;
      setH(r);
      if (r && (r.yangilanmoqda || r.faylId == null)) timer = setTimeout(() => void ol(), 20_000);
    };
    void ol();
    return () => { tugadi = true; if (timer) clearTimeout(timer); };
  }, [kompaniyaId, aktId]);
  if (!h) return null;
  const matn = yangilikMatni({ fayl_id: h.faylId, versiya: h.versiya, yangilandi: h.yangilandi, yangilanmoqda: h.yangilanmoqda, navbat_holat: h.yangilanmoqda ? 'kutmoqda' : null });
  return <span className="text-xs opacity-80" role="status" data-testid="f2-tayyor-belgi">{matn}</span>;
}
