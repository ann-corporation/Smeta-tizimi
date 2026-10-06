import { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { manbaHolati, muhitRoyxatiOl, type MuhitKorinishi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

/** Qoidalar (yadro — o'zgarmas; tizim — tasdiqlangan) va agentlar internetdan olishi mumkin bo'lgan tasdiqlangan manbalar. */
export function AiQoidalarBolimi() {
  const [d, setD] = useState<MuhitKorinishi | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const yukla = useCallback(async () => { const r = await muhitRoyxatiOl(); if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error); }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  const ochir = async (domen: string) => {
    if (!window.confirm(`${domen} — ${t('manbani o‘chirasizmi? Agentlar undan o‘qiy olmaydi.')}`)) return;
    const r = await manbaHolati(domen, false);
    if (r.ok) { toast(t('Manba o‘chirildi'), 'ok'); void yukla(); } else toast(r.error, 'danger');
  };

  if (xato) return <section role="alert" className="karta border-danger/40 p-4 text-danger">{xato}</section>;
  if (!d) return <p className="p-4 text-text-dim">{t('Yuklanmoqda…')}</p>;
  const yadro = d.qoidalar.filter((q) => q.doira === 'yadro');
  const tizim = d.qoidalar.filter((q) => q.doira === 'global');
  return (
    <div className="space-y-3">
      <section className="karta p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-[14px] font-semibold text-text"><Lock size={14} className="text-accent" />{t('Yadro qoidalar (o‘zgarmas)')}</h2>
        <p className="mb-2 text-[12px] text-text-mute">{t('Bu qoidalarni hech kim — na agent, na admin — o‘zgartira olmaydi: baza darajasida qulflangan. Boshqa barcha qoidalar ulardan keyin turadi.')}</p>
        <ol className="space-y-1.5 text-[13px]">{yadro.map((q) => <li key={q.kod} className="rounded-md border border-border/70 bg-surface-2/40 px-3 py-2"><span className="text-[11px] text-text-mute">{q.kod}</span><div className="text-text">{q.matn}</div></li>)}</ol>
      </section>
      <section className="karta p-4">
        <h2 className="mb-1 text-[14px] font-semibold text-text">{t('Tizim qoidalari (siz tasdiqlagan)')}</h2>
        {tizim.length === 0 ? <p className="text-[12px] text-text-mute">{t('Hali yo‘q. Agentlar taklif qilgan qoidalar «Takliflar va ishlar» bo‘limida tasdiqlanadi.')}</p>
          : <ul className="space-y-1.5 text-[13px]">{tizim.map((q) => <li key={q.kod} className="rounded-md border border-border/70 px-3 py-2"><span className="text-[11px] text-text-mute">{q.kod} · v{q.versiya}</span><div className="text-text">{q.matn}</div></li>)}</ul>}
      </section>
      <section className="karta p-4">
        <h2 className="mb-1 text-[14px] font-semibold text-text">{t('Tasdiqlangan internet manbalari')}</h2>
        <p className="mb-2 text-[12px] text-text-mute">{t('Agentlar faqat shu domenlardan o‘qiy oladi. Yangi manba faqat taklif orqali, sizning tasdig‘ingiz bilan qo‘shiladi.')}</p>
        {d.manbalar.length === 0 ? <p className="text-[12px] text-text-mute">{t('Hozircha internetdan o‘qish taqiqlangan (manba yo‘q).')}</p> : (
          <ul className="space-y-1">{d.manbalar.map((x) => (
            <li key={x.domen} className="flex items-center gap-2 text-[13px]"><span className="text-text">{x.nom}</span><span className="text-[11px] text-text-mute">{x.domen}</span>
              <button type="button" className="tugma ml-auto h-7 px-2 text-[12px] text-danger" onClick={() => void ochir(x.domen)}>{t('O‘chirish')}</button></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
