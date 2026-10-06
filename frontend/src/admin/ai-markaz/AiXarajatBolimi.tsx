import { useState } from 'react';
import { byudjetBelgila, ustamaBelgila, type Markaz } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { foiz, usd } from './ai-markaz-yordam';

type Komp = { id: number; nom: string };
const LIMIT_NAMUNA = '50';

/** Xarajat va limitlar: limit yo'q = AI ishlamaydi. Platforma umumiy limiti + kompaniya limitlari + sarf taqsimoti. */
export function AiXarajatBolimi({ m, kompaniyalar, yangila }: { m: Markaz; kompaniyalar: Komp[]; yangila: () => void }) {
  const [plLimit, setPlLimit] = useState(m.limit_usd != null ? String(m.limit_usd) : '');
  const [ogoh, setOgoh] = useState(String(m.ogohlantirish_foiz ?? 80));
  const [kId, setKId] = useState('');
  const [kLimit, setKLimit] = useState('');
  const [ust, setUst] = useState(String(m.ustama_foiz ?? 40));
  const [uKId, setUKId] = useState('');
  const [uK, setUK] = useState('');
  const ustFoiz = Number(ust);
  const misol = Number.isFinite(ustFoiz) && ustFoiz >= 0 ? 5 * (1 + ustFoiz / 100) : null;

  const saqla = async (kompaniya: number | null, limit: string, ogohFoiz: number, faol = true) => {
    const v = Number(limit);
    if (!limit.trim() || !Number.isFinite(v) || v < 0) { toast(t('Limit musbat son bo‘lishi kerak'), 'warn'); return; }
    const r = await byudjetBelgila(kompaniya, v, ogohFoiz, faol);
    if (r.ok) { toast(t('Limit saqlandi'), 'ok'); yangila(); } else toast(r.error, 'danger');
  };
  const ustamaSaqla = async (kompaniya: number | null, qiymat: string) => {
    const v = qiymat.trim() === '' ? null : Number(qiymat);
    if (kompaniya == null && v == null) { toast(t('Ustama foizini kiriting'), 'warn'); return; }
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 1000)) { toast(t('Ustama 0 dan 1000 gacha bo‘lishi kerak'), 'warn'); return; }
    const r = await ustamaBelgila(kompaniya, v);
    if (r.ok) { toast(t('Ustama saqlandi'), 'ok'); yangila(); } else toast(r.error, 'danger');
  };
  const sarfFoiz = m.limit_usd ? foiz(m.oy_sarfi_usd, m.limit_usd) : 0;
  const narxsiz = m.modellar.reduce((a, x) => a + x.narxsiz, 0);
  return (
    <div className="space-y-3">
      <section className="grid gap-2 md:grid-cols-3" aria-label={t('Moliyaviy natija')}>
        <div className="karta p-3"><div className="text-[11px] uppercase text-text-mute">{t('Tannarx (OpenRouter sarfi)')}</div><div className="text-[20px] font-semibold tabular-nums text-text">{usd(m.oy_sarfi_usd)}</div></div>
        <div className="karta p-3"><div className="text-[11px] uppercase text-text-mute">{t('Kompaniyalarga hisoblangan')}</div><div className="text-[20px] font-semibold tabular-nums text-text">{usd(m.mijoz_oy_usd)}</div></div>
        <div className="karta p-3"><div className="text-[11px] uppercase text-text-mute">{t('Foyda (shu oy)')}</div><div className={`text-[20px] font-semibold tabular-nums ${m.foyda_oy_usd >= 0 ? 'text-ok' : 'text-danger'}`}>{usd(m.foyda_oy_usd)}</div></div>
      </section>

      <section className="karta p-4">
        <h2 className="mb-1 text-[14px] font-semibold text-text">{t('Foyda ustamasi')}</h2>
        <p className="mb-2 text-[12px] text-text-mute">{t('Kompaniyadan olinadigan narx = OpenRouter haqiqiy sarfi × (1 + ustama%). Natija so‘mga, so‘ng tokenga aylantirilib, kompaniya hamyonidan yechiladi (kurs va token narxi — «Sozlamalar»da).')}</p>
        <div className="flex flex-wrap items-end gap-2 text-[11px] text-text-mute">
          <label className="flex flex-col gap-1">{t('Standart ustama (%)')}<input inputMode="decimal" value={ust} onChange={(e) => setUst(e.target.value)} className="input h-8 w-24 px-2 text-[13px]" /></label>
          <button type="button" className="tugma-asosiy h-8 px-3 text-[12px]" onClick={() => void ustamaSaqla(null, ust)}>{t('Saqlash')}</button>
          {misol != null && <span className="pb-1.5 text-[12px] text-text-dim">{t('Misol')}: $5.00 → <b className="text-text">{usd(misol)}</b></span>}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 text-[11px] text-text-mute">
          <label className="flex flex-col gap-1">{t('Kompaniya uchun alohida ustama')}
            <select value={uKId} onChange={(e) => setUKId(e.target.value)} className="input h-8 w-56 px-2 text-[12px]" aria-label={t('Ustama kompaniyasi')}>
              <option value="">{t('Tanlang…')}</option>{kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
            </select></label>
          <label className="flex flex-col gap-1">{t('Ustama (%)')}<input inputMode="decimal" value={uK} onChange={(e) => setUK(e.target.value)} className="input h-8 w-24 px-2 text-[12px]" /></label>
          <button type="button" disabled={!uKId || uK.trim() === ''} className="tugma h-8 px-3 text-[12px] disabled:opacity-40" onClick={() => void ustamaSaqla(Number(uKId), uK)}>{t('Kompaniya ustamasini saqlash')}</button>
          <button type="button" disabled={!uKId} className="tugma h-8 px-3 text-[12px] disabled:opacity-40" onClick={() => void ustamaSaqla(Number(uKId), '')}>{t('Standartga qaytarish')}</button>
        </div>
      </section>

      <section className="karta p-4">
        <h2 className="mb-1 text-[14px] font-semibold text-text">{t('Platforma oylik limiti')}</h2>
        <p className="mb-2 text-[12px] text-text-mute">{t('Butun AI xizmatining bir oylik umumiy chegarasi (dollarda). Limit tugasa yoki belgilanmagan bo‘lsa, hech bir agent model chaqira olmaydi.')}</p>
        <div className="flex flex-wrap items-end gap-2 text-[11px] text-text-mute">
          <label className="flex flex-col gap-1">{t('Oylik limit ($)')}<input inputMode="decimal" value={plLimit} onChange={(e) => setPlLimit(e.target.value)} placeholder={LIMIT_NAMUNA} className="input h-8 w-28 px-2 text-[13px]" /></label>
          <label className="flex flex-col gap-1">{t('Ogohlantirish (%)')}<input inputMode="numeric" value={ogoh} onChange={(e) => setOgoh(e.target.value)} className="input h-8 w-20 px-2 text-[13px]" /></label>
          <button type="button" className="tugma-asosiy h-8 px-3 text-[12px]" onClick={() => void saqla(null, plLimit, Number(ogoh) || 80)}>{t('Saqlash')}</button>
          {m.limit_usd != null && <button type="button" className="tugma h-8 px-3 text-[12px] text-danger" onClick={() => void saqla(null, plLimit || String(m.limit_usd), Number(ogoh) || 80, false)}>{t('AI ni to‘xtatish (kill-switch)')}</button>}
        </div>
        {m.limit_usd != null && <p className="mt-2 text-[12px] text-text-dim">{t('Shu oy')}: {usd(m.oy_sarfi_usd)} / {usd(m.limit_usd)} ({sarfFoiz}%){!m.limit_faol ? ` · ${t('hozir TO‘XTATILGAN')}` : ''}</p>}
        {narxsiz > 0 && <p className="mt-1 text-[12px] text-warn">{narxsiz} {t('ta chaqiruvning narxi noma’lum (provayder narx bermadi, katalogda narx yo‘q) — limitga qo‘shilmagan. Modellarga narx kiriting.')}</p>}
      </section>

      <section className="karta overflow-x-auto p-4">
        <h2 className="mb-1 text-[14px] font-semibold text-text">{t('Kompaniyalar bo‘yicha sarf va limit')}</h2>
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th>{t('Kompaniya')}</th><th>{t('Tannarx')}</th><th>{t('Hisoblangan')}</th><th>{t('Token')}</th><th>{t('Ustama')}</th><th>{t('Chaqiruv')}</th><th>{t('Limit')}</th></tr></thead>
          <tbody>
            {m.kompaniyalar.length === 0 && <tr><td colSpan={7} className="py-2 text-text-mute">{t('Hali sarf yo‘q')}</td></tr>}
            {m.kompaniyalar.map((k) => (
              <tr key={`${k.kompaniya_id}`} className="border-t border-border/60"><td className="py-1 text-text">{k.nom ?? (k.kompaniya_id == null ? t('Tizim (platforma)') : `#${k.kompaniya_id}`)}</td>
                <td className="tabular-nums">{usd(k.narx_usd)}</td><td className="tabular-nums">{usd(k.mijoz_usd)}</td><td className="tabular-nums">{Math.round(k.token).toLocaleString('ru-RU')}</td><td className="tabular-nums">{k.ustama_foiz}%</td><td className="tabular-nums">{k.chaqiruv}</td><td className="tabular-nums">{k.limit_usd != null ? usd(k.limit_usd) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-end gap-2 text-[11px] text-text-mute">
          <label className="flex flex-col gap-1">{t('Kompaniya')}
            <select value={kId} onChange={(e) => setKId(e.target.value)} className="input h-8 w-56 px-2 text-[12px]" aria-label={t('Kompaniya')}>
              <option value="">{t('Tanlang…')}</option>{kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
            </select></label>
          <label className="flex flex-col gap-1">{t('Oylik limit ($)')}<input inputMode="decimal" value={kLimit} onChange={(e) => setKLimit(e.target.value)} placeholder={LIMIT_NAMUNA} className="input h-8 w-24 px-2 text-[12px]" /></label>
          <button type="button" disabled={!kId} className="tugma h-8 px-3 text-[12px] disabled:opacity-40" onClick={() => void saqla(Number(kId), kLimit, 80)}>{t('Kompaniya limitini saqlash')}</button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="karta overflow-x-auto p-4">
          <h2 className="mb-1 text-[13px] font-semibold text-text">{t('Agent va amal bo‘yicha')}</h2>
          <table className="w-full text-[12px]"><tbody>
            {m.agentlar.length === 0 && <tr><td className="text-text-mute">{t('Hali sarf yo‘q')}</td></tr>}
            {m.agentlar.map((a, i) => <tr key={i} className="border-t border-border/60"><td className="py-1 text-text">{a.profil}<span className="text-text-mute"> · {a.amal}</span></td><td className="tabular-nums">{a.chaqiruv}×</td><td className="text-right tabular-nums">{usd(a.narx_usd)}</td></tr>)}
          </tbody></table>
        </section>
        <section className="karta overflow-x-auto p-4">
          <h2 className="mb-1 text-[13px] font-semibold text-text">{t('Model bo‘yicha')}</h2>
          <table className="w-full text-[12px]"><tbody>
            {m.modellar.length === 0 && <tr><td className="text-text-mute">{t('Hali sarf yo‘q')}</td></tr>}
            {m.modellar.map((x) => <tr key={x.model} className="border-t border-border/60"><td className="py-1 text-text">{x.model}</td><td className="tabular-nums">{x.chaqiruv}×</td><td className="text-right tabular-nums">{usd(x.narx_usd)}</td></tr>)}
          </tbody></table>
        </section>
      </div>
    </div>
  );
}
