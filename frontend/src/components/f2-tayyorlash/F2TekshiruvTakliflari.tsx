/**
 * F2TekshiruvTakliflari - F-2 qoralama muharririda texnadzor takliflari (PTO tomoni).
 * Har taklif: belgi + izoh + taklif hajm (joriy F-2 hajmi bilan yonma-yon). Tugmalar: «Qabul» (mavjud preview -> tasdiq yo'li: /api/f2-buyruq),
 * «Rad» (sabab majburiy, tekshiruvchiga ko'rinadi), «Keyinroq». Yuqorida xulosa: N taklif, M hal qilingan.
 * «Hujjat kerak» talablari ro'yxat: Diskdan hujjat biriktiriladi. Hech narsa F-2 ga bevosita yozilmaydi: hajm o'zgartirish - f2_qoralama_tahrir,
 * olib tashlash - f2_qoralama_tahrir + bajarilmadi; ikkalasi ham preview ko'rsatiladi va PTO «Tasdiqlayman» bosadi.
 * «Qo'shish» taklifi: qator F-2 muharririda qo'lda qo'shiladi (mavjud yozuv yo'li shu), so'ng «Qabul» faqat qaror sifatida yoziladi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardList, FileText, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { DiskdanTanlash } from '../../hujjat-maydoni/DiskdanTanlash';
import { f2Tasdiq, f2Vosita, type F2Javob } from '../../api/f2-buyruq';
import { tekshiruvAktTakliflari, tekshiruvHujjatBiriktir, tekshiruvQaror, tekshiruvXatoMatni } from '../../api/t2-tekshiruv';
import { qabulQadamlari, takliflarXulosasi, type AktTaklif, type QabulQadam } from '../../lib/tekshiruv/pto';

const BAYROQ_MATN = { olib_tashlansin: 'Olib tashlansin', hajm_notogri: 'Hajm noto‘g‘ri', hujjat_kerak: 'Hujjat kerak', qabul: 'Qabul' } as const;
const sonMatn = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 6 }));

type Jarayon = { taklif: AktTaklif; qadamlar: QabulQadam[]; i: number; javob: F2Javob | null; band: boolean };

export function F2TekshiruvTakliflari({ kompaniyaId, obyektId, aktId, versiya, qoralama, onOzgardi }: { kompaniyaId: number; obyektId: number; aktId: number; versiya: number; qoralama: boolean; onOzgardi: () => void }) {
  // Provider/react-query ga bog'liq emas va xatoga chidamli: yuklanmasa blok shunchaki ko'rinmaydi (F-2 sahifasi buzilmaydi).
  const [data, setData] = useState<Awaited<ReturnType<typeof tekshiruvAktTakliflari>> | null>(null);
  const yangila = useCallback(async () => { try { setData(await tekshiruvAktTakliflari(kompaniyaId, aktId)); } catch { setData(null); } }, [kompaniyaId, aktId, versiya]);
  useEffect(() => { void yangila(); }, [yangila]);
  const [rad, setRad] = useState<{ id: number; sabab: string } | null>(null);
  const [j, setJ] = useState<Jarayon | null>(null);
  const [diskTaklif, setDiskTaklif] = useState<number | null>(null);
  const d = data && data.ok ? data : null;
  if (!d || d.takliflar.length === 0) return null;
  const xulosa = takliflarXulosasi(d.takliflar);

  const qaror = async (x: AktTaklif, qr: 'qabul' | 'rad' | 'keyinroq', sabab?: string) => {
    const r = await tekshiruvQaror(x.id, qr, sabab ?? null);
    if (!r.ok) { toast(t(tekshiruvXatoMatni(r)), 'danger'); return false; }
    await yangila(); return true;
  };

  /** Qabul: yozuv qadamlari ketma-ket, har biri avval PREVIEW (dry_run) ko'rsatiladi; PTO tasdiqlamaguncha hech narsa yozilmaydi. */
  const qadamBosh = async (x: AktTaklif) => {
    const qadamlar = qabulQadamlari(x, { aktId, obyektId, versiya, qoralama });
    if (qadamlar.length === 0) { if (await qaror(x, 'qabul')) toast(t('Qaror yozildi'), 'ok'); return; }
    setJ({ taklif: x, qadamlar, i: 0, javob: null, band: true });
    const r = await f2Vosita(kompaniyaId, qadamlar[0].nom, qadamlar[0].args);
    if (!r.ok) { toast(r.xabar ?? r.code ?? t('Preview olinmadi'), 'danger'); setJ(null); return; }
    setJ({ taklif: x, qadamlar, i: 0, javob: r, band: false });
  };
  const tasdiqla = async () => {
    if (!j || !j.javob?.token) return;
    setJ({ ...j, band: true });
    const r = await f2Tasdiq(kompaniyaId, j.javob.token);
    if (!r.ok) { toast(r.xabar ?? r.code ?? t('Yozilmadi'), 'danger'); setJ({ ...j, band: false }); return; }
    const keyingi = j.i + 1;
    if (keyingi < j.qadamlar.length) {
      const nx = j.qadamlar[keyingi]; const p = await f2Vosita(kompaniyaId, nx.nom, nx.args);
      if (!p.ok) { toast(p.xabar ?? p.code ?? t('Preview olinmadi'), 'danger'); setJ(null); onOzgardi(); return; }
      setJ({ ...j, i: keyingi, javob: p, band: false }); return;
    }
    const x = j.taklif; setJ(null);
    await qaror(x, 'qabul'); onOzgardi(); toast(t('F-2 yangilandi va qaror yozildi'), 'ok');
  };

  return (
    <section className="fz-card p-3 flex flex-col gap-2" data-testid="tekshiruv-takliflari">
      <h2 className="m-0 text-[14px] font-semibold flex items-center gap-2"><ClipboardList size={16} aria-hidden="true" /> {t('Texnadzor takliflari')}</h2>
      <p className="m-0 text-[13px]" data-testid="tekshiruv-xulosa">{t('{n} ta taklif, {m} tasi hal qilindi', { n: xulosa.jami, m: xulosa.hal })}{xulosa.hujjatKutilmoqda > 0 ? ` · ${t('hujjat kutilmoqda')}: ${xulosa.hujjatKutilmoqda}` : ''}</p>
      {!qoralama && <p className="m-0 text-[12px] opacity-70">{t('F-2 qoralama emas: hajm o‘zgartirib bo‘lmaydi, faqat qaror yoziladi.')}</p>}
      {d.takliflar.map((x) => {
        const eskirgan = x.eskirgan; const hal = x.qaror !== 'kutilmoqda';
        return (
          <div key={x.id} className="border-t border-border pt-2 flex flex-col gap-1 text-[13px]" data-testid={`taklif-${x.id}`}>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-medium">{x.nom}</span>
              {x.bayroq && <span className="rounded px-2" style={{ background: '#ddf4ff' }}>{t(BAYROQ_MATN[x.bayroq])}{x.hujjat_turi ? ` · ${x.hujjat_turi}` : ''}</span>}
              {x.qosh && <span className="rounded px-2" style={{ background: '#ddf4ff' }}>{t('Qo‘shish taklifi')}</span>}
              {eskirgan && <span className="rounded px-2" style={{ background: '#fff8c5' }}>{t('eski versiya')}</span>}
              {hal && <span className="rounded px-2" style={{ background: x.qaror === 'qabul' ? '#dafbe1' : '#ffebe9' }}>{t(x.qaror === 'qabul' ? 'Qabul qilindi' : x.qaror === 'rad' ? 'Rad etildi' : 'Keyinroq')}</span>}
            </div>
            {x.taklif_hajm != null && <div>{t('Hajm')}: {sonMatn(x.joriy_hajm)} → <b>{sonMatn(x.taklif_hajm)}</b> {x.birlik ?? ''}</div>}
            {x.izoh && <div className="opacity-90">{x.izoh}</div>}
            {x.qaror_sabab && <div className="opacity-70">{t('Sabab')}: {x.qaror_sabab}</div>}
            {x.bayroq === 'hujjat_kerak' && (
              <div className="flex flex-wrap gap-2 items-center">
                <FileText size={14} aria-hidden="true" /> {x.hujjat_id ? t('Hujjat biriktirildi') : t('Hujjat biriktirilmagan')}
                <button type="button" className="fz-btn fz-btn--sm" disabled={x.qaror === 'rad'} onClick={() => setDiskTaklif(x.id)}>{t('Diskdan biriktirish')}</button>
              </div>
            )}
            {!hal && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={!!j} onClick={() => void qadamBosh(x)}><Check size={14} aria-hidden="true" /> {t('Qabul')}</button>
                <button type="button" className="fz-btn fz-btn--sm" disabled={!!j} onClick={() => setRad({ id: x.id, sabab: '' })}><X size={14} aria-hidden="true" /> {t('Rad')}</button>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={!!j} onClick={() => void qaror(x, 'keyinroq')}>{t('Keyinroq')}</button>
              </div>
            )}
            {rad?.id === x.id && (
              <div className="flex flex-col gap-1">
                <textarea className="fz-input" rows={2} maxLength={1000} value={rad.sabab} onChange={(e) => setRad({ id: x.id, sabab: e.target.value })} placeholder={t('Rad etish sababi (tekshiruvchi ko‘radi)')} aria-label={t('Rad etish sababi')} />
                <div className="flex gap-2">
                  <button type="button" className="fz-btn fz-btn--danger fz-btn--sm" disabled={rad.sabab.trim().length < 3} onClick={() => void qaror(x, 'rad', rad.sabab.trim()).then((ok) => { if (ok) setRad(null); })}>{t('Rad etish')}</button>
                  <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setRad(null)}>{t('Bekor')}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {diskTaklif != null && <DiskdanTanlash onYop={() => setDiskTaklif(null)} onTanlandi={(fl) => { const id = diskTaklif; setDiskTaklif(null); if (fl[0]) void tekshiruvHujjatBiriktir(id, fl[0].faylId).then((r) => { if (!r.ok) toast(t(tekshiruvXatoMatni(r)), 'danger'); else void yangila(); }); }} />}
      {j && (
        <div role="dialog" aria-label={t('Tasdiqlash')} className="border rounded p-2 flex flex-col gap-1 text-[13px]" style={{ borderColor: '#0969da' }} data-testid="tekshiruv-preview">
          <b>{t('Qadam {i}/{n}')}: {j.javob?.tavsif ?? j.qadamlar[j.i].nom}</b>
          {(j.javob?.preview?.qatorlar ?? []).map((r) => <div key={r.qator_id}>{r.nom}: {r.olib_tashlandi ? t('olib tashlanadi') : r.ozgarish.map((o) => `${o.maydon} ${sonMatn(o.oldin)} → ${sonMatn(o.keyin)}`).join(', ')}</div>)}
          {(j.javob?.ogohlantirish ?? []).map((o, k) => <div key={k} style={{ color: '#9a6700' }}>{o}</div>)}
          <div className="flex gap-2">
            <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={j.band || !j.javob?.token} onClick={() => void tasdiqla()}>{t('Tasdiqlayman')}</button>
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={j.band} onClick={() => { setJ(null); }}>{t('Bekor')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
