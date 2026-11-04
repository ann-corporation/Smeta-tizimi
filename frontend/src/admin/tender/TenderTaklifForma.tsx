/** Yetkazuvchi/pudratchi taklifi: pozitsiya bo'yicha muhrlangan narx (NDS siz), QQS, yetkazish, to'lov sharti, kafolat. Muddatgacha qayta yuborish mumkin. */
import { useMemo, useRef, useState } from 'react';
import { Send, Undo2 } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { yangiOperationId } from '../../api/supabase';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { OpsMaydon } from '../../components/kompaniya-ops/OpsUi';
import { tenderTaklifBer, tenderTaklifQaytar, type TenderTafsilot, type TenderTaklifYozuv } from '../../api/t2-tender';
import { pulJuft, qatorSumma } from '../../lib/tender/pul';
import { yaxlit2 } from '../../lib/hisob-yadro';
import { TenderPul, tenderXato } from './tender-ui';
import { FmtN } from '../../lib/format';

const son = (v: string): number | null => { const n = Number(v.replace(',', '.')); return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null; };

export function TenderTaklifForma({ kompaniyaId, td, onSaqlandi }: { kompaniyaId: number; td: TenderTafsilot; onSaqlandi: () => void }) {
  const mening = td.takliflar.find((x) => x.holat === 'berildi' || x.holat === 'faol') ?? null;
  const boshi = (rid: number) => mening?.qatorlar.find((q) => q.rfq_qator_id === rid);
  const [narx, setNarx] = useState<Record<number, string>>(() => Object.fromEntries(td.qatorlar.map((q) => [q.id, boshi(q.id)?.narx != null ? String(boshi(q.id)!.narx) : ''])));
  const [muddat, setMuddat] = useState<Record<number, string>>(() => Object.fromEntries(td.qatorlar.map((q) => [q.id, boshi(q.id)?.muddat_kun != null ? String(boshi(q.id)!.muddat_kun) : ''])));
  const [qqs, setQqs] = useState(String(mening?.qqs_foiz ?? td.rfq.qqs_foiz));
  const [yetkazish, setYetkazish] = useState(mening?.yetkazish_narx != null ? String(mening.yetkazish_narx) : '');
  const [tolov, setTolov] = useState(mening?.tolov_sharti ?? '');
  const [amal, setAmal] = useState(mening?.amal_kun != null ? String(mening.amal_kun) : '');
  const [kafolat, setKafolat] = useState(mening?.kafolat_oy != null ? String(mening.kafolat_oy) : '');
  const [izoh, setIzoh] = useState(mening?.izoh ?? '');
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());

  const foiz = son(qqs);
  const jamiSiz = useMemo(() => {
    let s = 0, n = 0;
    for (const q of td.qatorlar) { const x = qatorSumma(q.miqdor, son(narx[q.id] ?? '')); if (x != null) { s += x; n++; } }
    return n ? yaxlit2(s + (son(yetkazish) ?? 0)) : null;
  }, [td.qatorlar, narx, yetkazish]);
  const toldirilgan = td.qatorlar.filter((q) => son(narx[q.id] ?? '') != null).length;

  const yubor = async () => {
    const qatorlar: TenderTaklifYozuv[] = td.qatorlar.flatMap((q) => {
      const n = son(narx[q.id] ?? ''); if (n == null) return [];
      const m = son(muddat[q.id] ?? '');
      return [{ rfq_qator_id: q.id, narx: n, muddat_kun: m == null ? null : Math.round(m) }];
    });
    if (!qatorlar.length) { toast(t('Kamida bitta pozitsiyaga narx kiriting.'), 'warn'); return; }
    if (foiz == null || foiz > 100) { toast(t('QQS stavkasini kiriting (0–100).'), 'warn'); return; }
    setBand(true);
    const r = await tenderTaklifBer(kompaniyaId, { rfqId: td.rfq.id, qatorlar, izoh: izoh.trim() || undefined,
      shart: { qqs_foiz: foiz, yetkazish_narx: son(yetkazish), tolov_sharti: tolov.trim() || undefined, amal_kun: son(amal) == null ? null : Math.round(son(amal)!), kafolat_oy: son(kafolat) == null ? null : Math.round(son(kafolat)!) } }, op.current);
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    op.current = yangiOperationId();
    toast(mening ? t('Taklif yangilandi. Muddatgacha yana o‘zgartirishingiz mumkin.') : t('Taklif yuborildi. U muddat tugaguncha xaridorga ko‘rinmaydi.'), 'ok');
    onSaqlandi();
  };
  const qaytar = async () => {
    if (!mening) return;
    setBand(true);
    const r = await tenderTaklifQaytar(kompaniyaId, { taklifId: mening.id, kutilganVersiya: mening.versiya });
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    toast(t('Taklif qaytarib olindi.'), 'ok');
    onSaqlandi();
  };

  return (
    <div className="fz-card">
      <div className="fz-card__head">
        <h3 className="fz-card__title">{mening ? t('Sizning taklifingiz (o‘zgartirish mumkin)') : t('Taklif berish')}</h3>
        <span className="fz-chip">{t('Muhrlangan: xaridor muddat tugaguncha ko‘rmaydi')}</span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-[12px] text-text-mute">{t('Narxlarni QQS siz kiriting (birlik narxi). Narx kiritilmagan pozitsiya taklifga kirmaydi.')}</p>
        <div className="space-y-2">
          {td.qatorlar.map((q) => {
            const n = son(narx[q.id] ?? '');
            return (
              <div key={q.id} className="rounded border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">{q.nom}</span>
                  <span className="text-[12px] text-text-mute">{q.lot_nom ? q.lot_nom + ' · ' : ''}<FmtN val={q.miqdor} /> {q.birlik}{q.talab_sana ? ' · ' + q.talab_sana : ''}</span>
                </div>
                {q.spets && <p className="mt-1 text-[11.5px] text-text-mute">{q.spets}</p>}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <OpsMaydon nom={t('Birlik narxi (QQS siz)')}><MoneyInput className="text-right tabular-nums" value={narx[q.id] ?? ''} onValueChange={(v) => setNarx({ ...narx, [q.id]: v })} /></OpsMaydon>
                  <OpsMaydon nom={t('Yetkazish (kun)')}><input type="number" inputMode="numeric" min="0" step="1" className="text-right tabular-nums" value={muddat[q.id] ?? ''} onChange={(e) => setMuddat({ ...muddat, [q.id]: e.target.value })} /></OpsMaydon>
                  <div className="col-span-2 text-right text-[12px]"><span className="block text-text-mute">{t('Pozitsiya summasi')}</span><TenderPul ndsSiz={qatorSumma(q.miqdor, n)} foiz={foiz} valyuta={td.rfq.valyuta} kichik /></div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <OpsMaydon nom={t('QQS stavkasi, %')} majburiy izoh={t('QQS to‘lovchi bo‘lmasangiz — 0')}><input type="number" inputMode="decimal" min="0" max="100" value={qqs} onChange={(e) => setQqs(e.target.value)} className="text-right" /></OpsMaydon>
          <OpsMaydon nom={t('Yetkazish haqi (QQS siz)')}><MoneyInput value={yetkazish} onValueChange={setYetkazish} className="text-right" /></OpsMaydon>
          <OpsMaydon nom={t('Taklif amal qilish muddati (kun)')}><input type="number" inputMode="numeric" min="1" max="365" value={amal} onChange={(e) => setAmal(e.target.value)} className="text-right" /></OpsMaydon>
          <OpsMaydon nom={t('Kafolat (oy)')}><input type="number" inputMode="numeric" min="0" max="240" value={kafolat} onChange={(e) => setKafolat(e.target.value)} className="text-right" /></OpsMaydon>
        </div>
        <OpsMaydon nom={t('To‘lov sharti')} izoh={td.rfq.tolov_sharti ? t('Xaridor sharti') + ': ' + td.rfq.tolov_sharti : undefined}><input type="text" maxLength={500} value={tolov} onChange={(e) => setTolov(e.target.value)} placeholder={t('Masalan: 30% oldindan, qolgani topshirgach')} /></OpsMaydon>
        <OpsMaydon nom={t('Izoh')}><textarea rows={2} maxLength={2000} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></OpsMaydon>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-[12.5px]">
            <span className="block text-text-mute">{t('Taklif jami ({n} / {m} pozitsiya)', { n: toldirilgan, m: td.qatorlar.length })}</span>
            <TenderPul ndsSiz={jamiSiz} foiz={foiz} valyuta={td.rfq.valyuta} />
          </div>
          <div className="flex gap-2">
            {mening && <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => void qaytar()}><Undo2 /> {t('Qaytarib olish')}</button>}
            <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void yubor()}><Send /> {mening ? t('Yangilash') : t('Taklif yuborish')}</button>
          </div>
        </div>
        {pulJuft(jamiSiz, foiz).qqsBilan == null && jamiSiz != null && <p className="text-[11.5px] text-warn">{t('QQS stavkasi kiritilmaguncha QQS bilan summa ko‘rsatilmaydi.')}</p>}
      </div>
    </div>
  );
}
