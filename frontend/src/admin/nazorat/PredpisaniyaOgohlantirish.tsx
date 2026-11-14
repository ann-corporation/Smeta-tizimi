/**
 * PredpisaniyaOgohlantirish.tsx - pudratchi uchun: muddati o'tgan predpisaniyalar haqida ogohlantirish. Har kirgan sahifada
 * (AdminShell) ko'rinadi, shuning uchun "Bugun" ko'rinishida ham bor. Bitta yengil so'rov (mavjud murojaatlar ro'yxati), 10 daqiqa keshlanadi.
 * Ma'lumot yo'q yoki xato bo'lsa - hech narsa ko'rsatilmaydi (ogohlantirish yolg'on bo'lmasligi uchun).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { murojaatlarOl } from '../../api/t2-tomon';
import { t } from '../../i18n/til';

const KESH_MUDDATI = 10 * 60_000;
type Kesh = { vaqt: number; son: number; kritik: number };

function keshOl(k: number): Kesh | null {
  try { const x = JSON.parse(sessionStorage.getItem(`pred-ogoh:${k}`) ?? 'null') as Kesh | null; return x && Date.now() - x.vaqt < KESH_MUDDATI ? x : null; } catch { return null; }
}
function keshYoz(k: number, v: Kesh) { try { sessionStorage.setItem(`pred-ogoh:${k}`, JSON.stringify(v)); } catch { /* xotira yopiq */ } }

export function PredpisaniyaOgohlantirish({ kompaniyaId }: { kompaniyaId: number | null }) {
  const [x, setX] = useState<Kesh | null>(null);
  useEffect(() => {
    if (!kompaniyaId) { setX(null); return; }
    const k = keshOl(kompaniyaId);
    if (k) { setX(k); return; }
    let bekor = false;
    void murojaatlarOl(kompaniyaId, { yonalish: 'menga', holat: 'ochiq' }).then((r) => {
      if (bekor || !r.ok || !Array.isArray(r.natija)) return;
      const kech = r.natija.filter((m) => m.turi === 'predpisaniya' && m.kechikkan);
      const v = { vaqt: Date.now(), son: kech.length, kritik: kech.filter((m) => m.muhimlik === 'kritik').length };
      keshYoz(kompaniyaId, v); setX(v);
    }).catch(() => undefined);
    return () => { bekor = true; };
  }, [kompaniyaId]);
  if (!x || x.son === 0) return null;
  return (
    <div role="alert" data-testid="predpisaniya-ogoh" className="flex-shrink-0 z-20 bg-danger/10 border-b border-danger/30 px-6 py-2 flex items-center gap-2 text-sm text-text">
      <AlertTriangle size={16} className="text-danger flex-shrink-0" />
      <span className="flex-1">{t('Muddati o‘tgan predpisaniya')}: <strong>{x.son}</strong>{x.kritik > 0 ? ` (${t('kritik')}: ${x.kritik})` : ''}. {t('Foto bilan javob bering.')}</span>
      <Link to="/admin/murojaatlar" className="text-accent underline">{t('Ko‘rish')}</Link>
    </div>
  );
}
