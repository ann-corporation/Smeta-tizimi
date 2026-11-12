/**
 * USTA «Mening naryadlarim» (telefon, «Bugun» ichida). Naryad satrlari usta O'Z birligida va so'zlarida; katta «Bajardim» →
 * hajm (+/−, usta birligida), ixtiyoriy foto (FotoDalil) va ovozli izoh → `bajarildi` (navbat + idempotent operation_id: chaqiruvchida).
 * Holat oddiy so'zlarda: yuborildi → prorab qabul qildi → hisoblandi. «Bu oy ishlab topganim» = HR «Mening oyligim» ning donabay qismi (o'qiladi, hisoblanmaydi).
 * Self-contained: faqat props + hrMenOl; navigatsiyaga tegmaydi.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, Minus, Plus } from 'lucide-react';
import { hrMenOl } from '../../api/t2-hr';
import { FotoDalil } from '../../components/foto-dalil/FotoDalil';
import { bajardimMumkin, type NaryadSatr } from '../../lib/usta/naryad-ish';
import { t } from '../../i18n/til';

const son = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Number(v.toFixed(3)).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const pul = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${Math.round(v).toLocaleString('ru-RU')} ${t('so‘m')}`);
const ovozBor = () => typeof window !== 'undefined' && !!(Reflect.get(window, 'SpeechRecognition') || Reflect.get(window, 'webkitSpeechRecognition'));
type Tanish = { start(): void; stop(): void; lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

const HOLAT_SOZ: Record<NaryadSatr['holat'], string> = { berildi: 'Berildi', yuborildi: 'Yuborildi — prorab qabulini kutmoqda', qabul: 'Prorab qabul qildi', hisoblandi: 'Hisoblandi' };

/** «Bu oy ishlab topganim»: HR «Mening oyligim» bilan BIR manba (t2_hr_men_v1 → naryad_summa). Alohida jami hisoblanmaydi. */
export function OyDaromadi({ kid }: { kid: number }) {
  const [v, setV] = useState<{ summa: number | null; soni: number | null } | 'xato' | null>(null);
  useEffect(() => {
    let faol = true;
    void hrMenOl(kid).then((r) => {
      if (!faol) return;
      if ('qator' in r && r.qator) setV({ summa: r.qator.naryad_summa ?? null, soni: r.qator.naryad_soni ?? null }); else setV('xato');
    }).catch(() => faol && setV('xato'));
    return () => { faol = false; };
  }, [kid]);
  return (
    <div data-testid="usta-oy-daromadi" className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <div className="text-[13px] text-text-dim">{t('Bu oy ishlab topganim (donabay, naryad)')}</div>
      <div className="text-[24px] font-bold text-text">{v == null ? '…' : v === 'xato' ? '—' : pul(v.summa)}</div>
      <div className="text-[12px] text-text-mute">{t('Bu «Mening oyligim» dagi donabay qism bilan bir xil.')}</div>
    </div>
  );
}

export function UstaNaryad({ kid, satrlar, onlayn, onBajardim }: {
  kid: number; satrlar: readonly NaryadSatr[]; onlayn: boolean;
  onBajardim: (s: NaryadSatr, hajmUsta: number, izoh: string | null) => unknown;
}) {
  const [tanlangan, setTanlangan] = useState<NaryadSatr | null>(null);
  const [hajm, setHajm] = useState(0);
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [yozmoqda, setYozmoqda] = useState(false);
  const tanish = useRef<Tanish | null>(null);
  useEffect(() => () => { try { tanish.current?.stop(); } catch { /* ignore */ } }, []);

  const och = (s: NaryadSatr) => { setTanlangan(s); setHajm(s.holat === 'yuborildi' && s.bajarilgan != null ? s.bajarilgan : s.qolgan || s.hajm); setIzoh(''); };
  const yop = () => { setTanlangan(null); setHajm(0); setIzoh(''); };
  const yuborish = async () => { if (!tanlangan || hajm <= 0 || band) return; setBand(true); try { await onBajardim(tanlangan, hajm, izoh.trim() || null); yop(); } finally { setBand(false); } };

  const ovoz = () => {
    const C = (Reflect.get(window, 'SpeechRecognition') ?? Reflect.get(window, 'webkitSpeechRecognition')) as (new () => Tanish) | undefined; if (!C) return;
    if (yozmoqda) { try { tanish.current?.stop(); } catch { /* ignore */ } return; }
    const r = new C(); r.lang = 'uz-UZ'; r.interimResults = false; tanish.current = r;
    r.onresult = (e) => { const m = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim(); if (m) setIzoh((o) => (o ? `${o} ${m}` : m)); };
    r.onend = () => setYozmoqda(false); r.onerror = () => setYozmoqda(false);
    setYozmoqda(true); try { r.start(); } catch { setYozmoqda(false); }
  };

  return (
    <section className="flex flex-col gap-3" aria-label={t('Mening naryadlarim')} data-testid="usta-naryadlar">
      <p className="m-0 text-[13px] font-semibold uppercase tracking-wide text-text-mute">{t('Mening naryadlarim')}</p>
      <p data-testid="usta-qoida" className="m-0 rounded-[var(--radius-sm)] bg-warn-soft p-2 text-[13px] text-text">{t('Naryad berilgan ishni faqat «Bajardim» orqali yuboring — u oddiy ro‘yxatda ko‘rinmaydi.')}</p>
      {satrlar.map((s) => (
        <div key={s.naryadQatorId} data-testid={`usta-naryad-${s.naryadQatorId}`} className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-3">
          <div className="text-[16px] font-semibold leading-5 text-text">{s.nom}</div>
          <div className="text-[14px] text-text-dim">{t('Berilgan')}: {son(s.hajm)} {s.birlik} · {t('Qoldi')}: {son(s.qolgan)} {s.birlik}</div>
          <div className="text-[14px] text-text-dim">{t('Kelishilgan narx')}: {s.narxBirlik == null ? t('kelishilmagan') : `${pul(s.narxBirlik)} / ${s.birlik}`}</div>
          <div className="text-[14px] font-medium text-text" data-testid="usta-naryad-holat">
            {t(HOLAT_SOZ[s.holat])}
            {s.holat === 'yuborildi' && s.bajarilgan != null ? ` · ${son(s.bajarilgan)} ${s.birlik}` : ''}
            {(s.holat === 'qabul' || s.holat === 'hisoblandi') && s.qabul != null ? ` · ${son(s.qabul)} ${s.birlik}` : ''}
            {s.holat === 'hisoblandi' && s.summa != null ? ` · ${pul(s.summa)}` : ''}
          </div>
          {s.kamQabul && <div role="note" data-testid="usta-kam-qabul" className="rounded-[var(--radius-sm)] bg-warn-soft p-2 text-[13px] text-text">
            {t('Siz {a} {b} dedingiz, prorab {c} {b} qabul qildi.', { a: son(s.bajarilgan), b: s.birlik, c: son(s.qabul) })} {s.izoh ? `${t('Sabab')}: ${s.izoh}` : t('Sababini prorabdan so‘rang.')}
          </div>}
          {bajardimMumkin(s) && <button type="button" onClick={() => och(s)} className="mt-1 flex min-h-[56px] w-full items-center justify-center rounded-[var(--radius-md)] bg-accent text-[17px] font-semibold text-white active:scale-[0.99]">
            {s.holat === 'yuborildi' ? t('Qayta yuborish') : t('Bajardim')}
          </button>}
        </div>
      ))}
      <OyDaromadi kid={kid} />

      {tanlangan && (
        <div role="dialog" aria-label={t('Bajardim')} className="fixed inset-0 z-50 flex items-end bg-black/50" data-testid="usta-bajardim">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] bg-surface p-4">
            <div className="mb-2 text-[17px] font-semibold text-text">{tanlangan.nom}</div>
            <div className="mb-3 text-[14px] text-text-dim">{t('Qancha bajardingiz?')} ({tanlangan.birlik})</div>
            <div className="flex items-center gap-3">
              <button type="button" aria-label={t('Kamaytirish')} onClick={() => setHajm((h) => Math.max(0, Number((h - 1).toFixed(3))))} className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-border bg-surface active:scale-95"><Minus size={36} /></button>
              <input inputMode="decimal" aria-label={t('Miqdor')} value={String(hajm)} onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); setHajm(Number.isFinite(v) && v >= 0 ? v : 0); }} className="input h-20 min-w-0 flex-1 text-center text-[34px] font-bold tabular-nums" />
              <button type="button" aria-label={t('Ko‘paytirish')} onClick={() => setHajm((h) => Number((h + 1).toFixed(3)))} className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-border bg-accent/15 active:scale-95"><Plus size={36} /></button>
            </div>
            <textarea value={izoh} onChange={(e) => setIzoh(e.target.value)} rows={2} placeholder={t('Izoh (ixtiyoriy)')} aria-label={t('Izoh')} className="input mt-3 w-full p-3 text-[16px]" />
            {ovozBor() && <button type="button" onClick={ovoz} aria-pressed={yozmoqda} className="mt-2 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface text-[16px] font-semibold text-text"><Mic size={22} />{yozmoqda ? t('Eshityapman…') : t('Gapirib yozish')}</button>}
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-2 text-[14px] text-text-dim"><Camera size={18} />{t('Foto (ixtiyoriy)')}</div>
              {onlayn ? <FotoDalil kompaniyaId={kid} obyektId={tanlangan.obyektId} manba={{ turi: 'naryad', id: tanlangan.naryadId }} ai={false} joylashuv={false} ixcham />
                : <p className="m-0 text-[13px] text-text-mute">{t('Foto internet bo‘lganda qo‘shiladi.')}</p>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={yop} className="min-h-[56px] rounded-[var(--radius-md)] border border-border bg-surface text-[17px] font-semibold text-text">{t('Bekor qilish')}</button>
              <button type="button" disabled={band || hajm <= 0} onClick={() => void yuborish()} className="min-h-[56px] rounded-[var(--radius-md)] bg-accent text-[17px] font-semibold text-white disabled:opacity-50">{band ? t('Yuborilmoqda…') : t('Yuborish')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
