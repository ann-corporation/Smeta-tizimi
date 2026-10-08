import { useEffect, useState } from 'react';
import { uslubOl, uslubSaqla, uslubTozala, type UslubHolati } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from './Toast';

const MAKS = 600;

/**
 * «AI meni qanday biladi»: o'rganilgan uslub (faqat savol SHAKLI — til, uzunlik, batafsil/qisqa so'rash), o'z ko'rsatmangiz,
 * o'chirish va tozalash. Savol matni va kiritilgan qiymatlar saqlanmaydi. Hammasi faqat sizniki.
 */
export function AiUslub() {
  const [h, setH] = useState<UslubHolati | null>(null);
  const [korsatma, setKorsatma] = useState('');
  const [yoqilgan, setYoqilgan] = useState(true);
  const yukla = () => uslubOl().then((r) => { if (r.ok) { setH(r.natija); setKorsatma(r.natija.korsatma ?? ''); setYoqilgan(r.natija.yoqilgan); } });
  useEffect(() => { void yukla(); }, []);
  if (!h) return null;

  const saqla = async () => {
    const r = await uslubSaqla(korsatma, yoqilgan);
    toast(r.ok ? t('Uslub sozlamasi saqlandi') : r.error, r.ok ? 'ok' : 'danger');
    if (r.ok) void yukla();
  };
  const tozala = async () => {
    const r = await uslubTozala();
    toast(r.ok ? t('O‘rganilgan uslub tozalandi') : r.error, r.ok ? 'ok' : 'danger');
    if (r.ok) void yukla();
  };
  return (
    <section className="rounded-xl border border-border p-3" aria-label={t('AI meni qanday biladi')}>
      <div className="text-xs font-semibold text-text">{t('AI meni qanday biladi')}</div>
      <p className="mt-1 text-[11px] text-text-dim">{t('Faqat savollaringiz shakli kuzatiladi (til, uzunlik, batafsil yoki qisqa so‘rashingiz). Savol matni va kiritgan qiymatlaringiz saqlanmaydi.')}</p>
      <div className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-text">
        {h.xulosa.length
          ? <ul className="list-disc space-y-0.5 pl-4">{h.xulosa.map((x) => <li key={x}>{t(x)}</li>)}</ul>
          : <span className="text-text-dim">{t('Hali yetarli ma‘lumot yo‘q — bir necha savoldan keyin uslubingiz shu yerda ko‘rinadi.')}</span>}
      </div>
      <label className="mt-2 block text-[11px] text-text-mute">{t('Menga shunday javob ber (ixtiyoriy)')}
        <textarea value={korsatma} maxLength={MAKS} rows={3} onChange={(e) => setKorsatma(e.target.value)}
          placeholder={t('Masalan: avval xulosa, keyin raqamlar; jadval ko‘rinishida; ruscha atamalarni saqla')}
          className="mt-1 w-full resize-y rounded border border-border bg-surface px-2 py-1.5 text-xs text-text" />
      </label>
      <div className="text-right text-[10px] text-text-mute">{korsatma.length}/{MAKS}</div>
      <label className="mt-1 flex cursor-pointer items-start gap-2 text-xs">
        <input type="checkbox" checked={yoqilgan} onChange={(e) => setYoqilgan(e.target.checked)} className="mt-0.5" />
        <span><b className="text-text">{t('Uslubimni o‘rgansin')}</b><br /><span className="text-[11px] text-text-dim">{t('O‘chirsangiz, o‘rganilgan belgilar ham o‘chiriladi va yangi belgi yig‘ilmaydi.')}</span></span>
      </label>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void saqla()} className="rounded-md bg-accent px-3 py-1.5 text-xs text-white">{t('Saqlash')}</button>
        <button type="button" onClick={() => void tozala()} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-dim hover:bg-white/5">{t('O‘rganilganni tozalash')}</button>
      </div>
    </section>
  );
}
