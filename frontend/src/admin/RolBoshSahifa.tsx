import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { kontekstBoshSahifasi } from '../lib/nav/boshSahifa';
import { t } from '../i18n/til';

/** `/admin` indeksi: JORIY KOMPANIYADAGI effektiv rol bo'yicha o'z ishchi bosh sahifasiga (lib/nav/boshSahifa). */
export default function RolBoshSahifa() {
  const k = useKompaniya();
  /* KompaniyaProvider `men` kelgach joriy kompaniyani useEffect da tanlaydi — birinchi renderda `yuklanmoqda=false`,
     `joriy=null` bo'lib qoladi. Bir render kutamiz: ikkala holat bitta commitda yangilanadi. */
  const [tayyor, setTayyor] = useState(false);
  useEffect(() => { if (!k.yuklanmoqda) setTayyor(true); }, [k.yuklanmoqda]);
  if (k.yuklanmoqda || !tayyor) return <div className="p-6 text-text-dim">{t('Yuklanmoqda...')}</div>;
  return <Navigate to={kontekstBoshSahifasi(k)} replace />;
}
