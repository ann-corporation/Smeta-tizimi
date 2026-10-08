import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { javobBaho, type JavobBahosi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';

const MATN: Record<JavobBahosi, string> = {
  yaxshi: 'Rahmat — bu uslub saqlab qolinadi', yomon: 'Rahmat — bu javob tizim yaxshilanishiga signal bo‘ldi',
  qisqaroq: 'Tushundim — keyingi javoblar qisqaroq bo‘ladi', batafsilroq: 'Tushundim — keyingi javoblar batafsilroq bo‘ladi', noaniq: 'Rahmat — aniqroq javob berishga harakat qilamiz',
};
const TUGMA = 'rounded px-1.5 py-0.5 text-[10px] text-text-mute hover:bg-white/5 hover:text-text disabled:opacity-40';

/**
 * Javobga baho: 👍/👎 va «qisqaroq / batafsilroq / noaniq». «Qisqaroq/batafsilroq» sizning uslubingizni o'zgartiradi,
 * «yomon/noaniq» tizim agentiga (matnsiz) signal bo'ladi. Savol va javob matni yuborilmaydi.
 */
export function AiBaho({ kompaniyaId, profil, sahifa }: { kompaniyaId: number; profil?: string; sahifa?: string }) {
  const [berildi, setBerildi] = useState<JavobBahosi | null>(null);
  const yubor = async (b: JavobBahosi) => {
    setBerildi(b);
    const r = await javobBaho(kompaniyaId, b, { profil, sahifa });
    if (!r.ok) setBerildi(null);
  };
  if (berildi) return <div className="mt-1 text-[10px] text-text-mute" role="status">{t(MATN[berildi])}</div>;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-0.5" aria-label={t('Javobni baholash')}>
      <button type="button" className={TUGMA} aria-label={t('Javob yaxshi')} title={t('Javob yaxshi')} onClick={() => void yubor('yaxshi')}><ThumbsUp size={12} /></button>
      <button type="button" className={TUGMA} aria-label={t('Javob yaroqsiz')} title={t('Javob yaroqsiz')} onClick={() => void yubor('yomon')}><ThumbsDown size={12} /></button>
      <button type="button" className={TUGMA} onClick={() => void yubor('qisqaroq')}>{t('Qisqaroq')}</button>
      <button type="button" className={TUGMA} onClick={() => void yubor('batafsilroq')}>{t('Batafsilroq')}</button>
      <button type="button" className={TUGMA} onClick={() => void yubor('noaniq')}>{t('Tushunarsiz')}</button>
    </div>
  );
}
