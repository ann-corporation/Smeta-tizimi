/**
 * Sahifa AI yordamchisi paneli (egasi 2026-10-25: «fakt va F2 tayyorlash oynalarida AI xuddi Smeta Studio'dagi agent kuchida
 * ishlasin»). Smeta Studio agenti bilan BIR xil qismlar (AgentQismlar) va bir xil server qatlami (/api/smeta-ai, kompaniya
 * AI byudjeti va hisobi): model vositalar bilan real ma'lumotni o'qiydi, amallarni faqat TAKLIF qiladi; har yozuv —
 * foydalanuvchi «Bajarish» ni bosgandan keyin mavjud yozish yo'li orqali (kiritma + Saqlash, mavjud oynalar).
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { t } from '../../../i18n/til';
import { ModelChip } from '../ModelChip';
import { AgentAmallar, AgentQadamlar, AgentXabarlar, type AgentQadam } from './AgentQismlar';
import { agentSikli, type SahifaVositalar } from '../../../lib/ai-yordamchi/sikl';
import type { SahifaAmal, SahifaXabar } from '../../../lib/ai-yordamchi/protokol';

const XATO: Record<string, string> = {
  AI_NOT_CONFIGURED: 'AI hali sozlanmagan (Cloudflare’da AI kaliti yo‘q).',
  BYUDJET_YOQ: 'AI uchun oylik limit belgilanmagan — Boshqaruv → AI markazi → Xarajat bo‘limida limit qo‘ying.',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi.', TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring.',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya admini AI ni o‘chirgan.', FORBIDDEN: 'Bu kompaniyaga ruxsat yo‘q.', AUTH_REQUIRED: 'Sessiya tugagan — qayta kiring.',
};
const xatoMatn = (code: string, message?: string) => t(XATO[code] ?? message ?? 'AI hozir javob bermadi. Keyinroq qayta urinib ko‘ring.');

type Taklif = SahifaAmal & { ogoh: string | null; tanlangan: boolean };

export function AiYordamchiPanel({ kompaniyaId, vositalar, saqlashKalit, sarlavha, namunalar }: {
  kompaniyaId: number; vositalar: SahifaVositalar;
  /** Suhbat shu kalit bilan (masalan obyekt bo'yicha) brauzerda saqlanadi — faqat qulaylik. */
  saqlashKalit: string; sarlavha: string; namunalar: readonly string[];
}) {
  const [ochiq, setOchiq] = useState(false);
  const kalit = `ai-yordamchi:${saqlashKalit}`;
  const [xabarlar, setXabarlar] = useState<SahifaXabar[]>(() => { try { const v = JSON.parse(localStorage.getItem(kalit) ?? '[]'); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(kalit, JSON.stringify(xabarlar.slice(-30))); } catch { /* storage off */ } }, [xabarlar, kalit]);
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const [holat, setHolat] = useState('');
  const [qadamlar, setQadamlar] = useState<AgentQadam[]>([]);
  const [takliflar, setTakliflar] = useState<Taklif[]>([]);
  const tirik = useRef(true);
  const vRef = useRef(vositalar); vRef.current = vositalar;
  const oxir = useRef<HTMLDivElement>(null);
  useEffect(() => { tirik.current = true; return () => { tirik.current = false; }; }, []);
  useEffect(() => { oxir.current?.scrollIntoView?.({ block: 'nearest' }); }, [xabarlar.length, band]);
  const qadam = (q: AgentQadam) => setQadamlar(l => [...l.map(x => (x.holat === 'ishda' ? { ...x, holat: 'ok' as const } : x)), q].slice(-40));

  async function yubor(txt?: string) {
    const m = (txt ?? matn).trim();
    if (!m || band) return;
    const yangi = [...xabarlar, { rol: 'user' as const, matn: m }];
    setXabarlar(yangi); setMatn(''); setHolat(''); setBand(true); setQadamlar([]); setTakliflar([]);
    qadam({ matn: t('Savolingizni o‘qiyapman va sahifa ma’lumotini tekshiraman'), holat: 'ishda' });
    try {
      const r = await agentSikli({ kompaniyaId, xabarlar: yangi, vositalar: { ...vRef.current, kontekst: () => vRef.current.kontekst(), oqi: s => vRef.current.oqi(s) }, qadam, tirikmi: () => tirik.current });
      if (!tirik.current) return;
      if (!r.ok) { qadam({ matn: xatoMatn(r.code, r.message), holat: 'xato' }); setHolat(xatoMatn(r.code, r.message)); return; }
      qadam({ matn: t('Tayyor: {a} ta amal taklifi', { a: r.amallar.length }), holat: 'ok' });
      setXabarlar(x => [...x, { rol: 'assistant', matn: [r.javob, ...r.savollar.map(s => '• ' + s)].filter(Boolean).join('\n') || t('Tushunarli.') }]);
      setTakliflar(r.amallar.map(a => ({ ...a, tanlangan: !a.ogoh })));
      if (r.ogohlantirish) setHolat(r.ogohlantirish);
    } finally { if (tirik.current) setBand(false); }
  }

  async function bajar() {
    const tanlangan = takliflar.filter(a => a.tanlangan && !a.ogoh);
    if (!tanlangan.length) return;
    setBand(true);
    try {
      const natija = await vRef.current.bajar(tanlangan.map(({ tanlangan: _t, ogoh: _o, ...a }) => a));
      if (!tirik.current) return;
      setTakliflar([]);
      if (natija.length) setXabarlar(x => [...x, { rol: 'assistant', matn: natija.join('\n') }]);
    } finally { if (tirik.current) setBand(false); }
  }

  if (!ochiq) return <button type="button" onClick={() => setOchiq(true)} aria-label={t('AI yordamchini ochish')} title={t('AI yordamchi: qidiradi, tushuntiradi, taklif qiladi — yozuv faqat sizning tasdig‘ingiz bilan')}
    className="fixed bottom-24 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[13px] font-semibold text-[var(--on-accent)] shadow-xl hover:brightness-110" data-testid="ai-yordamchi-ochish">
    <Sparkles size={16} /> {t('AI yordamchi')}</button>;

  return <aside role="dialog" aria-modal="false" aria-label={sarlavha} className="fixed bottom-4 right-4 z-50 flex max-h-[85vh] w-[28rem] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-surface p-3 text-sm shadow-2xl" data-testid="ai-yordamchi-panel">
    <div className="flex items-center gap-2">
      <Sparkles size={16} className="text-accent" />
      <h3 className="flex-1 text-[13px] font-semibold text-text">{sarlavha}</h3>
      {xabarlar.length > 0 && <button type="button" className="text-[11px] text-text-mute underline" onClick={() => { setXabarlar([]); setTakliflar([]); setQadamlar([]); }}>{t('Yangi suhbat')}</button>}
      <button type="button" onClick={() => setOchiq(false)} aria-label={t('Yopish')} className="rounded p-1 text-text-dim hover:bg-surface-3 hover:text-text"><X size={16} /></button>
    </div>
    <ModelChip profil="smeta_ai" kompaniyaId={kompaniyaId} />
    <div className="karta min-h-[140px] flex-1 space-y-2 overflow-auto p-2" role="log" aria-live="polite">
      {!xabarlar.length && <div className="space-y-1.5 text-[12.5px] text-text-dim">
        <p className="font-medium text-text">{t('Savol bering yoki vazifa yozing — AI sahifadagi real ma’lumotni o‘qib, tushuntiradi va amal taklif qiladi. Yozuv faqat siz «Bajarish» va «Saqlash» ni bosganingizda.')}</p>
        <div className="flex flex-wrap gap-1.5">{namunalar.map(x => <button key={x} type="button" onClick={() => void yubor(x)} className="rounded-full border border-accent/40 px-2.5 py-1 text-[11.5px] text-accent hover:bg-accent/10">{x}</button>)}</div>
      </div>}
      <AgentXabarlar xabarlar={xabarlar} />
      <AgentQadamlar qadamlar={qadamlar} band={band} sarlavha={(n, ishda) => ishda ? t('Yordamchi ishlayapti — {n} qadam', { n }) : t('Yordamchi nima qildi ({n} qadam)', { n })} />
      <div ref={oxir} />
    </div>
    {holat && <p role="status" className="text-xs text-warn">{holat}</p>}
    <AgentAmallar band={band} onBajar={() => void bajar()} onBekor={() => setTakliflar([])}
      onTanla={(i, v) => setTakliflar(l => l.map((x, j) => (j === i && !x.ogoh ? { ...x, tanlangan: v } : x)))}
      amallar={takliflar.map(a => ({ nom: vositalar.nomi(a), izoh: a.izoh, ogoh: a.ogoh, tanlangan: a.tanlangan }))} />
    <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void yubor(); }}>
      <textarea aria-label={t('AI yordamchiga xabar')} className="input min-h-[64px] w-full min-w-0 flex-1 resize-y py-2 text-[13px]" rows={2} value={matn} disabled={band}
        placeholder={t('Masalan: beton ishlarini top, fakt nega kam?')} onChange={e => setMatn(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void yubor(); } }} />
      <button type="submit" className="tugma tugma-asosiy h-9 px-3" disabled={band || !matn.trim()}>{t('Yuborish')}</button>
    </form>
    <p className="text-center text-[10px] text-text-mute">{t('AI faqat taklif qiladi: fakt, zamena, narx va F2 faqat sizning tasdig‘ingiz bilan yoziladi; asl smeta o‘zgarmaydi.')}</p>
  </aside>;
}
