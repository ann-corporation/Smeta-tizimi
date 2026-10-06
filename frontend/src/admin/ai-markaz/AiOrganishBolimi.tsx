import { useCallback, useEffect, useState } from 'react';
import { rivojlanishTahlil, signallarOl, type SignalGuruhi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

/** O'rganish: foydalanuvchi fikri va agent signallari (tozalangan, kompaniyasiz) guruhlangan ko'rinishda; shundan taklif tayyorlanadi. */
export function AiOrganishBolimi({ taklifgaOt }: { taklifgaOt: () => void }) {
  const [g, setG] = useState<SignalGuruhi[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const yukla = useCallback(async () => { const r = await signallarOl(); if (r.ok) { setG(r.natija.natija); setXato(null); } else setXato(r.error); }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  const tahlil = async () => {
    setBand(true);
    try {
      const r = await rivojlanishTahlil();
      if (!r.ok) { toast(r.error, 'danger'); return; }
      toast(r.natija.xabar || `${t('Yangi takliflar')}: ${r.natija.takliflar.length}`, 'ok');
      void yukla(); if (r.natija.takliflar.length) taklifgaOt();
    } finally { setBand(false); }
  };

  if (xato) return <section role="alert" className="karta border-danger/40 p-4 text-danger">{xato}</section>;
  if (!g) return <p className="p-4 text-text-dim">{t('Yuklanmoqda…')}</p>;
  return (
    <div className="space-y-3">
      <section className="karta p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold text-text">{t('Tizim nimadan o‘rganyapti')}</h2>
            <p className="text-[12px] text-text-mute">{t('Quyida — oxirgi 30 kunda foydalanuvchilar va agentlardan kelgan muammo signallari. Kompaniya nomi, raqam, havola va shaxsiy ma’lumot tozalangan; qaysi kompaniyadan kelgani ko‘rinmaydi, faqat nechta kompaniyada takrorlangani.')}</p>
          </div>
          <button type="button" disabled={band || g.length === 0} onClick={() => void tahlil()} className="tugma-asosiy h-8 px-3 text-[12px] disabled:opacity-40">{band ? t('Tahlil qilinmoqda…') : t('Signallardan taklif tayyorlash')}</button>
        </div>
      </section>
      {g.length === 0 ? <p className="karta p-4 text-[13px] text-text-mute">{t('Yangi signal yo‘q — tizim hozircha o‘rganadigan muammo ko‘rmayapti.')}</p> : (
        <ul className="space-y-2">{g.map((x, i) => (
          <li key={i} className="karta p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{x.tur}</span>
              <span className="text-text-dim">{x.sahifa}</span>
              <span className="ml-auto tabular-nums text-text">{x.soni} {t('signal')} · {x.kompaniya_soni} {t('kompaniya')}</span>
            </div>
            <ul className="mt-1 list-disc pl-5 text-[12px] text-text-dim">{x.namunalar.map((n, j) => <li key={j}>{n}</li>)}</ul>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
