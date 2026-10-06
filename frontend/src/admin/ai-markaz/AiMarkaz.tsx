/**
 * AiMarkaz.tsx — Boshqaruv paneli → «AI markazi» (FAQAT platforma superadmini). Tizim agentlari, modellar, takliflar, qoidalar,
 * o'rganish va xarajat/limit shu yerda. Oddiy foydalanuvchi va kompaniya admini bu bo'limni ko'rmaydi (server ham tekshiradi).
 */
import { useCallback, useEffect, useState } from 'react';
import { Bot, Coins, GraduationCap, Inbox, LayoutDashboard, ScrollText } from 'lucide-react';
import { markazOl, type Markaz } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { AgentTakliflar } from '../sahifalar/AgentTakliflar';
import { AiAgentlarBolimi } from './AiAgentlarBolimi';
import { AiKorinish } from './AiKorinish';
import { AiOrganishBolimi } from './AiOrganishBolimi';
import { AiQoidalarBolimi } from './AiQoidalarBolimi';
import { AiXarajatBolimi } from './AiXarajatBolimi';

type Bolim = 'korinish' | 'agentlar' | 'takliflar' | 'qoidalar' | 'organish' | 'xarajat';
const BOLIMLAR: Array<{ id: Bolim; nom: string; Ikonka: typeof Bot }> = [
  { id: 'korinish', nom: 'Umumiy ko‘rinish', Ikonka: LayoutDashboard },
  { id: 'agentlar', nom: 'Agentlar va modellar', Ikonka: Bot },
  { id: 'takliflar', nom: 'Takliflar va ishlar', Ikonka: Inbox },
  { id: 'organish', nom: 'O‘rganish', Ikonka: GraduationCap },
  { id: 'qoidalar', nom: 'Qoidalar va manbalar', Ikonka: ScrollText },
  { id: 'xarajat', nom: 'Xarajat va limit', Ikonka: Coins },
];

export function AiMarkaz({ kompaniyalar }: { kompaniyalar: Array<{ id: number; nom: string }> }) {
  const [bolim, setBolim] = useState<Bolim>('korinish');
  const [m, setM] = useState<Markaz | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const yukla = useCallback(async () => { const r = await markazOl(); if (r.ok) { setM(r.natija); setXato(null); } else setXato(r.error); }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  if (xato) return <section role="alert" className="karta border-danger/40 p-4 text-danger">{xato}</section>;
  if (!m) return <p className="p-4 text-text-dim">{t('Yuklanmoqda…')}</p>;
  const nishon: Partial<Record<Bolim, number>> = { takliflar: m.sonlar.taklif_kutilmoqda, organish: m.sonlar.signal_yangi };
  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-1" aria-label={t('AI markazi bo‘limlari')}>
        {BOLIMLAR.map(({ id, nom, Ikonka }) => (
          <button key={id} type="button" aria-pressed={bolim === id} onClick={() => setBolim(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] ${bolim === id ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-dim hover:text-text'}`}>
            <Ikonka size={14} />{t(nom)}
            {(nishon[id] ?? 0) > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] text-white" aria-label={`${nishon[id]}`}>{nishon[id]}</span>}
          </button>
        ))}
      </nav>
      {bolim === 'korinish' && <AiKorinish m={m} bolimOch={(b) => setBolim(b as Bolim)} />}
      {bolim === 'agentlar' && <AiAgentlarBolimi markaz={m} />}
      {bolim === 'takliflar' && (
        <div className="space-y-2">
          <p className="text-[12px] text-text-mute">{t('Agentlar taklif qiladi — hech narsa sizning tasdig‘ingizsiz o‘zgarmaydi. Tasdiqlangan rivojlanish taklifi ish buyrug‘iga aylanadi va ijrochiga yuboriladi.')}</p>
          <AgentTakliflar kompaniyaId={null} tizim />
        </div>
      )}
      {bolim === 'organish' && <AiOrganishBolimi taklifgaOt={() => { setBolim('takliflar'); void yukla(); }} />}
      {bolim === 'qoidalar' && <AiQoidalarBolimi />}
      {bolim === 'xarajat' && <AiXarajatBolimi m={m} kompaniyalar={kompaniyalar} yangila={() => void yukla()} />}
    </div>
  );
}
