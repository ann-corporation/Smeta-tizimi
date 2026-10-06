import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { harakatNatijasi, harakatQarori, type HarakatTaklif } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { HARAKAT_MAYDONLARI, HARAKAT_NOMI, XAVF_NOMI, harakatniBajar } from './ai-harakat';

type Holat = 'kutilmoqda' | 'bajarilmoqda' | 'bajarildi' | 'xato' | 'rad';
const XAVF_USLUB: Record<string, string> = { past: 'border-ok/50 text-ok', orta: 'border-warn/60 text-warn', yuqori: 'border-danger/60 text-danger' };

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
    <div role="group" aria-label={t(HARAKAT_NOMI[h.amal] ?? h.amal)} className={`mt-2 rounded-xl border bg-surface-2 p-3 text-sm ${XAVF_USLUB[h.xavf] ?? 'border-border'}`}>
      <div className="flex items-center gap-2">
        {yuqori ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
        <b className="text-text">{t(HARAKAT_NOMI[h.amal] ?? h.amal)}</b>
        <span className="ml-auto rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{t(XAVF_NOMI[h.xavf] ?? h.xavf)}</span>
      </div>
      {h.tushuntirish && <p className="mt-1 text-xs text-text-dim">{h.tushuntirish}</p>}
      {h.ogohlantirish && <p role="alert" className="mt-1 rounded border border-danger/50 bg-danger/10 px-2 py-1 text-xs text-danger">{h.ogohlantirish}</p>}

      <dl className="mt-2 grid grid-cols-[auto,1fr] items-center gap-x-2 gap-y-1 text-xs text-text">
        {maydonlar.map((m) => (
          <div key={m.kalit} className="contents">
            <dt className="text-text-mute">{t(m.nom)}</dt>
            <dd>
              {holat === 'kutilmoqda' ? (
                <input aria-label={t(m.nom)} type={m.tur === 'son' ? 'number' : m.tur === 'sana' ? 'date' : 'text'} value={String(qiymat[m.kalit] ?? '')}
                  onChange={(e) => setQiymat({ ...qiymat, [m.kalit]: m.tur === 'son' ? e.target.value : e.target.value })}
                  className="w-full rounded border border-border bg-surface px-1.5 py-0.5" />
              ) : <span>{String(qiymat[m.kalit] ?? '—')}</span>}
            </dd>
          </div>
        ))}
        {h.amal === 'grafik_foiz' && <div className="contents"><dt className="text-text-mute">{t('Hozirgi foiz')}</dt><dd>{String(h.parametrlar.eski_foiz ?? '—')}%</dd></div>}
      </dl>

      {holat === 'kutilmoqda' && (
        <div className="mt-3 space-y-2">
          {yuqori && (
            <label className="flex items-start gap-1.5 text-xs text-danger">
              <input type="checkbox" checked={tushundim} onChange={(e) => setTushundim(e.target.checked)} className="mt-0.5" />
              {t('Xavfni tushundim va baribir bajarmoqchiman')}
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={yuqori && !tushundim} onClick={() => void bajar(true)}
              className={`rounded-md px-3 py-1.5 text-xs text-white disabled:opacity-40 ${yuqori ? 'bg-danger' : 'bg-accent'}`}>{yuqori ? t('Baribir bajarish') : t('Tasdiqlash va bajarish')}</button>
            <button type="button" onClick={() => void rad()} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-dim hover:bg-white/5">{t('Rad etish')}</button>
          </div>
        </div>
      )}
      {holat === 'bajarilmoqda' && <p className="mt-2 text-xs text-text-dim" role="status">{t('Bajarilmoqda…')}</p>}
      {holat === 'bajarildi' && <p className="mt-2 flex items-center gap-1 text-xs text-ok" role="status"><CheckCircle2 size={14} /> {t(xabar)}{h.avto ? ` · ${t('avtomatik (sozlamangizga ko‘ra)')}` : ''}</p>}
      {holat === 'xato' && <p className="mt-2 flex items-center gap-1 text-xs text-danger" role="alert"><XCircle size={14} /> {xabar}</p>}
      {holat === 'rad' && <p className="mt-2 text-xs text-text-dim" role="status">{t('Rad etildi — hech narsa o‘zgarmadi')}</p>}
    </div>
  );
}
