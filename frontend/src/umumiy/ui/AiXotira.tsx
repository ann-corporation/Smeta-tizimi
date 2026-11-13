import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { smetaXotiraYoz, smetaXotirasi, type XotiraYozuv } from '../../api/smeta-ai';
import { t } from '../../i18n/til';
import { xotiraKalit, xotiraTekshir } from '../../lib/yordamchi/xotira';
import { toast } from './Toast';

const DARAJA_NOMI = { foydalanuvchi: 'Shaxsiy', kompaniya: 'Kompaniya', tizim: 'Tizim (hammaga umumiy)' } as const;

/** «Jarvis men haqimda nimani biladi»: shaxsiy va kompaniya xotirasini ko'rish, qo'shish, o'chirish (tizim xotirasi — faqat o'qish). Pul summalari/parol yozilmaydi. */
export function AiXotira({ kompaniyaId }: { kompaniyaId: number | null }) {
  const [royxat, setRoyxat] = useState<XotiraYozuv[] | null>(null);
  const [matn, setMatn] = useState('');
  const [daraja, setDaraja] = useState<'foydalanuvchi' | 'kompaniya'>('foydalanuvchi');
  const [band, setBand] = useState(false);
  const yukla = useCallback(async () => {
    if (!kompaniyaId) { setRoyxat([]); return; }
    try { setRoyxat((await smetaXotirasi(kompaniyaId)).yozuvlar); } catch { setRoyxat([]); }
  }, [kompaniyaId]);
  useEffect(() => { void yukla(); }, [yukla]);
  if (!kompaniyaId) return null;

  async function qosh() {
    const v = xotiraTekshir(matn);
    if (!v.ok) { toast(`${t('Bu xotiraga yozilmaydi')}: ${v.sabab}`, 'warn'); return; }
    setBand(true);
    const ok = await smetaXotiraYoz(kompaniyaId!, v.mazmun, daraja, xotiraKalit(v.mazmun)).catch(() => false);
    setBand(false);
    if (ok) { setMatn(''); void yukla(); toast(t('Eslab qoldim'), 'ok'); } else toast(t('Xotira yozilmadi (ruxsat yoki limit)'), 'warn');
  }
  async function unut(y: XotiraYozuv) {
    if (y.daraja === 'tizim') return;
    setBand(true);
    const ok = await smetaXotiraYoz(kompaniyaId!, '-', y.daraja, y.kalit).catch(() => false);
    setBand(false);
    if (ok) void yukla(); else toast(t('O‘chirib bo‘lmadi (ruxsat)'), 'warn');
  }
  const guruh = (d: XotiraYozuv['daraja']) => (royxat ?? []).filter((x) => x.daraja === d);
  return (
    <section className="rounded-xl border border-border p-3" aria-label={t('Jarvis men haqimda nimani biladi')} data-testid="ai-xotira">
      <div className="font-semibold text-text">{t('Jarvis men haqimda nimani biladi')}</div>
      <p className="mt-0.5 text-[11px] text-text-mute">{t('Faqat afzalliklar va odatlar. Pul summalari, parollar va shaxsiy raqamlar saqlanmaydi; xotira ruxsatni kengaytirmaydi.')}</p>
      {royxat && !royxat.length && <p className="mt-2 text-xs text-text-dim">{t('Hozircha hech narsa eslab qolinmagan.')}</p>}
      {(['foydalanuvchi', 'kompaniya', 'tizim'] as const).map((d) => guruh(d).length > 0 && (
        <div key={d} className="mt-2"><div className="text-[11px] font-medium text-text-dim">{t(DARAJA_NOMI[d])}</div>
          <ul className="mt-1 space-y-1">{guruh(d).map((y) => (
            <li key={y.kalit} className="flex items-start gap-2 rounded bg-surface-2 px-2 py-1 text-xs text-text">
              <span className="flex-1">{y.mazmun}</span>
              {d !== 'tizim' && <button type="button" disabled={band} onClick={() => void unut(y)} aria-label={t('Unutish')} title={t('Unutish')} className="rounded p-0.5 text-text-dim hover:text-danger"><Trash2 size={13} /></button>}
            </li>))}</ul></div>))}
      <div className="mt-3 flex gap-1.5">
        <input value={matn} onChange={(e) => setMatn(e.target.value)} maxLength={400} placeholder={t('Masalan: men doim QQS bilan ko‘raman')} aria-label={t('Yangi xotira')} className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text" />
        <select value={daraja} onChange={(e) => setDaraja(e.target.value as 'foydalanuvchi' | 'kompaniya')} aria-label={t('Daraja')} className="rounded border border-border bg-surface px-1 text-xs text-text">
          <option value="foydalanuvchi">{t('Shaxsiy')}</option><option value="kompaniya">{t('Kompaniya')}</option>
        </select>
        <button type="button" disabled={band || !matn.trim()} onClick={() => void qosh()} className="fz-btn fz-btn--primary fz-btn--sm">{t('Eslab qol')}</button>
      </div>
    </section>
  );
}
