/**
 * Bozor moderatsiyasi (platforma administratori): shikoyat qilingan va yashirilgan e'lonlar; yashirish (sabab majburiy) / qaytarish. Har amal auditga yoziladi (t2_bz_audit).
 * Ruxsatni baza tekshiradi (t2_platforma_superadmin); boshqalarga PERMISSION_DENIED.
 */
import { useCallback, useEffect, useState } from 'react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { bzModRoyxat, bzModYashir, type ModElon } from '../../api/t2-bozor';

export default function BozorModeratsiya() {
  const [royxat, setRoyxat] = useState<ModElon[] | null>(null);
  const [ruxsat, setRuxsat] = useState(true);
  const [sabab, setSabab] = useState<Record<number, string>>({});
  const yukla = useCallback(async () => {
    const r = await bzModRoyxat();
    if (r.ok) setRoyxat(r.natija.elonlar); else { setRoyxat([]); setRuxsat(r.code !== 'PERMISSION_DENIED'); }
  }, []);
  useEffect(() => { void yukla(); }, [yukla]);
  const amal = async (id: number, yashir: boolean) => {
    const r = await bzModYashir(id, yashir, sabab[id]);
    if (r.ok) { toast(yashir ? t('E‘lon yashirildi.') : t('E‘lon qaytarildi (to‘xtatilgan holatda).'), 'ok'); void yukla(); } else toast(t('Bajarib bo‘lmadi. Yashirish uchun sabab kiriting.'), 'warn');
  };
  if (!ruxsat) return <Sahifa sarlavha={t('Bozor moderatsiyasi')}><p className="p-4">{t('Bu sahifa faqat platforma administratori uchun.')}</p></Sahifa>;
  return (
    <Sahifa sarlavha={t('Bozor moderatsiyasi')} tavsif={t('Shikoyat qilingan va yashirilgan e‘lonlar.')}>
      <ul className="flex flex-col gap-2 p-2">
        {(royxat ?? []).map((e) => (
          <li key={e.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <span className="font-semibold">#{e.id} {e.sarlavha}</span>
            <span className="text-[13px] text-text-mute">{e.sotuvchi_nom} · <FmtN val={e.narx_qqs_siz} /> / {e.birlik} · {e.holat} · {t('shikoyat')}: {e.shikoyat_soni}</span>
            {e.sabablar.length > 0 && <ul className="list-disc pl-5 text-[13px]">{e.sabablar.map((s, i) => <li key={i}>{s}</li>)}</ul>}
            <div className="flex flex-wrap gap-2">
              <input className="h-11 min-w-[200px] flex-1 rounded-lg border border-border px-3" aria-label={t('Sabab')} placeholder={t('Sabab')} value={sabab[e.id] ?? ''} onChange={(ev) => setSabab((s) => ({ ...s, [e.id]: ev.target.value }))} />
              {e.holat !== 'yashirin' ? <button type="button" onClick={() => void amal(e.id, true)} className="h-11 rounded-lg bg-warn px-3 text-white">{t('Yashirish')}</button>
                : <button type="button" onClick={() => void amal(e.id, false)} className="h-11 rounded-lg border border-border px-3">{t('Qaytarish')}</button>}
            </div>
          </li>
        ))}
        {royxat?.length === 0 && <p className="text-text-mute">{t('Shikoyat qilingan e‘lon yo‘q.')}</p>}
      </ul>
    </Sahifa>
  );
}
