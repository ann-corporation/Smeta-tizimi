/**
 * Rasmiy F2 reestri (CSV: №;Lot;Obyekt_ish;Davr;QQSsiz;QQS;QQS_bilan;Holat) — har F2 hujjat jami (QQSsiz / QQS bilan).
 * Nega kerak: t2_akt.hujjat_jami — bog'langan qatorlar PRYAMYE yig'indisi (hujjat jami emas), ba'zi F2 tizimda umuman yo'q.
 * Fayl brauzerda o'qiladi; moslash: obyekt nomi → shartnoma, № → F2 akt. Topilmaganini operator tanlaydi. t2_akt o'zgarmaydi.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Save, Upload } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { f2ReestrYoz, sverkaImportXato } from '../../api/t2-sverka-import';
import { reestrCsvOqi, reestrMosla, type ReestrTahlil } from '../../lib/sverka-1c/reestr-csv';
import type { MoslashShartnoma, TizimShartnoma } from '../../lib/sverka-1c/turlar';
import { pul, raqamUstun } from './yordamchi';

export function F2ReestrBolimi({ companyId, shartnomalar, moslash, yangila }: { companyId: number; shartnomalar: TizimShartnoma[]; moslash: MoslashShartnoma[]; yangila: () => unknown }) {
  const [tahlil, setTahlil] = useState<ReestrTahlil | null>(null);
  const [tanlov, setTanlov] = useState<Record<number, number | null>>({});
  const [band, setBand] = useState(false);
  const qatorlar = useMemo(() => (tahlil ? reestrMosla(tahlil.qatorlar, shartnomalar, moslash, tanlov) : []), [tahlil, shartnomalar, moslash, tanlov]);
  const mavjud = moslash.reduce((a, m) => a + m.f2_reestr.length, 0);

  async function fayl(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setTahlil(reestrCsvOqi(await f.text()));
    setTanlov({});
  }
  async function yoz() {
    const tayyor = qatorlar.filter((q) => q.shartnomaId != null);
    if (!tayyor.length || band) return;
    setBand(true);
    const r = await f2ReestrYoz(companyId, tayyor.map((q) => ({
      shartnoma_id: q.shartnomaId!, akt_id: q.aktId, raqam: q.raqam, lot: q.lot, obyekt_ish: q.obyektIsh, davr: q.davr,
      qqssiz: q.qqssiz == null ? null : q.qqssiz / 100, qqs: q.qqs == null ? null : q.qqs / 100, qqs_bilan: q.qqsBilan == null ? null : q.qqsBilan / 100, holat_matn: q.holat,
    })));
    setBand(false);
    if (!r.ok) { toast(t(sverkaImportXato(r.error)), 'danger'); return; }
    toast(t('Reestr yozildi: yangi {y}, yangilandi {u}, xato {x}', { y: String(r.yangi), u: String(r.yangilandi ?? 0), x: String(r.xato) }), r.xato ? 'warn' : 'ok');
    await yangila();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div className="fz-note fz-note--info"><span>{t('Tizimdagi F2 summasi — qatorlar bilan bog‘langan ustamasiz qism; hujjatning rasmiy jami emas. Moslash uchun rasmiy reestr jamisini (QQSsiz va QQS bilan) yuklang. Tizimda mavjud reestr yozuvlari: {n}.', { n: String(mavjud) })}</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
        <label className="fz-btn" style={{ cursor: 'pointer' }}>
          <Upload />{t('Reestr CSV yuklash')}
          <input type="file" accept=".csv,.txt" hidden onChange={(e) => { void fayl(e.target.files); e.target.value = ''; }} />
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>№;Lot;Obyekt_ish;Davr;QQSsiz;QQS;QQS_bilan;Holat</span>
        {tahlil && <button type="button" className="fz-btn fz-btn--primary" disabled={band || !qatorlar.some((q) => q.shartnomaId != null)} onClick={() => void yoz()}><Save />{t('Reestrni yozish')}</button>}
      </div>
      {tahlil?.xatolar.map((x, i) => <div key={i} className="fz-note fz-note--warn"><AlertTriangle /><span>{x.qator ? `${x.qator}: ` : ''}{x.matn}</span></div>)}
      {tahlil && (
        <div className="fz-table-wrap" style={{ maxHeight: 420 }}>
          <table className="fz-table">
            <thead><tr><th>№</th><th>{t('Obyekt / ish')}</th><th>{t('Davr')}</th><th style={raqamUstun}>{t('QQSsiz')}</th><th style={raqamUstun}>{t('QQS bilan')}</th><th>{t('Shartnoma')}</th><th>{t('Tizimdagi F2')}</th></tr></thead>
            <tbody>{qatorlar.map((q) => (
              <tr key={q.qator}>
                <td>{q.raqam}</td><td>{q.obyektIsh ?? '—'}</td><td>{q.davr ?? '—'}</td>
                <td style={raqamUstun}>{pul(q.qqssiz)}</td><td style={raqamUstun}>{pul(q.qqsBilan)}</td>
                <td>
                  <select aria-label={t('Shartnoma')} className="input" style={{ height: 28, fontSize: 12 }} value={q.shartnomaId ?? ''} onChange={(e) => setTanlov({ ...tanlov, [q.qator]: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">{t('— tanlang —')}</option>
                    {shartnomalar.map((s) => <option key={s.id} value={s.id}>№ {s.raqam}</option>)}
                  </select>
                </td>
                <td>{q.aktId != null ? <span className="fz-chip fz-chip--accent">{t('topildi')}</span> : <span className="fz-chip fz-chip--warn">{t('tizimda F2 yo‘q')}</span>}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
