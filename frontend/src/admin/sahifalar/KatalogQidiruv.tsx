/**
 * Platforma katalogi — ko'rish va qidirish (egasi 2026-10-03: "katalogni yuklab bo'ldi, endi uni qanday ishlatib
 * qayerdan ko'rsam bo'ladi"). Katalog bir marta platformaga yuklanadi, hamma kompaniya shu yerdan qidiradi.
 * Natijada narx qayerdan ekanligi to'liq: zavod, hudud, davr, NDS (narxIzohi bilan bir xil manba).
 */
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { katalogQidir, katalogQidirSozlar, sbPlatformaManbalarOl, type KatalogQatori, type PlatformaNarxManba } from '../../api/t2-narx-dalil';
import { HUDUDLAR } from '../../lib/hudud';
import { useTil } from '../../i18n/til';
import { narxKatalogi } from '../../lib/narx-katalog/price-remote';

const pul = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

export function KatalogQidiruv() {
  const { t } = useTil();
  const [manbalar, setManbalar] = useState<PlatformaNarxManba[]>([]);
  const [matn, setMatn] = useState('');
  const [hudud, setHudud] = useState('');
  const [natija, setNatija] = useState<KatalogQatori[] | null>(null);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');

  /** 2026-10-06: platforma katalogi qatorlari R2 da — son ham R2 manifestidan (bazada qatorlar yo'q). */
  const [r2Soni, setR2Soni] = useState<{ manbaId: number; soni: number } | null>(null);
  useEffect(() => { void sbPlatformaManbalarOl().then((r) => setManbalar(r.ok ? r.qatorlar ?? [] : [])); }, []);
  useEffect(() => { void narxKatalogi().then((c) => setR2Soni({ manbaId: c.dict.manba.id, soni: c.rows.length })).catch(() => setR2Soni(null)); }, []);

  const qidir = async () => {
    setBand(true); setXato('');
    const r = await katalogQidir(matn, hudud || null);
    setBand(false);
    if (!r.ok) { setXato(t('Qidiruv bajarilmadi') + (r.error ? ': ' + r.error : '')); return; }
    setNatija(r.qatorlar ?? []);
  };

  return (
    <section className="karta space-y-3 p-4">
      <div>
        <h2 className="text-[14px] font-semibold text-text">{t('Platforma katalogi — qidirish')}</h2>
        <p className="mt-1 text-[11px] text-text-mute">{t('Katalog bir marta yuklanadi, barcha kompaniyalar shu yerdan qidiradi. Narx qayerdan ekanligi to‘liq ko‘rinadi.')}</p>
      </div>
      {manbalar.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {manbalar.map((m) => (
            <span key={m.id} className="rounded border border-border px-2 py-1 text-text-dim">
              {m.nom}{m.yil ? ` · ${m.yil}${m.kvartal ? `-${m.kvartal}` : ''}` : ''} · {(r2Soni && r2Soni.manbaId === m.id ? r2Soni.soni : Number(m.qator_soni)).toLocaleString('ru-RU')}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[260px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2 top-2.5 text-text-mute" />
          <input value={matn} onChange={(e) => setMatn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void qidir(); }}
            placeholder={t('Masalan: труба 57 3,5 yoki бетон В25')} aria-label={t('Katalogdan qidirish')} className="input h-8 w-full pl-7 text-[12px]" />
        </label>
        <select value={hudud} onChange={(e) => setHudud(e.target.value)} aria-label={t('Hudud')} className="input h-8 px-2 text-[12px]">
          <option value="">{t('Barcha hududlar')}</option>
          {HUDUDLAR.map((h) => <option key={h.kalit} value={h.kalit}>{h.nom}</option>)}
        </select>
        <button type="button" onClick={() => void qidir()} disabled={band} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{katalogQidirSozlar(matn).length ? t('Qidirish') : t('Katalogni ko‘rish')}</button>
      </div>
      {xato && <div role="alert" className="text-[12px] text-danger">{xato}</div>}
      {natija && (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-[12px]">
            <thead className="bg-white/[.03] text-left text-[11px] text-text-mute">
              <tr><th className="p-2">{t('Nomi')}</th><th className="p-2">{t('Birlik')}</th><th className="p-2 text-right">{t('Narx')}</th><th className="p-2">{t('NDS')}</th><th className="p-2">{t('Ishlab chiqaruvchi')}</th><th className="p-2">{t('Hudud')}</th><th className="p-2">{t('Davr')}</th></tr>
            </thead>
            <tbody>
              {natija.map((q) => (
                <tr key={q.id} className="border-t border-border/50 align-top">
                  <td className="max-w-[420px] p-2 text-text">{q.nom}{q.guruh && <div className="text-[10px] text-text-mute">{q.guruh}</div>}</td>
                  <td className="p-2 text-text-dim">{q.birlik}</td>
                  <td className="p-2 text-right tabular-nums text-text">{pul(q.narx)}</td>
                  <td className="p-2 text-text-dim">{q.nds_holati === 'nds_siz' ? t('NDS siz') : q.nds_holati === 'nds_bilan' ? t('NDS bilan') : (q.nds_izoh ?? '')}</td>
                  <td className="max-w-[220px] p-2 text-text-dim">{q.ishlab_chiqaruvchi}</td>
                  <td className="p-2 text-text-dim">{q.hudud}</td>
                  <td className="p-2 text-text-dim">{q.yil ? `${q.yil}${q.kvartal ? `-${q.kvartal}` : ''}` : ''}</td>
                </tr>
              ))}
              {!natija.length && <tr><td colSpan={7} className="p-4 text-center text-text-mute">{t('Hech narsa topilmadi')}</td></tr>}
            </tbody>
          </table>
          {natija.length >= 200 && <div className="p-2 text-[11px] text-text-mute">{t('Birinchi 200 ta ko‘rsatildi — so‘rovni aniqlashtiring')}</div>}
        </div>
      )}
    </section>
  );
}
