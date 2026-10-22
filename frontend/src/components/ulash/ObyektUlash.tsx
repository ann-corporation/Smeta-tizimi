/**
 * ObyektUlash — T5 «Telegram modeli» (egasi 2026-10-22): obyektni bitta havola bilan tashqi odamga ulashish.
 * Havolani olgan odam o'z ish joyida (shaxsiy ham bo'ladi) obyektni faqat KO'RADI: holat, tanlangan bo'lsa —
 * tasdiqlangan F2 va shartnoma xulosasi. Hech narsani o'zgartira olmaydi. Istalgan payt «To'xtatish».
 * Ruxsat, egalik va muddat (7 kun) bazada; ochiq kod faqat bir marta shu oynada ko'rinadi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Send, Share2, X } from 'lucide-react';
import { aloqaHolati, obyektniUlash, obyektUlashlari, ulashHavolasi, type Ulash, type UlashResurs } from '../../api/t2-tomon';
import { t } from '../../i18n/til';

const RESURSLAR: Array<{ kalit: UlashResurs; nom: string; izoh: string }> = [
  { kalit: 'f2', nom: 'Tasdiqlangan F2 aktlari', izoh: 'oylar va summalar' },
  { kalit: 'shartnoma_xulosa', nom: 'Shartnoma xulosasi', izoh: 'raqam va summa' },
];
const sana = (s: string | null) => (s ? new Date(s).toLocaleDateString('uz-UZ') : '—');

export function ObyektUlash({ kompaniyaId, obyekt, yopish }: { kompaniyaId: number; obyekt: { id: number; nom: string }; yopish: () => void }) {
  const [tanlov, setTanlov] = useState<UlashResurs[]>(['f2']);
  const [havola, setHavola] = useState<string | null>(null);
  const [nusxa, setNusxa] = useState(false);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [ulashlar, setUlashlar] = useState<Ulash[] | null>(null);

  const yukla = useCallback(async () => {
    const r = await obyektUlashlari(kompaniyaId, obyekt.id);
    if (r.ok) setUlashlar(r.natija); else setXato(r.error);
  }, [kompaniyaId, obyekt.id]);
  useEffect(() => { void yukla(); }, [yukla]);

  async function yarat() {
    setBand(true); setXato('');
    const r = await obyektniUlash(kompaniyaId, obyekt.id, tanlov);
    setBand(false);
    if (!r.ok || !r.natija.kod) { setXato(r.ok ? t('Havola yaratilmadi') : r.error); return; }
    setHavola(ulashHavolasi(r.natija.kod)); setNusxa(false);
    void yukla();
  }
  async function nusxala() {
    if (!havola) return;
    try { await navigator.clipboard.writeText(havola); setNusxa(true); } catch { setNusxa(false); }
  }
  async function toxtat(u: Ulash) {
    if (!window.confirm(t('Ulashish to‘xtatilsinmi? Havola egasi obyektni boshqa ko‘rmaydi.'))) return;
    const r = await aloqaHolati(kompaniyaId, u.aloqa_id, u.holat === 'taklif' ? 'bekor' : 'yopish', t('Ulashish to‘xtatildi'));
    if (!r.ok) { setXato(r.error); return; }
    void yukla();
  }
  const almashtir = (k: UlashResurs) => setTanlov((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  const tgHavola = havola ? `https://t.me/share/url?url=${encodeURIComponent(havola)}&text=${encodeURIComponent(`${t('Obyekt')}: ${obyekt.nom}`)}` : '';

  return (
    <div role="dialog" aria-modal="true" aria-label={t('Obyektni ulashish')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[480px] space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start gap-2">
          <Share2 className="mt-0.5 text-accent" size={18} />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-text">{t('Obyektni ulashish')}</h3>
            <p className="truncate text-[12.5px] text-text-dim">{obyekt.nom}</p>
          </div>
          <button type="button" className="tugma h-7 w-7 p-0" aria-label={t('Yopish')} onClick={yopish}><X size={14} /></button>
        </div>
        <p className="text-[12.5px] text-text-dim">{t('Havolani olgan odam obyektni o‘z ish joyida faqat ko‘radi — hech narsani o‘zgartira olmaydi. Istalgan payt to‘xtatasiz.')}</p>

        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-[12px] text-text-mute">{t('Nimani ko‘rsatamiz')}</legend>
          <label className="flex items-center gap-2 text-[12.5px] text-text-dim"><input type="checkbox" checked disabled /> {t('Obyekt holati va sertifikatlangan jami')}</label>
          {RESURSLAR.map((r) => <label key={r.kalit} className="flex items-center gap-2 text-[12.5px] text-text">
            <input type="checkbox" checked={tanlov.includes(r.kalit)} onChange={() => almashtir(r.kalit)} /> {t(r.nom)} <span className="text-text-mute">— {t(r.izoh)}</span>
          </label>)}
        </fieldset>

        {!havola && <button type="button" className="tugma tugma-asosiy w-full" disabled={band} onClick={() => void yarat()}>
          {band ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} {t('Havola yaratish')}</button>}
        {havola && <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/5 p-3">
          <p className="text-[12px] text-text-mute">{t('Havola 7 kun amal qiladi va bir marta qabul qilinadi. Uni faqat kerakli odamga yuboring.')}</p>
          <input readOnly value={havola} aria-label={t('Ulashish havolasi')} className="w-full rounded-lg border border-border bg-bg p-2 font-mono text-[12px] text-text" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tugma" onClick={() => void nusxala()}>{nusxa ? <Check size={14} /> : <Copy size={14} />} {nusxa ? t('Nusxalandi') : t('Nusxalash')}</button>
            <a className="tugma" href={tgHavola} target="_blank" rel="noopener noreferrer"><Send size={14} /> {t('Telegram orqali')}</a>
            <button type="button" className="tugma" onClick={() => setHavola(null)}>{t('Yana havola')}</button>
          </div>
        </div>}

        <div>
          <p className="mb-1 text-[12px] font-semibold text-text-dim">{t('Kimlarga ulashilgan')}</p>
          {ulashlar === null && <div className="skel h-10 rounded-lg" />}
          {ulashlar?.length === 0 && <p className="text-[12px] text-text-mute">{t('Hali hech kimga ulashilmagan.')}</p>}
          {!!ulashlar?.length && <ul className="divide-y divide-border/60">
            {ulashlar.map((u) => <li key={u.aloqa_id} className="flex items-center gap-2 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">
                {u.oluvchi ? <b>{u.oluvchi.turi === 'shaxsiy' ? '👤 ' : '🏢 '}{u.oluvchi.nom}</b> : <span className="text-warn">{t('Havola kutilmoqda')} · {t('muddati')} {sana(u.kod_muddati)}</span>}
                {u.oluvchi && <span className="text-text-mute"> · {sana(u.qabul_vaqti)}</span>}
              </span>
              <button type="button" className="tugma h-7" onClick={() => void toxtat(u)}>{t('To‘xtatish')}</button>
            </li>)}
          </ul>}
        </div>
        {xato && <p role="alert" className="text-[12.5px] text-danger">{xato}</p>}
      </div>
    </div>
  );
}
