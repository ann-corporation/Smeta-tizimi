import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, X, Send, User, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { t2AiJarvisSavol } from '../../api/t2-ai';
import { jarvisSalomJavobi, jarvisSalommi } from '../../lib/jarvis/intent';
import ReactMarkdown from 'react-markdown';
import { t } from '../../i18n/til';
import { AiFikrPanel } from './AiFikrPanel';
import { useAiKuzatuv } from './useAiKuzatuv';
import { yolNaqshi } from '../../lib/agent-faoliyat';

const TAB_USLUB = 'flex-1 px-3 py-2 text-xs font-medium transition-colors';

function saqlanganKompaniya(): number | undefined {
  try {
    const n = Number(window.localStorage.getItem('t2_kompaniya_id'));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  } catch { return undefined; }
}

type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  source?: string;
};

export function AiHelper() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'savol' | 'fikr'>('savol');
  const kuzatuv = useAiKuzatuv(saqlanganKompaniya());
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      text: t('Salom! Men **Jarvis** — shu tizimning yordamchisiman.\n\nJoriy kompaniyadagi dalilli ma’lumot bilan javob beraman. Masalan:\n\n- Amfiteatrda bu oy qancha fakt bajarildi?\n- Qaysi obyektda F2 orqada qolgan?\n- Suniy ko‘lda qoldiq qancha?'),
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userText = input.trim();
    setInput('');
    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: userText }]);
    setIsLoading(true);

    if (jarvisSalommi(userText)) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: jarvisSalomJavobi() }]);
      setIsLoading(false);
      return;
    }

    try {
      const saqlangan = Number(window.localStorage.getItem('t2_kompaniya_id'));
      const kompaniyaId = Number.isInteger(saqlangan) && saqlangan > 0 ? saqlangan : undefined;
      const res = await t2AiJarvisSavol(kompaniyaId, userText);
      const aiText = res.ok ? (res.javob || t('Jarvis javob bo‘sh qaytardi')) : (res.xabar || t('Jarvis javob bera olmadi'));

      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'ai', 
        text: aiText,
        source: res.dalil ? `${res.dalil.rpc} · kompaniya #${res.dalil.id}` : undefined,
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'ai', 
        text: `${t('Xatolik yuz berdi:')} ${err.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

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
      {/* Floating Button */}
      {!isOpen && taklifKarta && <div className="fixed bottom-24 right-6 z-40 w-72">{taklifKarta}</div>}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label={t('Jarvis AI yordamchisini ochish')}
          className="fixed bottom-6 right-6 w-14 h-14 bg-accent hover:bg-accent/90 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 z-40 group"
        >
          <Bot size={26} />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-ok rounded-full border-2 border-bg"></span>
          
          {/* Tooltip */}
          <div className="absolute right-full mr-4 bg-surface-2 border border-border text-white text-sm px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
            {t('Jarvis AI yordamchisi')}
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div role="dialog" aria-modal="false" aria-label={t('Jarvis AI yordamchisi')} className="fixed bottom-6 right-6 w-96 h-[600px] max-h-[80vh] bg-surface border border-border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden transform transition-all">
          {/* Header */}
          <div className="bg-surface-2 px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Jarvis AI</h3>
                <p className="text-xs text-text-dim flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-ok"></span> {t('Faqat o‘qish rejimi · beta')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => kuzatuv.almashtir(!kuzatuv.yoqilgan)}
              aria-pressed={kuzatuv.yoqilgan}
              aria-label={t('AI kuzatuvi')}
              title={kuzatuv.yoqilgan ? t('AI kuzatuvi yoqilgan: qiyinchilikda taklif beradi (matn o‘qilmaydi)') : t('AI kuzatuvi o‘chiq')}
              className={`mr-1 rounded p-1 transition-colors hover:bg-white/5 ${kuzatuv.yoqilgan ? 'text-accent' : 'text-text-dim'}`}
            >
              {kuzatuv.yoqilgan ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              aria-label={t('Yopish')}
              title={t('Yopish')}
              className="text-text-dim hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex border-b border-border bg-surface" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'savol'} className={`${TAB_USLUB} ${tab === 'savol' ? 'border-b-2 border-accent text-white' : 'text-text-dim'}`} onClick={() => setTab('savol')}>{t('Savol')}</button>
            <button type="button" role="tab" aria-selected={tab === 'fikr'} className={`${TAB_USLUB} ${tab === 'fikr' ? 'border-b-2 border-accent text-white' : 'text-text-dim'}`} onClick={() => setTab('fikr')}>{t('Fikr / muammo')}</button>
          </div>
          {taklifKarta && <div className="p-3">{taklifKarta}</div>}
          {tab === 'fikr' && <AiFikrPanel kompaniyaId={saqlanganKompaniya()} sahifa={yolNaqshi(location.pathname)} />}
          {tab === 'savol' && (<>
          {/* Jarvis beta only receives the selected Tizim_02 company ID.
              This is intentionally not an object dropdown: an object ID without
              a server-side tenant check could expose another company's data. */}
          <div className="px-4 py-2 border-b border-border bg-surface flex items-center gap-2 relative">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 rounded-md border border-accent/20">
               <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
               <span className="text-[10px] uppercase font-bold text-accent tracking-wider">{t('Jarvis beta · kompaniya konteksti')}</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(m => (
              <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.role === 'user' ? 'bg-surface-2 text-text-dim' : 'bg-accent/20 text-accent'
                }`}>
                  {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === 'user' 
                    ? 'bg-accent text-white rounded-tr-none' 
                    : 'bg-surface-2 text-text border border-border rounded-tl-none'
                }`}>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>
                  {m.source && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-text-mute flex items-center justify-between">
                      <span>{t('Manba:')} {m.source}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 flex-row">
                <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center flex-shrink-0">
                  <Bot size={16} />
                </div>
                <div className="bg-surface-2 text-text border border-border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-text-dim animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-text-dim animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-text-dim animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-surface-2 border-t border-border">
            <div className="relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={t('Xabaringizni yozing...')}
                className="w-full bg-surface border border-border text-white text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-accent resize-none min-h-[44px] max-h-32"
                rows={1}
              />
              <button
                onClick={handleSend}
                aria-label={t('Yuborish')}
                title={t('Yuborish')}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 bottom-2 w-8 h-8 bg-accent text-white rounded-lg flex items-center justify-center hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="text-center mt-2">
              <span className="text-[10px] text-text-mute">
                {t('AI xato qilishi mumkin. Moliya qarorlarida e’tiborli bo‘ling.')}
              </span>
            </div>
          </div>
          </>)}
        </div>
      )}
    </>
  );
}
