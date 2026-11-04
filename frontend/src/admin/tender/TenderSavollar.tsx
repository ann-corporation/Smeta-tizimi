/** Savol-javob: yetkazuvchi savol beradi (muddatgacha), xaridor javob beradi; ommaviy javob hamma ishtirokchiga nomsiz ko'rinadi. */
import { useRef, useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { yangiOperationId } from '../../api/supabase';
import { tenderJavob, tenderSavolBer, type TenderTafsilot } from '../../api/t2-tender';
import { sanaVaqt, tenderXato } from './tender-ui';

export function TenderSavollar({ kompaniyaId, td, onSaqlandi }: { kompaniyaId: number; td: TenderTafsilot; onSaqlandi: () => void }) {
  const [savol, setSavol] = useState('');
  const [javoblar, setJavoblar] = useState<Record<number, string>>({});
  const [ommaviy, setOmmaviy] = useState(true);
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const elon = td.rfq.holat === 'elon';
  const savolMumkin = !td.egasi && td.ruxsat.taklif && elon && Date.parse(td.rfq.savol_muddat ?? td.rfq.muddat ?? '') > Date.now();
  const javobMumkin = td.egasi && td.ruxsat.yoz && elon;
  const javobsiz = td.savollar.some((s) => s.javob == null);

  const yubor = async () => {
    if (savol.trim().length < 5) { toast(t('Savol kamida 5 belgi bo‘lsin.'), 'warn'); return; }
    setBand(true);
    const r = await tenderSavolBer(kompaniyaId, { rfqId: td.rfq.id, savol: savol.trim() }, op.current);
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    op.current = yangiOperationId(); setSavol('');
    toast(t('Savol yuborildi.'), 'ok'); onSaqlandi();
  };
  const javobBer = async (id: number) => {
    const j = (javoblar[id] ?? '').trim();
    if (j.length < 2) return;
    setBand(true);
    const r = await tenderJavob(kompaniyaId, { savolId: id, javob: j, ommaviy });
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    toast(t('Javob yuborildi.'), 'ok'); setJavoblar({ ...javoblar, [id]: '' }); onSaqlandi();
  };
  return (
    <div className="fz-card">
      <div className="fz-card__head"><h3 className="fz-card__title inline-flex items-center gap-2"><MessageCircleQuestion size={15} />{t('Savol va javoblar')}</h3>
        {td.rfq.savol_muddat && <span className="fz-chip">{t('Savol muddati')}: {sanaVaqt(td.rfq.savol_muddat)}</span>}</div>
      <div className="space-y-3 p-4">
        {td.savollar.length === 0 && <p className="text-[12.5px] text-text-mute">{t('Hozircha savol yo‘q.')}</p>}
        {td.savollar.map((s) => (
          <div key={s.id} className="rounded border border-border p-3 text-[13px]">
            <p><span className="font-medium">{s.meniki ? t('Sizning savolingiz') : s.savol_nom ?? t('Ishtirokchi savoli')}:</span> {s.savol}</p>
            {s.javob != null && <p className="mt-1 border-l-2 border-[var(--ok)] pl-2 text-text-dim"><span className="font-medium">{t('Javob')}</span>{!s.ommaviy && <span className="ml-1 text-text-mute">({t('faqat savol egasiga')})</span>}: {s.javob}</p>}
            {s.javob == null && javobMumkin && <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input type="text" aria-label={t('Javob')} className="h-8 flex-1 px-2" value={javoblar[s.id] ?? ''} onChange={(e) => setJavoblar({ ...javoblar, [s.id]: e.target.value })} placeholder={t('Javobingiz…')} />
              <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band} onClick={() => void javobBer(s.id)}><Send /> {t('Javob berish')}</button>
            </div>}
            {s.javob == null && !javobMumkin && <p className="mt-1 text-[12px] text-text-mute">{t('Javob kutilmoqda')}</p>}
          </div>
        ))}
        {javobMumkin && javobsiz && <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={ommaviy} onChange={(e) => setOmmaviy(e.target.checked)} />{t('Javob barcha ishtirokchilarga ko‘rinsin (savol egasi nomsiz)')}</label>}
        {savolMumkin && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="text" aria-label={t('Savol')} className="h-8 flex-1 px-2" maxLength={2000} value={savol} onChange={(e) => setSavol(e.target.value)} placeholder={t('Xaridorga savolingiz…')} />
            <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void yubor()}><Send /> {t('Savol berish')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
