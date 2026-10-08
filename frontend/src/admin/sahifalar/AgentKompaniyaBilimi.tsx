/**
 * AgentKompaniyaBilimi.tsx — KOMPANIYA BILIMI: admin/boss/direktor o'z kompaniyasining qoidalari, tartiblari va atamalarini yozadi;
 * shu kompaniyadagi barcha AI ishchilar (lavozimidan qat'i nazar, o'z ma'lumot doirasida) javob berishda foydalanadi.
 * Boshqa kompaniyaga hech qachon ko'rinmaydi. Umumiy (platforma) bilim alohida va tizim agenti tomonidan yuritiladi.
 */
import { useCallback, useEffect, useState } from 'react';
import { bilimOl, bilimYoz, type BilimYozuvi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

export function AgentKompaniyaBilimi({ kompaniyaId, tahrir }: { kompaniyaId: number; tahrir: boolean }) {
  const [royxat, setRoyxat] = useState<BilimYozuvi[]>([]);
  const [s, setS] = useState(''); const [m, setM] = useState(''); const [k, setK] = useState('');
  const yukla = useCallback(async () => { const r = await bilimOl(kompaniyaId); if (r.ok) setRoyxat(r.natija.natija.filter((x) => x.doira === 'company')); }, [kompaniyaId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const saqla = async () => {
    const r = await bilimYoz(kompaniyaId, { sarlavha: s.trim(), matn: m.trim(), kalit: k });
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(r.natija.qabul ? t('Kompaniya bilimi saqlandi — AI ishchilar foydalanadi') : t('Bilim taklif sifatida saqlandi — admin tasdiqlaydi'), 'ok');
    setS(''); setM(''); setK(''); void yukla();
  };
  return (
    <section className="karta space-y-2 p-3" aria-label={t('Kompaniya bilimi')}>
      <h3 className="text-[13px] font-semibold text-text">{t('Kompaniya bilimi')}</h3>
      <p className="text-[12px] text-text-mute">{t('Kompaniyangizning qoidalari va atamalarini yozing — AI ishchilar javob berishda ularni hisobga oladi. Faqat shu kompaniyada ko‘rinadi.')}</p>
      {royxat.length === 0 && <p className="text-xs text-text-dim">{t('Hali yozuv yo‘q.')}</p>}
      <ul className="space-y-1">
        {royxat.map((b) => (
          <li key={b.id} className="rounded border border-border/60 px-2 py-1.5 text-xs">
            <div className="font-medium text-text">{b.sarlavha} <span className="text-text-mute">v{b.versiya}</span></div>
            <div className="text-text-dim">{b.matn}</div>
            <div className="text-text-mute">{b.kalit.join(', ')}</div>
          </li>
        ))}
      </ul>
      {tahrir ? (
        <div className="grid gap-2">
          <input aria-label={t('Sarlavha')} placeholder={t('Sarlavha')} value={s} onChange={(e) => setS(e.target.value)} className="input h-8 px-2 text-[12px]" />
          <textarea aria-label={t('Matn')} placeholder={t('Masalan: bizda ombordan chiqimni omborchi va prorab birga tasdiqlaydi')} rows={3} value={m} onChange={(e) => setM(e.target.value)} className="input px-2 py-1.5 text-[12px]" />
          <input aria-label={t('Kalit so‘zlar (vergul bilan)')} placeholder={t('Kalit so‘zlar (vergul bilan)')} value={k} onChange={(e) => setK(e.target.value)} className="input h-8 px-2 text-[12px]" />
          <button type="button" disabled={s.trim().length < 3 || m.trim().length < 20 || !k.trim()} onClick={() => void saqla()} className="tugma-asosiy h-8 w-fit px-3 text-[12px] disabled:opacity-40">{t('Bilimni saqlash')}</button>
        </div>
      ) : <p className="text-[12px] text-text-mute">{t('Kompaniya bilimini yozish uchun rahbar huquqi kerak.')}</p>}
    </section>
  );
}
