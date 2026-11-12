import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { kontekstBoshSahifasi, YANGI_HISOB_KIRISH } from '../lib/nav/boshSahifa';
import { t } from '../i18n/til';
import { oxirgiObyektOl } from '../umumiy/kontekst/oxirgiObyekt';

/** `/admin` indeksi: JORIY KOMPANIYADAGI effektiv rol bo'yicha o'z ishchi bosh sahifasiga (lib/nav/boshSahifa). */
export default function RolBoshSahifa() {
  const k = useKompaniya();
  /* KompaniyaProvider `men` kelgach joriy kompaniyani useEffect da tanlaydi — birinchi renderda `yuklanmoqda=false`,
     `joriy=null` bo'lib qoladi. Bir render kutamiz: ikkala holat bitta commitda yangilanadi. */
  const [tayyor, setTayyor] = useState(false);
  useEffect(() => { if (!k.yuklanmoqda) setTayyor(true); }, [k.yuklanmoqda]);
  if (k.yuklanmoqda || !tayyor) return <div className="p-6 text-text-dim">{t('Yuklanmoqda...')}</div>;
  /* Ishchi rollar (PTO, prorab, buxgalter): obyektlar ro'yxati o'rniga OXIRGI ishlagan obyekti (shu kompaniyada) ochiladi. */
  /* A'zoligi yo'q (yangi) foydalanuvchi — «Kompaniyangizni oching» ekraniga (superadmin global rejimi bundan mustasno). */
  if (!k.superadmin && !k.joriy && !k.kompaniyalar.length) return <Navigate to={YANGI_HISOB_KIRISH} replace />;
  const yol = kontekstBoshSahifasi(k);
  const oxirgi = yol === '/admin/obyektlar' ? oxirgiObyektOl(k.joriy?.id) : null;
  return <Navigate to={oxirgi ? `/admin/holat/${oxirgi.objectId}` : yol} replace />;
}
