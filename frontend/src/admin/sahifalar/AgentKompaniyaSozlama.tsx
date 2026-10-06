/**
 * AgentKompaniyaSozlama.tsx — KOMPANIYA ADMINI uchun AI sozlamalari: AI yoqish/o'chirish, oylik TOKEN limiti, a'zolar uchun AI kuzatuvi,
 * tokenlar balansi va shu oy sarfi (agentlar bo'yicha). Hamma a'zo ko'radi; o'zgartirish — admin/boss/direktor (server tekshiradi).
 * Tannarx va ustama kompaniyaga ko'rsatilmaydi — faqat token.
 */
import { useCallback, useEffect, useState } from 'react';
import { kompaniyaSozlamaOl, kompaniyaSozlamaSaqla, sarfHisobotiOl, type KompaniyaSozlama, type SarfHisoboti } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const son = (n: number) => Math.round(n).toLocaleString('ru-RU');
const LIMIT_NAMUNA = 'Cheklovsiz';

export function AgentKompaniyaSozlama({ kompaniyaId }: { kompaniyaId: number }) {
  const [z, setZ] = useState<KompaniyaSozlama | null>(null);
  const [h, setH] = useState<SarfHisoboti | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yoq, setYoq] = useState(true);
  const [kuzatuv, setKuzatuv] = useState(true);
  const [limit, setLimit] = useState('');

  const yukla = useCallback(async () => {
    const [a, b] = await Promise.all([kompaniyaSozlamaOl(kompaniyaId), sarfHisobotiOl(kompaniyaId)]);
    if (a.ok) { setZ(a.natija); setYoq(a.natija.ai_yoqilgan); setKuzatuv(a.natija.kuzatuv_ruxsat); setLimit(a.natija.oylik_token_limit != null ? String(a.natija.oylik_token_limit) : ''); setXato(null); } else setXato(a.error);
    setH(b.ok ? b.natija : null);
  }, [kompaniyaId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const saqla = async () => {
    const lim = limit.trim() === '' ? null : Number(limit);
    if (lim != null && (!Number.isFinite(lim) || lim < 0)) { toast(t('Token limiti musbat son bo‘lishi kerak'), 'warn'); return; }
    const r = await kompaniyaSozlamaSaqla(kompaniyaId, { aiYoqilgan: yoq, tokenLimit: lim, kuzatuvRuxsat: kuzatuv });
    if (r.ok) { toast(t('AI sozlamalari saqlandi'), 'ok'); void yukla(); } else toast(r.error, 'danger');
  };

  if (xato) return <p className="text-xs text-text-dim">{t('AI sozlamalari mavjud emas')}: {xato}</p>;
  if (!z) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  const tahrir = z.tahrir_mumkin;
  const limitFoiz = z.oylik_token_limit ? Math.min(100, Math.round((z.oy_token / z.oylik_token_limit) * 100)) : 0;
  return (
    <section className="space-y-3" aria-label={t('Kompaniya AI sozlamalari')}>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="karta p-3">
          <div className="text-[11px] uppercase text-text-mute">{t('Token balansi')}</div>
          <div className={`text-[22px] font-semibold tabular-nums ${z.balans <= 0 ? 'text-danger' : 'text-text'}`}>{son(z.balans)}</div>
          {z.balans <= 0 && <div className="text-[11px] text-danger">{t('Tokenlar tugagan — AI ishlamaydi. Hisobni to‘ldiring.')}</div>}
        </div>
        <div className="karta p-3">
          <div className="text-[11px] uppercase text-text-mute">{t('Shu oy AI sarfi (token)')}</div>
          <div className="text-[22px] font-semibold tabular-nums text-text">{son(z.oy_token)}</div>
          {z.oylik_token_limit != null && (<>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-surface-2" role="progressbar" aria-valuenow={limitFoiz} aria-valuemin={0} aria-valuemax={100} aria-label={t('Token limiti sarfi')}>
              <div className={`h-full ${limitFoiz >= 80 ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${limitFoiz}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-text-mute">{limitFoiz}% · {t('limit')}: {son(z.oylik_token_limit)}</div>
          </>)}
        </div>
      </div>

      <div className="karta space-y-2 p-3">
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" disabled={!tahrir} checked={yoq} onChange={(e) => setYoq(e.target.checked)} className="mt-0.5" />
          <span><b className="text-text">{t('Kompaniyada AI yoqilgan')}</b><br /><span className="text-[12px] text-text-mute">{t('O‘chirsangiz, hech bir foydalanuvchi uchun AI javob bermaydi va token sarflanmaydi.')}</span></span>
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" disabled={!tahrir} checked={kuzatuv} onChange={(e) => setKuzatuv(e.target.checked)} className="mt-0.5" />
          <span><b className="text-text">{t('A’zolar AI kuzatuvini yoqa olsin')}</b><br /><span className="text-[12px] text-text-mute">{t('Yoqilgan foydalanuvchiga qiyinchilikda ixtiyoriy taklif beriladi. Matn va kiritilgan qiymatlar o‘qilmaydi; har kim o‘zi yoqadi/o‘chiradi.')}</span></span>
        </label>
        <label className="block text-[12px] text-text-mute">{t('Oylik token limiti (bo‘sh = cheklovsiz)')}
          <input inputMode="numeric" disabled={!tahrir} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={t(LIMIT_NAMUNA)} className="input mt-1 h-8 w-40 px-2 text-[13px]" />
        </label>
        {tahrir
          ? <button type="button" className="tugma-asosiy h-8 px-3 text-[12px]" onClick={() => void saqla()}>{t('Saqlash')}</button>
          : <p className="text-[12px] text-text-mute">{t('Sozlamalarni admin, boss yoki direktor o‘zgartira oladi.')}</p>}
      </div>

      {h && h.agentlar.length > 0 && (
        <div className="karta overflow-x-auto p-3">
          <h3 className="mb-1 text-[13px] font-semibold text-text">{t('Agentlar bo‘yicha (shu oy)')}</h3>
          <table className="w-full text-[12px]"><tbody>
            {h.agentlar.map((a) => <tr key={a.profil} className="border-t border-border/60"><td className="py-1 text-text">{a.profil}</td><td className="tabular-nums">{a.chaqiruv}×</td><td className="text-right tabular-nums">{son(a.token)} {t('token')}</td></tr>)}
          </tbody></table>
        </div>
      )}
    </section>
  );
}
