import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { harakatNatijasi, harakatQarori, type HarakatTaklif } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { HARAKAT_MAYDONLARI, HARAKAT_NOMI, XAVF_NOMI, harakatniBajar } from './ai-harakat';
import { HARAKAT_MUHR, XAVF_MUHR } from '../../lib/ai-korinish';

type Holat = 'kutilmoqda' | 'bajarilmoqda' | 'bajarildi' | 'xato' | 'rad';
const XAVF_CHIZIQ: Record<string, string> = { past: 'var(--ok)', orta: 'var(--warn)', yuqori: 'var(--danger)' };

/**
 * AI taklif qilgan harakat. Qaror HAR DOIM foydalanuvchida: past xavf + «avto» sozlamasi bo'lsa — o'zi bajariladi (va ko'rsatiladi),
 * qolgani — qiymatlarni ko'rsatib, tahrirlashga ruxsat berib, tasdiq so'raydi. YUQORI xavf — qo'shimcha «tushundim» belgisi bilan.
 * Bajarish foydalanuvchining O'Z sessiyasi bilan mavjud gateway orqali (AI serveri yozmaydi).
 */
export function AiHarakatKarta({ h, kompaniyaId }: { h: HarakatTaklif; kompaniyaId: number }) {
  const [holat, setHolat] = useState<Holat>('kutilmoqda');
  const [qiymat, setQiymat] = useState<Record<string, unknown>>(h.parametrlar);
  const [xabar, setXabar] = useState('');
  const [tushundim, setTushundim] = useState(false);
  const boshlandi = useRef(false);
  const maydonlar = HARAKAT_MAYDONLARI[h.amal] ?? [];
  const yuqori = h.xavf === 'yuqori';

  const bajar = async (tasdiq: boolean) => {
    setHolat('bajarilmoqda');
    if (tasdiq) { const q = await harakatQarori(h.id, 'tasdiqlash'); if (!q.ok) { setHolat('xato'); setXabar(q.error); return; } }
    const n = await harakatniBajar(kompaniyaId, h.amal, qiymat);
    await harakatNatijasi(h.id, n.ok, { ...n.natija, xabar: n.xabar });
    setHolat(n.ok ? 'bajarildi' : 'xato'); setXabar(n.xabar);
  };
  const rad = async () => { setHolat('rad'); await harakatQarori(h.id, 'rad'); };

  useEffect(() => {
    if (h.avto && !boshlandi.current) { boshlandi.current = true; void bajar(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div role="group" aria-label={t(HARAKAT_NOMI[h.amal] ?? h.amal)} className="fz-panel mt-2 gap-2 text-sm" style={{ borderLeft: `3px solid ${XAVF_CHIZIQ[h.xavf] ?? 'var(--border-strong)'}` }} data-testid="ai-harakat-karta">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-mute" aria-hidden="true">{yuqori ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}</span>
        <span className="fz-panel__h">{t('AI taklif qilgan amal')}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`fz-stamp ${XAVF_MUHR[h.xavf] ?? ''}`} title={t('Xavf darajasi')}>{t(XAVF_NOMI[h.xavf] ?? h.xavf)}</span>
          <span className={`fz-stamp ${HARAKAT_MUHR[holat].cls}`} data-testid="ai-harakat-holat">{t(HARAKAT_MUHR[holat].matn)}</span>
        </span>
      </div>
      <b className="font-[family-name:var(--font-display)] text-[14px] text-text">{t(HARAKAT_NOMI[h.amal] ?? h.amal)}</b>
      {h.tushuntirish && <p className="text-xs text-text-dim">{h.tushuntirish}</p>}
      {h.ogohlantirish && <p role="alert" className="fz-note fz-note--danger text-xs">{h.ogohlantirish}</p>}

      <dl className="grid grid-cols-[auto,1fr] items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] bg-surface-2 p-2 text-xs text-text">
        {maydonlar.map((m) => (
          <div key={m.kalit} className="contents">
            <dt className="text-text-mute">{t(m.nom)}</dt>
            <dd>
              {holat === 'kutilmoqda' ? (
                <input aria-label={t(m.nom)} type={m.tur === 'son' ? 'number' : m.tur === 'sana' ? 'date' : 'text'} value={String(qiymat[m.kalit] ?? '')}
                  onChange={(e) => setQiymat({ ...qiymat, [m.kalit]: m.tur === 'son' ? e.target.value : e.target.value })}
                  className="h-7 w-full px-1.5" />
              ) : <span className="font-medium tabular-nums">{String(qiymat[m.kalit] ?? '—')}</span>}
            </dd>
          </div>
        ))}
        {h.amal === 'grafik_foiz' && <div className="contents"><dt className="text-text-mute">{t('Hozirgi foiz')}</dt><dd>{String(h.parametrlar.eski_foiz ?? '—')}%</dd></div>}
      </dl>

      {holat === 'kutilmoqda' && (
        <div className="space-y-2">
          {yuqori && (
            <label className="flex items-start gap-1.5 text-xs text-danger">
              <input type="checkbox" checked={tushundim} onChange={(e) => setTushundim(e.target.checked)} className="mt-0.5" />
              {t('Xavfni tushundim va baribir bajarmoqchiman')}
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={yuqori && !tushundim} onClick={() => void bajar(true)}
              className={`fz-btn fz-btn--sm ${yuqori ? 'fz-btn--danger' : 'fz-btn--primary'}`}>{yuqori ? t('Baribir bajarish') : t('Tasdiqlash va bajarish')}</button>
            <button type="button" onClick={() => void rad()} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Rad etish')}</button>
          </div>
        </div>
      )}
      {holat === 'bajarilmoqda' && <p className="text-xs text-text-dim" role="status">{t('Bajarilmoqda…')}</p>}
      {holat === 'bajarildi' && <p className="flex items-center gap-1 text-xs text-ok" role="status"><CheckCircle2 size={14} /> {t(xabar)}{h.avto ? ` · ${t('avtomatik (sozlamangizga ko‘ra)')}` : ''}</p>}
      {holat === 'xato' && <p className="flex items-center gap-1 text-xs text-danger" role="alert"><XCircle size={14} /> {xabar}</p>}
      {holat === 'rad' && <p className="text-xs text-text-dim" role="status">{t('Rad etildi — hech narsa o‘zgarmadi')}</p>}
    </div>
  );
}
