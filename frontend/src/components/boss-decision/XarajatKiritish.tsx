import { useState } from 'react';
import { t } from '../../i18n/til';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { pulXarajatKirit } from '../../api/t2-pul-tahlil';

/**
 * Haqiqiy xarajatni qo'lda kiritish (egasi 2026-10-24, pul tahlili P1). Bitta qator: sana, kategoriya, obyekt, summa, dalil (hujjat).
 * Idempotent: bir formada operation_id saqlanadi — qayta bosish ikkinchi qator yaratmaydi. Narx NDS siz. Ruxsat: financial.write.
 */
const KATLAR: ReadonlyArray<{ kod: string; nom: string }> = [
  { kod: 'ЧЕЛ', nom: 'ЧЕЛ — chel-soat (ishchi kuchi)' }, { kod: 'МАШ', nom: 'МАШ — mash-soat (mashina)' },
  { kod: 'МАТ', nom: 'МАТ — materiallar' }, { kod: 'ОБ', nom: 'ОБ — uskunalar' },
  { kod: 'SUB', nom: 'Subpudrat' }, { kod: 'OTK', nom: "O'tkazma (ustamasiz)" },
];
const kirit = 'w-full rounded border border-border bg-surface px-2 py-1 text-[13px]';

export default function XarajatKiritish({ companyId, shartnomaId, obyektlar, boshObyektId, onSaqlandi }: {
  companyId: number; shartnomaId: number | null; obyektlar: Array<{ id: number; nom: string }>; boshObyektId: number | null; onSaqlandi: () => void;
}) {
  const [sana, setSana] = useState('');
  const [kat, setKat] = useState('ЧЕЛ');
  const [obyektId, setObyektId] = useState<string>('');
  const [summa, setSumma] = useState('');
  const [hujjat, setHujjat] = useState('');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [opId, setOpId] = useState(() => yangiOperationId());

  const tanlanganObyekt = obyektId || (boshObyektId ? String(boshObyektId) : '');
  const yaroqli = sana !== '' && Number.isFinite(Number(summa)) && Number(summa) !== 0 && summa !== '' && tanlanganObyekt !== '';

  async function saqla() {
    if (band || !yaroqli) return;
    setBand(true);
    const r = await pulXarajatKirit({
      kompaniyaId: companyId, obyektId: Number(tanlanganObyekt), shartnomaId, sana, kat, summa, hujjatRef: hujjat.trim(), izoh: izoh.trim(), operationId: opId,
    });
    setBand(false);
    if (!r.ok) { toast(t(r.error || 'Xarajat saqlanmadi'), 'danger'); return; }
    toast(r.takror ? t('Bu xarajat avval saqlangan') : t('Xarajat saqlandi'), 'ok');
    setSumma(''); setHujjat(''); setIzoh(''); setOpId(yangiOperationId());
    onSaqlandi();
  }

  return (
    <details className="mt-3 rounded border border-border p-2">
      <summary className="cursor-pointer text-[13px] font-semibold">{t('Xarajat kiritish (qo‘lda)')}</summary>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] md:grid-cols-4">
        <label>{t('Sana')}<input type="date" className={kirit} value={sana} onChange={(e) => setSana(e.target.value)} /></label>
        <label>{t('Kategoriya')}
          <select className={kirit} value={kat} onChange={(e) => setKat(e.target.value)}>{KATLAR.map((k) => <option key={k.kod} value={k.kod}>{t(k.nom)}</option>)}</select>
        </label>
        <label>{t('Obyekt')}
          <select className={kirit} value={tanlanganObyekt} onChange={(e) => setObyektId(e.target.value)}>
            <option value="">—</option>{obyektlar.map((o) => <option key={o.id} value={String(o.id)}>{o.nom}</option>)}
          </select>
        </label>
        <label>{t('Summa (QQS siz)')}<MoneyInput className={kirit} value={summa} onValueChange={setSumma} /></label>
        <label className="col-span-2">{t('Dalil: hujjat / naryad № / fayl')}<input className={kirit} value={hujjat} maxLength={300} onChange={(e) => setHujjat(e.target.value)} /></label>
        <label className="col-span-2">{t('Izoh')}<input className={kirit} value={izoh} maxLength={1000} onChange={(e) => setIzoh(e.target.value)} /></label>
      </div>
      <button type="button" disabled={!yaroqli || band} onClick={() => void saqla()} className="mt-2 h-8 rounded bg-accent px-3 text-sm text-white disabled:opacity-50">{t('Saqlash')}</button>
    </details>
  );
}
