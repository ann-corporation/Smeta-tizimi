import { useState, useSyncExternalStore } from 'react';
import { CloudDownload } from 'lucide-react';
import { oflaynKorinish, oflaynObuna } from './holat';
import { oflaynUchunTayyorla } from './tayyorla';
import { t } from '../../i18n/til';

/** «Oflayn uchun tayyorlash» tugmasi: faqat native ilovada (ko'prik tayyor bo'lganda) ko'rinadi. */
export function OflaynTayyorlash({ obyektIds }: { obyektIds: readonly number[] }) {
  const k = useSyncExternalStore(oflaynObuna, oflaynKorinish, oflaynKorinish);
  const [jarayon, setJarayon] = useState<{ n: number; jami: number } | null>(null);
  const [xabar, setXabar] = useState('');
  if (!k.tayyor || obyektIds.length === 0) return null;
  const bos = async () => {
    setXabar('');
    setJarayon({ n: 0, jami: obyektIds.length });
    try {
      const r = await oflaynUchunTayyorla(obyektIds, { onProgress: (n, jami) => setJarayon({ n, jami }) });
      setXabar(r.xato.length === 0
        ? t('Oflayn uchun tayyor: {n} ta obyekt.', { n: r.tayyor.length })
        : t('Tayyor: {n} ta obyekt; {m} ta yuklash bajarilmadi — aloqani tekshirib qayta urinib ko‘ring.', { n: r.tayyor.length, m: r.xato.length }));
    } catch {
      setXabar(t('Oflayn uchun tayyorlash faqat internet bor paytda mumkin.'));
    } finally {
      setJarayon(null);
    }
  };
  return (
    <>
      <button type="button" className="fz-btn" onClick={() => void bos()} disabled={jarayon !== null} title={t('Obyektlar ma’lumotini oflayn ishlash uchun qurilmaga yuklaydi')}>
        <CloudDownload aria-hidden="true" />
        {jarayon ? `${t('Yuklanmoqda…')} ${jarayon.n}/${jarayon.jami}` : t('Oflayn uchun tayyorlash')}
      </button>
      {xabar && <span role="status" className="text-text-dim" style={{ fontSize: 12 }}>{xabar}</span>}
    </>
  );
}