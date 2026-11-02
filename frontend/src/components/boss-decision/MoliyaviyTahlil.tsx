import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Pencil } from 'lucide-react';
import { t } from '../../i18n/til';
import { yangiOperationId } from '../../api/supabase';
import { moliyaQoldaYoz, moliyaTahlilOl } from '../../api/t2-moliya-tahlil';
import { MOLIYA_NOM, mlrd, mlrdOqi, moliyaXlsx, type MoliyaKorsatkich, type MoliyaManba, type MoliyaTahlilJavob } from '../../lib/moliya-tahlil';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { toast } from '../../umumiy/ui/Toast';

/**
 * «Moliyaviy tahlil» bloki (egasi 2026-10-27) — Pul tahlili ichida (yangi sahifa emas). 16 ko'rsatkich, mlrd so'm, QQS bilan.
 * Hisob bazada (`t2_moliya_tahlil_v1`); qo'lda kiritish `t2_moliya_qolda_yoz_v1` (financial.write — server tekshiradi).
 */
const MANBA: Record<MoliyaManba, { nom: string; sinf: string }> = {
  tizim: { nom: 'tizim', sinf: 'fz-chip fz-chip--accent' },
  qolda: { nom: 'qo‘lda', sinf: 'fz-chip fz-chip--warn' },
  hisoblangan: { nom: 'hisoblangan', sinf: 'fz-chip' },
};

function izohMatni(k: MoliyaKorsatkich): string {
  const q: string[] = [t('Formula: {f}', { f: k.formula })];
  if (k.ustamasiz != null) q.push(t('ustamasiz: {u} · ustamali (QQS siz): {i} mlrd', { u: mlrd(k.ustamasiz), i: mlrd(k.ustamali_qqssiz) }));
  if (k.manba === 'qolda' && k.qolda) q.push(t('Qo‘lda: {sana} · {kim}', { sana: k.qolda.sana, kim: k.qolda.kim ?? '' }));
  if (k.manba === 'qolda' && k.tizim_qiymat != null) q.push(t('Tizim qiymati: {v} mlrd', { v: mlrd(k.tizim_qiymat) }));
  if (k.nomalum_soni) q.push(t('{n} ta qatorda summa noma‘lum', { n: String(k.nomalum_soni) }));
  return q.join('\n');
}

export default function MoliyaviyTahlil({ companyId, obyektId, qamrovNomi }: { companyId: number; obyektId: number | null; qamrovNomi: string }) {
  const [data, setData] = useState<MoliyaTahlilJavob | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yangila, setYangila] = useState(0);
  const [tahrir, setTahrir] = useState<{ kod: string; matn: string; opId: string } | null>(null);
  const [band, setBand] = useState(false);

  useEffect(() => {
    let bekor = false;
    void moliyaTahlilOl({ kompaniyaId: companyId, obyektId }).then((r) => {
      if (bekor) return;
      if (r.ok) { setData(r.natija); setXato(null); } else { setData(null); setXato(r.error); }
    });
    return () => { bekor = true; };
  }, [companyId, obyektId, yangila]);

  async function saqla() {
    if (!tahrir) return;
    const qiymat = mlrdOqi(tahrir.matn);
    if (qiymat === undefined) { toast(t('Raqam noto‘g‘ri (mlrd so‘m)'), 'danger'); return; }
    setBand(true);
    const r = await moliyaQoldaYoz({ kompaniyaId: companyId, obyektId, kod: tahrir.kod, qiymat, operationId: tahrir.opId });
    setBand(false);
    if (!r.ok) { toast(t(r.error || 'Saqlab bo‘lmadi'), 'danger'); return; }
    toast(t('Saqlandi'), 'ok'); setTahrir(null); setYangila((n) => n + 1);
  }

  async function eksport() {
    if (!data) return;
    const { bytes, faylNomi } = await moliyaXlsx(data, { qamrovNomi });
    const r = await hujjatTokenBilan({ kompaniyaId: companyId, bytes, hujjat: 'MOLIYA_TAHLIL', sabab: `Финансовый анализ · ${qamrovNomi}`, obyekt: obyektId },
      () => downloadBlob(bytes, faylNomi));
    if (!r.ok) toast(t(r.xabar), 'danger'); else if (r.xabar) toast(t(r.xabar), 'ok');
  }

  return (
    <div className="fz-panel" aria-label={t('Moliyaviy tahlil')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <h4 className="fz-card__title">{t('Moliyaviy tahlil')}</h4>
          <p className="fz-card__sub">{t('mlrd so‘m, QQS bilan · tizim + qo‘lda kiritilgan qiymatlar')}</p>
        </div>
        <button type="button" className="fz-btn fz-btn--sm" disabled={!data} onClick={() => void eksport()}><Download size={14} /> {t('Excel')}</button>
      </div>
      {xato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle /><span>{t(xato)}</span></div>}
      {data && data.zanjir_xato_soni > 0 && (
        <div className="fz-note fz-note--warn"><AlertTriangle /><span>{t('{n} ta obyektda ustama zanjiri hisoblanmadi — fakt, F2 va QMI noma‘lum', { n: String(data.zanjir_xato_soni) })}</span></div>
      )}
      {data && (
        <div className="fz-table-wrap"><table className="fz-table">
          <thead><tr>
            <th>№</th><th>{t('Ko‘rsatkich')}</th><th style={{ textAlign: 'right' }}>{t('mlrd so‘m')}</th><th>{t('Manba')}</th><th>{t('Formula')}</th>
          </tr></thead>
          <tbody>
            {data.korsatkichlar.map((k) => (
              <tr key={k.kod}>
                <td>{k.n}</td>
                <td>{t(MOLIYA_NOM[k.kod]?.uz ?? k.kod)}</td>
                <td className="fz-c-num" title={izohMatni(k)}>
                  {tahrir?.kod === k.kod ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <input className="input" style={{ width: 90, height: 'var(--control-sm, 28px)' }} inputMode="decimal" autoFocus value={tahrir.matn}
                        aria-label={t('Qiymat (mlrd so‘m)')} placeholder={t('bo‘sh = bekor')}
                        onChange={(e) => setTahrir({ ...tahrir, matn: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') void saqla(); if (e.key === 'Escape') setTahrir(null); }} />
                      <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={band} onClick={() => void saqla()}>{t('Saqlash')}</button>
                    </span>
                  ) : (
                    <>
                      {mlrd(k.qiymat)}
                      {k.tahrir && (
                        <button type="button" className="ml-1" title={t('Qo‘lda kiritish')} aria-label={t('Qo‘lda kiritish')}
                          onClick={() => setTahrir({ kod: k.kod, matn: k.qolda ? String(Math.round((k.qolda.qiymat / 1e9) * 100) / 100) : '', opId: yangiOperationId() })}>
                          <Pencil size={12} />
                        </button>
                      )}
                    </>
                  )}
                </td>
                <td><span className={MANBA[k.manba].sinf}>{t(MANBA[k.manba].nom)}</span></td>
                <td style={{ color: 'var(--text-mute)' }} title={izohMatni(k)}>{k.manba === 'hisoblangan' ? k.formula : t(k.formula)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
