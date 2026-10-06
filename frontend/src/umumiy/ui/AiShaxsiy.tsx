import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { shaxsiyOl, shaxsiySaqla, type KasbIshchi, type ShaxsiySozlama } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from './Toast';
import { TOIFA_NOMI } from './ai-harakat';

const ISHONCH: Array<[ShaxsiySozlama['ishonch'], string, string]> = [
  ['sora', 'Har doim so‘rasin', 'Omborga yozish, grafik o‘zgartirish va eslatma ham — hammasi sizning tasdig‘ingizdan keyin.'],
  ['jiddiy', 'Faqat jiddiy qarorlarda so‘rasin (tavsiya)', 'Eslatma kabi xavfsiz ishlarni o‘zi qiladi; omborga yozish va grafik o‘zgartirishda tasdiq so‘raydi.'],
  ['avto', 'Aniq bo‘lganda o‘zi bajarsin', 'Siz hamma qiymatni aytgan bo‘lsangiz, past va o‘rta xavfli ishni o‘zi bajaradi va ko‘rsatadi. Yuqori xavfda (masalan qoldiqdan ortiq chiqim) HAR DOIM so‘raydi.'],
];

/** Shaxsiy sozlamalar: AI ishchim kim, nimani ko'radi, qachon mendan so'raydi, qaysi tilda va qanday uslubda gapiradi. */
export function AiShaxsiy({ kasb, kuzatuvYoqilgan, kuzatuvAlmashtir }: { kasb: KasbIshchi | null; kuzatuvYoqilgan: boolean; kuzatuvAlmashtir: (v: boolean) => void }) {
  const [s, setS] = useState<ShaxsiySozlama>({ til: 'auto', uslub: 'qisqa', ishonch: 'jiddiy' });
  const [yuklandi, setYuklandi] = useState(false);
  useEffect(() => { void shaxsiyOl().then((r) => { if (r.ok) setS({ til: r.natija.til, uslub: r.natija.uslub, ishonch: r.natija.ishonch }); setYuklandi(true); }); }, []);
  const saqla = async () => { const r = await shaxsiySaqla(s); toast(r.ok ? t('Sozlamalar saqlandi') : r.error, r.ok ? 'ok' : 'danger'); };

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
      {kasb && (
        <section className="rounded-xl border border-border bg-surface-2 p-3" aria-label={t('Mening AI ishchim')}>
          <div className="text-[11px] uppercase tracking-wide text-text-mute">{t('Mening AI ishchim')}</div>
          <div className="font-semibold text-text">{kasb.nom}</div>
          <p className="mt-0.5 text-xs text-text-dim">{kasb.vazifa}</p>
          <div className="mt-2 text-[11px] text-text-mute">{t('U faqat shularni ko‘ra oladi')}:</div>
          <div className="mt-1 flex flex-wrap gap-1">{kasb.kategoriyalar.map((x) => <span key={x} className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-text">{t(TOIFA_NOMI[x] ?? x)}</span>)}</div>
          {kasb.taqiq_izoh && <p className="mt-2 flex items-start gap-1 text-[11px] text-text-mute"><Lock size={12} className="mt-0.5 shrink-0" /> {kasb.taqiq_izoh}</p>}
          <details className="mt-2 text-[11px] text-text-dim">
            <summary className="cursor-pointer">{t('Kompaniyadagi boshqa AI ishchilar')} ({kasb.boshqalar.length})</summary>
            <ul className="mt-1 space-y-0.5">{kasb.boshqalar.map((b) => <li key={b.rol}><b className="text-text">{b.nom}</b> — {b.vazifa}</li>)}</ul>
          </details>
        </section>
      )}

      <fieldset className="space-y-2" disabled={!yuklandi}>
        <legend className="mb-1 text-xs font-semibold text-text">{t('AI qachon mendan so‘rasin?')}</legend>
        {ISHONCH.map(([k, nom, izoh]) => (
          <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${s.ishonch === k ? 'border-accent bg-accent/10' : 'border-border'}`}>
            <input type="radio" name="ai-ishonch" checked={s.ishonch === k} onChange={() => setS({ ...s, ishonch: k })} className="mt-0.5" />
            <span><b className="text-text">{t(nom)}</b><br /><span className="text-[11px] text-text-dim">{t(izoh)}</span></span>
          </label>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-text-mute">{t('Javob tili')}
            <select value={s.til} onChange={(e) => setS({ ...s, til: e.target.value as ShaxsiySozlama['til'] })} className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text">
              <option value="auto">{t('Savol tilida')}</option><option value="uz">{t('O‘zbekcha')}</option><option value="ru">{t('Ruscha')}</option>
            </select>
          </label>
          <label className="text-[11px] text-text-mute">{t('Javob uslubi')}
            <select value={s.uslub} onChange={(e) => setS({ ...s, uslub: e.target.value as ShaxsiySozlama['uslub'] })} className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text">
              <option value="qisqa">{t('Qisqa')}</option><option value="batafsil">{t('Batafsil')}</option>
            </select>
          </label>
        </div>
        <button type="button" onClick={() => void saqla()} className="rounded-md bg-accent px-3 py-1.5 text-xs text-white">{t('Saqlash')}</button>
      </fieldset>

      <section className="rounded-xl border border-border p-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={kuzatuvYoqilgan} onChange={(e) => kuzatuvAlmashtir(e.target.checked)} className="mt-0.5" />
          <span><b className="text-text">{t('AI kuzatuvi (qiyinchilikda yordam taklif qilsin)')}</b><br />
            <span className="text-[11px] text-text-dim">{t('Faqat sahifa nomi, tugma yorlig‘i va xato turi kuzatiladi — yozgan matningiz va kiritgan qiymatlaringiz HECH QACHON o‘qilmaydi. Istalgan payt o‘chirasiz.')}</span></span>
        </label>
      </section>
    </div>
  );
}
