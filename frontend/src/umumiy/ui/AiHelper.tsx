import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Eye, EyeOff, Lightbulb, X } from 'lucide-react';
import { kasbOl, type KasbIshchi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { yolNaqshi } from '../../lib/agent-faoliyat';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';
import { AiChat, type TayyorSavol } from './AiChat';
import { ModelChip } from './ModelChip';
import { AiSelektsiya } from './AiSelektsiya';
import { AiFikrPanel } from './AiFikrPanel';
import { AiJurnal } from './AiJurnal';
import { AiShaxsiy } from './AiShaxsiy';
import { useAiKuzatuv } from './useAiKuzatuv';

type Tab = 'chat' | 'jurnal' | 'fikr' | 'sozlama';
const TABLAR: Array<[Tab, string]> = [['chat', 'Suhbat'], ['jurnal', 'Jurnal'], ['fikr', 'Fikr / muammo'], ['sozlama', 'Sozlamalar']];
const TAB_USLUB = 'flex-1 px-2 py-2 text-xs font-medium transition-colors';
const ADMIN_ROLLAR = ['boss', 'admin', 'director', 'superadmin'];

/**
 * Global AI yordamchi: foydalanuvchining LAVOZIMIGA mos kasb ishchisi (PTO, bugalter, prorab, usta, skladchi, direktor …).
 * U faqat shu lavozimga ruxsat etilgan ma'lumotni ko'radi; har qadam jonli ko'rinadi; jiddiy qarorlarni foydalanuvchining o'zi tasdiqlaydi.
 */
export function AiHelper() {
  const location = useLocation();
  const navigate = useNavigate();
  const { joriyId } = useKompaniya();
  const companyRef = useRef({ id: joriyId, generation: 0 });
  if (companyRef.current.id !== joriyId) companyRef.current = { id: joriyId, generation: companyRef.current.generation + 1 };
  const [tab, setTab] = useState<Tab>('chat');
  const [isOpen, setIsOpen] = useState(false);
  const [kasb, setKasb] = useState<KasbIshchi | null>(null);
  const kuzatuv = useAiKuzatuv(joriyId ?? undefined);

  const [tayyor, setTayyor] = useState<TayyorSavol | null>(null);
  /* Istalgan sahifa/komponent `window.dispatchEvent(new CustomEvent('ai:ochish', { detail: { savol } }))` bilan AI ni tayyor savol bilan ochadi. */
  useEffect(() => {
    const eshit = (e: Event) => {
      const savol = String((e as CustomEvent<{ savol?: string }>).detail?.savol ?? '').trim().slice(0, 600);
      setIsOpen(true); setTab('chat');
      if (savol) setTayyor({ id: Date.now(), matn: savol });
    };
    window.addEventListener('ai:ochish', eshit);
    return () => window.removeEventListener('ai:ochish', eshit);
  }, []);

  useEffect(() => {
    let tirik = true;
    setKasb(null);
    if (joriyId && isOpen) void kasbOl(joriyId).then((r) => { if (tirik && r.ok) setKasb(r.natija); });
    return () => { tirik = false; };
  }, [joriyId, isOpen]);

  if (location.pathname.startsWith('/boss')) return null;

  /* Proaktiv taklif kartasi: ixtiyoriy — qabul qilish yoki rad etish; hech narsani o'zi bajarmaydi. */
  const taklifKarta = kuzatuv.taklif ? (
    <div role="status" className="rounded-xl border border-accent/40 bg-surface-2 p-3 text-sm shadow-lg">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent"><Lightbulb size={14} /> {t('AI taklifi (ixtiyoriy)')}</div>
      <p className="text-text">{kuzatuv.taklif.taklif}</p>
      <div className="mt-2 flex gap-2">
        {kuzatuv.taklif.yol && (
          <button type="button" className="rounded-md bg-accent px-2.5 py-1 text-xs text-white"
            onClick={() => { const y = kuzatuv.taklif?.yol; kuzatuv.qabul(); if (y) navigate(y); }}>{t('Ko‘rish')}</button>
        )}
        <button type="button" className="rounded-md border border-border px-2.5 py-1 text-xs text-text-dim hover:bg-white/5" onClick={kuzatuv.rad}>{t('Hozir kerak emas')}</button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {location.pathname.startsWith('/admin') && <AiSelektsiya />}
      {!isOpen && taklifKarta && <div className="fixed bottom-24 right-6 z-40 w-72">{taklifKarta}</div>}
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} aria-label={t('Jarvis AI yordamchisini ochish')}
          className="group fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl transition-transform hover:scale-105 hover:bg-accent/90">
          <Bot size={26} />
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bg bg-ok"></span>
          <div className="pointer-events-none absolute right-full mr-4 whitespace-nowrap rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">{t('Jarvis AI yordamchisi')}</div>
        </button>
      )}

      {isOpen && (
        <div role="dialog" aria-modal="false" aria-label={t('Jarvis AI yordamchisi')} className="fixed bottom-6 right-6 z-50 flex h-[640px] max-h-[85vh] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent"><Bot size={20} /></div>
              <div>
                <h3 className="text-sm font-semibold text-white">{kasb?.nom ?? 'Jarvis AI'}</h3>
                <p className="flex items-center gap-1 text-xs text-text-dim"><span className="h-1.5 w-1.5 rounded-full bg-ok"></span> {t('Sizning lavozimingizga mos AI ishchi')}</p>
              </div>
            </div>
            <div className="flex items-center">
              <button type="button" onClick={() => kuzatuv.almashtir(!kuzatuv.yoqilgan)} aria-pressed={kuzatuv.yoqilgan} aria-label={t('AI kuzatuvi')}
                title={kuzatuv.yoqilgan ? t('AI kuzatuvi yoqilgan: qiyinchilikda taklif beradi (matn o‘qilmaydi)') : t('AI kuzatuvi o‘chiq')}
                className={`mr-1 rounded p-1 transition-colors hover:bg-white/5 ${kuzatuv.yoqilgan ? 'text-accent' : 'text-text-dim'}`}>
                {kuzatuv.yoqilgan ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
              <button onClick={() => setIsOpen(false)} aria-label={t('Yopish')} title={t('Yopish')} className="rounded p-1 text-text-dim transition-colors hover:bg-white/5 hover:text-white"><X size={20} /></button>
            </div>
          </div>

          <div className="flex shrink-0 border-b border-border bg-surface" role="tablist">
            {TABLAR.map(([id, nom]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`${TAB_USLUB} ${tab === id ? 'border-b-2 border-accent text-white' : 'text-text-dim'}`}>{t(nom)}</button>
            ))}
          </div>
          {taklifKarta && <div className="shrink-0 p-3">{taklifKarta}</div>}

          {tab === 'chat' && kasb && <ModelChip profil={kasb.profil} kompaniyaId={joriyId ?? null} />}
          {tab === 'chat' && <AiChat kompaniyaId={joriyId ?? null} kasb={kasb} sahifa={yolNaqshi(location.pathname)} generatsiya={companyRef.current.generation} tayyorSavol={tayyor} onOqildi={() => setTayyor(null)} />}
          {tab === 'jurnal' && (joriyId ? <AiJurnal kompaniyaId={joriyId} admin={ADMIN_ROLLAR.includes(kasb?.rol ?? '')} /> : <p className="p-4 text-sm text-text-dim">{t('Avval kompaniyani tanlang')}</p>)}
          {tab === 'fikr' && <AiFikrPanel kompaniyaId={joriyId ?? undefined} sahifa={yolNaqshi(location.pathname)} />}
          {tab === 'sozlama' && <AiShaxsiy kasb={kasb} kuzatuvYoqilgan={kuzatuv.yoqilgan} kuzatuvAlmashtir={kuzatuv.almashtir} />}
        </div>
      )}
    </>
  );
}
