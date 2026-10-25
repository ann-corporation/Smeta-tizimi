import { Navigate } from 'react-router-dom';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { rolBoshSahifasi } from '../lib/nav/boshSahifa';
import { t } from '../i18n/til';

/** `/admin` indeksi: joriy kompaniyadagi effektiv rol bo'yicha o'z ishchi bosh sahifasiga (lib/nav/boshSahifa). */
export default function RolBoshSahifa() {
  const k = useKompaniya();
  if (k.yuklanmoqda) return <div className="p-6 text-text-dim">{t('Yuklanmoqda...')}</div>;
  const yol = k.superadmin ? rolBoshSahifasi('superadmin') : rolBoshSahifasi(k.joriy?.rol, k.joriy?.permissions);
  return <Navigate to={yol} replace />;
}
