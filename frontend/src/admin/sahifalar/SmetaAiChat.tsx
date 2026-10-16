/**
 * Smetachi AI — chat worker inside the studio. The user describes the work in plain words (or by voice):
 * "fundament qilindi: podbetonka, armatura to'qildi, beton quyildi". The model decomposes it into normative
 * works and asks for the missing dimensions; the browser grounds every work in the real normative catalogue
 * (the model only chooses among found candidates), the CODE computes quantities from the formula, and the
 * user adds the ready works to the estimate in one undoable step.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { smetaXulosasi } from '../../lib/smeta-studio/ai-kontekst';
import { calcDoc } from '../../lib/smeta-studio/calc';
import { loyihaBoyicha, talabMateriali } from '../../lib/smeta-studio/loyiha-material';
import type { AgentAmal } from '../../lib/smeta-ai/protokol';
import { AMAL_BOSQICH, agentChaqir, amalBuyruqlari, materialManbadami } from './studioAgent';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { docxMatni } from '../../lib/narx-dalil/docx-matn';

type Ilova = { nom: string; mimeType?: string; data?: string; matn?: string };
/** Project document for the chat: image/PDF as base64 (the model reads it), Excel/Word as text. */
async function ilovaTayyorla(f: File): Promise<Ilova> {
  const nom = f.name.toLowerCase();
  if (f.size > 7 * 1024 * 1024) throw new Error('FAYL_KATTA');
  if (/\.(xlsx|xls|xlsm)$/.test(nom)) {
    const wb = await readXlsxFonda(await f.arrayBuffer());
    const matn = wb.sheets.map(s => `# ${s.name}\n` + s.rows.slice(0, 600).map(r => r.map(c => (c == null ? '' : String(c).trim())).filter(Boolean).join(' | ')).filter(Boolean).join('\n')).join('\n\n');
    return { nom: f.name, matn: matn.slice(0, 110_000) };
  }
  if (nom.endsWith('.docx')) return { nom: f.name, matn: docxMatni(new Uint8Array(await f.arrayBuffer())).slice(0, 110_000) };
  const mimeType = nom.endsWith('.pdf') ? 'application/pdf' : nom.endsWith('.png') ? 'image/png' : nom.endsWith('.webp') ? 'image/webp' : /\.(jpe?g)$/.test(nom) ? 'image/jpeg' : '';
  if (!mimeType) throw new Error('FAYL_TURI');
  const b = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return { nom: f.name, mimeType, data: btoa(s) };
}
import { manbaMaterialiniTekshir, suhbatJavobiniTekshir, type SuhbatXabari, type TanlovNomzodi } from '../../lib/smeta-ai/protokol';
import { birlashtir, katalogSahifasi, nomzodlarTop, smetagaQoshish, tanlovSorovi, tanlovDalili, tanlovZidmi, type AiIsh, type AiKatalog } from '../../lib/smeta-ai/worker';
import { ifodaHisobla } from '../../lib/smeta-ai/ifoda';
import { foundationReference } from '../../lib/smeta-ai/normative-reference';
import { includedWorkReviews } from '../../lib/smeta-ai/included-work';
import { smetachiSuhbat, smetachiTanla } from '../../api/smeta-ai';
import { ModelChip } from '../../umumiy/ui/ModelChip';

const XATO: Record<string, string> = {
  AI_NOT_CONFIGURED: 'AI hali sozlanmagan (Cloudflare’da AI kaliti yo‘q).',
  BYUDJET_YOQ: 'AI uchun oylik limit belgilanmagan — Boshqaruv → AI markazi → Xarajat bo‘limida limit qo‘ying.',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi.', TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring.',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya admini AI ni o‘chirgan.', FORBIDDEN: 'Bu kompaniyaga ruxsat yo‘q.', AUTH_REQUIRED: 'Sessiya tugagan — qayta kiring.',
};
const xato = (code: string, message?: string) => t(XATO[code] ?? message ?? 'AI hozir javob bermadi. Keyinroq qayta urinib ko‘ring.');
const HOLAT_RANG: Record<AiIsh['holat'], string> = { TAYYOR: 'text-ok', HAJM_KERAK: 'text-warn', ANIQLASH_KERAK: 'text-warn' };
const saqlashKalit = (draftId: string) => `smeta-ai:${draftId}`;

type SpeechRec = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start(): void; stop(): void };
const SpeechCtor = (): (new () => SpeechRec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const AMAL_NOMI: Record<AgentAmal['tur'], string> = { material: 'Loyiha materiali', hajm: 'Hajm', ochir: 'Ishni o‘chirish', kochir: 'Bo‘limga ko‘chirish',
  bolim: 'Yangi bo‘lim', bolim_tartib: 'Bo‘lim tartibi', koef_tanla: 'Koeffitsient tanlash', hudud: 'Obyekt hududi', narxla: 'Barcha narxlarni topish',
  narx: 'Narx qo‘yish', stavka_tasdiq: 'Stavkalarni tasdiqlash', bosqich: 'Bosqichga o‘tish', hujjat: 'Hujjat yuklash' };

export function SmetaAiChat(props: Parameters<typeof SmetaAiChatCore>[0]) {
  return <SmetaAiChatCore key={`${props.kompaniyaId}:${props.doc.draftId}`} {...props} />;
}

function SmetaAiChatCore({ doc, katalog, kompaniyaId, command, newId, onBosqich }: {
  doc: EstimateDoc; katalog: AiKatalog | null; kompaniyaId: number | null; command: (c: StudioCommand) => boolean; newId: () => string;
  /** Opens a studio step (pricing / documents) so the agent can run that step's action. */
  onBosqich?: (b: 'lrv' | 'narx' | 'res') => void;
}) {
  // Studio agent: actions the model proposed for this turn; the user runs them (one undo step for document edits).
  const [ilova, setIlova] = useState<Ilova | null>(null);
  const [amallar, setAmallar] = useState<Array<AgentAmal & { tanlangan: boolean; ogoh: string | null }>>([]);
  const kalit = saqlashKalit(`${kompaniyaId}:${doc.draftId}`);
  const [saqlangan] = useState(() => {
    try { return JSON.parse(localStorage.getItem(kalit) ?? 'null') as { xabarlar?: SuhbatXabari[]; ishlar?: AiIsh[] } | null; }
    catch { return null; }
  });
  const [xabarlar, setXabarlar] = useState<SuhbatXabari[]>(Array.isArray(saqlangan?.xabarlar) ? saqlangan.xabarlar : []);
  const [ishlar, setIshlar] = useState<AiIsh[]>(() => {
    if (!Array.isArray(saqlangan?.ishlar)) return [];
    const source = (saqlangan?.xabarlar ?? []).filter(x => x.rol === 'user').map(x => x.matn).join('\n');
    const validated = manbaMaterialiniTekshir(suhbatJavobiniTekshir({ ishlar: saqlangan.ishlar }), source);
    return birlashtir(saqlangan.ishlar, validated.ishlar);
  });
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState<'' | 'suhbat' | 'tanlash' | 'qoshish' | 'amal'>('');
  const [holat, setHolat] = useState('');
  const [tinglash, setTinglash] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const oxir = useRef<HTMLDivElement>(null);
  const tirik = useRef(true);
  useEffect(() => { tirik.current = true; return () => { tirik.current = false; rec.current?.stop(); }; }, []);

  // Per-draft conversation memory (convenience only; the estimate itself lives in the studio draft).
  useEffect(() => { try { localStorage.setItem(kalit, JSON.stringify({ xabarlar: xabarlar.slice(-30), ishlar })); } catch { /* storage off */ } }, [xabarlar, ishlar, kalit]);
  useEffect(() => { oxir.current?.scrollIntoView?.({ block: 'nearest' }); }, [xabarlar.length, band]);

  /** Ground intents in the catalogue: candidates by search, then the cheap model picks among them. */
  async function asosla(list: AiIsh[]): Promise<AiIsh[]> {
    if (!katalog || kompaniyaId == null) return list;
    let next = list.map(i => (i.nomzodlar.length ? i : { ...i, nomzodlar: nomzodlarTop(katalog, i) }));
    next = next.map(i => i.tanlangan && !i.tanlangan.qolda && tanlovZidmi(i, { ...i.tanlangan, id: i.tanlangan.workId }, next) ? { ...i, tanlangan: null } : i);
    if (tirik.current) setIshlar(next);
    // Up to two rounds: when no candidate fits, the model rephrases in normative wording and the catalogue is searched again.
    let qaytaIds: Set<string> | null = null;
    for (let round = 0; round < 2; round++) {
      const sor = next.filter(i => i.holat !== 'ANIQLASH_KERAK' && !i.tanlangan && (i.nomzodlar.length || round === 0) && (!qaytaIds || qaytaIds.has(i.id))).map(i => tanlovSorovi(i, next));
      if (!sor.length) break;
      setBand('tanlash');
      const r = await smetachiTanla(kompaniyaId, sor.slice(0, 40));
      if (!tirik.current) return list;
      if (!r.ok) { setHolat(xato(r.code, r.message)); break; }
      const by = new Map(r.tanlovlar.map(x => [x.id, x]));
      const qayta = new Set<string>();
      next = next.map(i => {
        const c = by.get(i.id), n = c?.ishId ? i.nomzodlar.find(x => x.id === c.ishId) : null;
        if (n && !tanlovZidmi(i, n, next)) return { ...i, tanlangan: { workId: n.id, kod: n.kod, nom: n.nom, birlik: n.birlik, sabab: c!.sabab } };
        if (round === 0 && c?.qidiruv?.length) {
          const extra = nomzodlarTop(katalog, { ...i, qidiruv: c.qidiruv });
          const fresh = extra.filter(x => !i.nomzodlar.some(o => o.id === x.id));
          if (fresh.length) { qayta.add(i.id); return { ...i, nomzodlar: [...fresh, ...i.nomzodlar].slice(0, 15) }; }
        }
        return i;
      });
      if (tirik.current) setIshlar(next);
      if (!qayta.size) break;
      qaytaIds = qayta;
    }
    // A declined or ambiguous choice stays unresolved until the user clarifies it.
    return next;
  }

  async function yubor(txt?: string) {
    const m = (txt ?? matn).trim() || (ilova ? t('Ushbu loyiha hujjati bo‘yicha smeta ishlarini tuzing.') : '');
    if (!m || band) return;
    const yuborilganIlova = ilova;
    setIlova(null);
    if (kompaniyaId == null) { setHolat(t('Avval yuqorida kompaniyani tanlang.')); return; }
    const yangi = [...xabarlar, { rol: 'user' as const, matn: yuborilganIlova ? `📎 ${yuborilganIlova.nom}\n${m}` : m }];
    setXabarlar(yangi); setMatn(''); setHolat(''); setBand('suhbat');
    try {
      const r = await smetachiSuhbat(kompaniyaId, yangi, ishlar, doc.context.objectLabel || doc.context.title,
        smetaXulosasi(doc, calcDoc(doc), c => (c && katalog ? katalog.unit(c)?.text ?? null : null)), yuborilganIlova);
      if (!tirik.current) return;
      if (!r.ok) { setHolat(xato(r.code, r.message)); return; }
      // A reply the server could not read (raw output attached) must never wipe the works agreed so far.
      // Faqat javob haqiqatan o'qilmaganda (savol/izoh bilan javob — bu tushunilgan javob, xato emas).
      if (r.tushunildi === false || ('xom' in r && r.xom && r.tushunildi == null && !r.ishlar.length)) {
        setXabarlar(x => [...x, { rol: 'assistant', matn: t('Javobni to‘liq tushunib bo‘lmadi — ishlar ro‘yxati o‘zgarmadi. Iltimos, aniqroq yozing yoki qayta yuboring.') }]);
        return;
      }
      const javob = [r.javob, ...r.savollar.map(s => '• ' + s)].join('\n');
      setXabarlar(x => [...x, { rol: 'assistant', matn: javob }]);
      const userText = yangi.filter(x => x.rol === 'user').map(x => x.matn).join('\n');
      setAmallar((r.amallar ?? []).map(a => {
        // A class/mark the user never stated is not written silently (the model must ask).
        const ogoh = a.tur === 'material' && a.qiymat && !materialManbadami(a.qiymat, userText) ? t('Bu material sinfi/markasi suhbatda aytilmagan — tekshiring') : null;
        return { ...a, tanlangan: !ogoh, ogoh };
      }));
      if (r.ogohlantirish) setHolat(r.ogohlantirish);
      // A conversational-only response must not erase the user's existing proposals.
      const asoslangan = r.ishlar.length ? await asosla(birlashtir(ishlar, r.ishlar)) : ishlar;
      if (tirik.current) setIshlar(asoslangan);
    } finally { setBand(''); }
  }

  const overlaps = useMemo(() => includedWorkReviews(ishlar, doc), [ishlar, doc]);
  const tayyor = useMemo(() => ishlar.filter(i => i.holat !== 'ANIQLASH_KERAK' && i.tanlangan && i.hajm && !overlaps.has(i.id)), [ishlar, overlaps]);
  async function qosh() {
    if (!katalog || !tayyor.length) return;
    setBand('qoshish');
    try {
      const r = await smetagaQoshish(doc, ishlar, katalog, newId);
      if (!tirik.current) return;
      if (r.commands.length && command({ type: 'BATCH', label: 'Smetachi AI', commands: r.commands })) {
        setIshlar(list => list.filter(i => !r.qoshildi.includes(i.id)));
        setXabarlar(x => [...x, { rol: 'assistant', matn: t('{n} ta ish smetaga qo‘shildi (bitta “Bekor qilish” bilan qaytariladi).', { n: r.qoshildi.length }) }]);
        const minuslar = r.commands.filter(c => c.type === 'ADD_OCCURRENCE' && c.minus).length;
        if (minuslar) setXabarlar(x => [...x, { rol: 'assistant', matn: t('{n} ta «исключать» pozitsiya manfiy hisoblanadi.', { n: minuslar }) }]);
        // «… ПО ПРОЕКТУ» resources of the added works without a material → ask right here (owner 2026-10-16).
        const savol = r.commands.flatMap(c => c.type === 'ADD_OCCURRENCE' ? c.recipe.filter(x => x.resource && loyihaBoyicha(x.resource.name) && !talabMateriali(c.material, x.resource.name))
          .map(x => `${c.source.code}: ${x.resource!.name}`) : []);
        if (savol.length) setXabarlar(x => [...x, { rol: 'assistant', matn: [t('Normada loyiha bo‘yicha belgilanadigan resurslar bor. Loyihadagi aniq materialni yozing (sinf/marka/diametr):'), ...[...new Set(savol)].map(s => '• ' + s)].join('\n') }]);
      }
      if (r.otkazildi.length) setHolat(r.otkazildi.map(o => `${ishlar.find(i => i.id === o.id)?.tavsif ?? o.id}: ${o.sabab}`).join(' · '));
    } finally { setBand(''); }
  }
  /** Runs the selected actions: document edits as ONE batch, then step actions (pricing, documents …) in order. */
  async function bajar() {
    const tanlangan = amallar.filter(a => a.tanlangan);
    const natija: string[] = [], buyruqlar: StudioCommand[] = [], keyin: AgentAmal[] = [];
    for (const a of tanlangan) {
      try {
        if (a.tur === 'bosqich') { if (a.qiymat === 'lrv' || a.qiymat === 'narx' || a.qiymat === 'res') onBosqich?.(a.qiymat); continue; }
        const c = amalBuyruqlari(doc, a, newId);
        if (c) buyruqlar.push(...c); else keyin.push(a);
      } catch (e) { natija.push(`✗ ${t(AMAL_NOMI[a.tur])}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    setBand('amal');
    try {
      if (buyruqlar.length) natija.push(command({ type: 'BATCH', label: t('Smetachi AI: amallar'), commands: buyruqlar }) ? `✓ ${t('Smeta o‘zgartirildi: {n} amal', { n: buyruqlar.length })}` : `✗ ${t('Smeta o‘zgarmadi — qiymatlarni tekshiring')}`);
      // Step actions run after the edits are in the document (the next render), one by one.
      if (keyin.length) await new Promise(r => setTimeout(r, 300));
      for (const a of keyin) {
        try {
          const nom = a.tur === 'hujjat' ? 'hujjat' : a.tur;
          natija.push(`✓ ${await agentChaqir(nom, a, () => { const b = AMAL_BOSQICH[a.tur]; if (b) onBosqich?.(b); })}`);
        } catch (e) { natija.push(`✗ ${t(AMAL_NOMI[a.tur])}: ${e instanceof Error && e.message !== 'AGENT_STEP_UNAVAILABLE' ? e.message : t('bosqich ochilmadi')}`); }
      }
    } finally { setBand(''); }
    setAmallar([]);
    if (natija.length) setXabarlar(x => [...x, { rol: 'assistant', matn: natija.join('\n') }]);
  }
  function ishniYangila(id: string, o: Partial<AiIsh>) { setIshlar(list => list.map(i => (i.id === id ? { ...i, ...o } : i))); }
  function formula(id: string, v: string) {
    let hajm: AiIsh['hajm'] = null, hajmXato: string | null = null;
    if (v.trim()) { try { hajm = ifodaHisobla(v); } catch { hajmXato = 'IFODA_NOTOGRI'; } }
    const aniqlashKerak = ishlar.find(i => i.id === id)?.holat === 'ANIQLASH_KERAK';
    ishniYangila(id, { hajmIfoda: v || null, hajm, hajmXato, holat: aniqlashKerak ? 'ANIQLASH_KERAK' : hajm ? 'TAYYOR' : 'HAJM_KERAK' });
  }
  function ovoz() {
    const C = SpeechCtor();
    if (!C) { setHolat(t('Bu brauzer ovozli kiritishni qo‘llamaydi (Chrome’da ishlaydi).')); return; }
    if (tinglash) { rec.current?.stop(); return; }
    const r = new C(); r.lang = 'uz-UZ'; r.interimResults = false;
    r.onresult = e => { const s = Array.from(e.results).map(x => x[0]?.transcript ?? '').join(' '); setMatn(old => (old ? old + ' ' : '') + s); };
    r.onend = () => setTinglash(false);
    rec.current = r; setTinglash(true); r.start();
  }

  return <section aria-label={t('Smetachi AI')} className="flex min-h-[520px] flex-col gap-2 text-sm">
    <ModelChip profil="smeta_ai" kompaniyaId={kompaniyaId} />
    <div className="karta max-h-72 min-h-[140px] flex-1 space-y-2 overflow-auto p-2" role="log" aria-live="polite">
      {!xabarlar.length && <div className="space-y-1 text-[12.5px] text-text-dim">
        <p className="font-medium text-text">{t('Bajarilgan ishni oddiy so‘z bilan yozing — tizim normativ ishlarga ajratib, hajmni siz bilan aniqlaydi.')}</p>
        <p>{t('Masalan:')} <button type="button" className="underline" onClick={() => setMatn(t('Lentali fundament qilindi: kotlovan qazildi, podbetonka quyildi, armatura to‘qildi, beton B20 quyildi. Uzunligi 48 m, kengligi 0,6 m, balandligi 1,2 m.'))}>
          {t('Lentali fundament qilindi: kotlovan qazildi, podbetonka quyildi, armatura to‘qildi, beton B20 quyildi. Uzunligi 48 m, kengligi 0,6 m, balandligi 1,2 m.')}</button></p>
      </div>}
      {xabarlar.map((x, i) => <div key={i} className={x.rol === 'user' ? 'ml-8 rounded-lg bg-accent/10 px-2 py-1.5' : 'mr-8 whitespace-pre-line rounded-lg bg-surface-2 px-2 py-1.5'}>{x.matn}</div>)}
      {band && <p className="text-xs text-text-mute">{band === 'suhbat' ? t('Smetachi o‘ylayapti...') : band === 'tanlash' ? t('Normativ katalogdan mos ishlar tanlanmoqda...') : t('Smetaga qo‘shilmoqda...')}</p>}
      <div ref={oxir} />
    </div>
    <form className="flex items-end gap-1" onSubmit={e => { e.preventDefault(); void yubor(); }}>
      <textarea aria-label={t('Smetachiga xabar')} className="input min-h-[44px] flex-1 resize-y py-1.5 text-[13px]" rows={2} value={matn} disabled={!!band}
        placeholder={t('Masalan: plita quyildi 12×8 m, qalinligi 0,2 m, beton B25...')} onChange={e => setMatn(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void yubor(); } }} />
      <button type="button" aria-label={tinglash ? t('Ovozni to‘xtatish') : t('Ovoz bilan aytish')} className={`tugma h-9 px-2 ${tinglash ? 'tugma-asosiy' : ''}`} onClick={ovoz}>🎤</button>
      <label className="tugma h-9 cursor-pointer px-2" title={t('Loyiha, spetsifikatsiya yoki hajmlar jadvali (rasm, PDF, Excel, Word)')}>📎
        <input aria-label={t('Loyiha hujjati')} type="file" className="hidden" accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.xls,.xlsm,.docx"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ilovaTayyorla(f).then(setIlova).catch(err => setHolat(err instanceof Error && err.message === 'FAYL_KATTA' ? t('Fayl juda katta (7 MB gacha).') : t('Bu fayl turini o‘qib bo‘lmaydi (rasm, PDF, Excel, Word).'))); }} /></label>
      <button type="submit" className="tugma tugma-asosiy h-9 px-3" disabled={!!band || (!matn.trim() && !ilova)}>{t('Yuborish')}</button>
    </form>
    {holat && <p role="status" className="text-xs text-warn">{holat}</p>}
    {ilova && <p className="text-xs text-accent">📎 {ilova.nom} <button type="button" className="ml-1 underline text-text-mute" onClick={() => setIlova(null)}>{t('olib tashlash')}</button></p>}
    {amallar.length > 0 && <div className="karta space-y-1 p-2 text-[12px]">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('AI taklif qilgan amallar')}</strong>
      {amallar.map((a, i) => <label key={i} className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={a.tanlangan} onChange={e => setAmallar(l => l.map((x, j) => (j === i ? { ...x, tanlangan: e.target.checked } : x)))} />
        <span><b>{t(AMAL_NOMI[a.tur])}</b>{a.ish ? ` · ${a.ish}` : ''}{a.qiymat ? ` · ${a.qiymat}` : ''}{a.manba ? ` · ${a.manba}` : ''}
          {a.izoh && <span className="block text-[11px] text-text-mute">{a.izoh}</span>}
          {a.ogoh && <span className="block text-[11px] text-warn">{a.ogoh}</span>}</span>
      </label>)}
      <div className="flex gap-2">
        <button type="button" className="tugma tugma-asosiy h-8 px-3 text-[12px]" disabled={!!band || !amallar.some(a => a.tanlangan)} onClick={() => void bajar()}>{t('Bajarish')}</button>
        <button type="button" className="tugma h-8 px-3 text-[12px]" onClick={() => setAmallar([])}>{t('Bekor qilish')}</button>
      </div>
    </div>}

    {ishlar.length > 0 && <div className="karta overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-2 py-1.5">
        <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Taklif qilingan ishlar')}</strong>
        <span className="text-xs text-text-mute">{t('{a} / {b} tayyor', { a: tayyor.length, b: ishlar.length })}</span>
        <span className="flex-1" />
        <button type="button" className="tugma tugma-asosiy h-7 px-2 text-[11.5px]" disabled={!tayyor.length || !!band} onClick={() => void qosh()}>
          {t('Tayyorlarini smetaga qo‘shish ({n})', { n: tayyor.length })}</button>
      </div>
      <ul className="divide-y divide-border/60">
        {ishlar.map(i => <li key={i.id} className="space-y-1 px-2 py-1.5 text-[12.5px]">
          <div className="flex items-start gap-2">
            <span className={`shrink-0 text-[10.5px] font-semibold ${HOLAT_RANG[i.holat]}`}>{tayyor.includes(i) ? '✓' : '•'}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text">{i.minus && <span className="text-danger">(−) {t('исключать')} </span>}{i.tavsif}{i.material && <span className="text-text-mute"> · {i.material}</span>}</p>
              <p className="text-[11px] text-text-mute">{t('Bo‘lim')}: {i.bolim}</p>
              {i.koeffitsientlar?.map(k => <p key={k.nom} className="text-[11px] text-warn">{t('Koeffitsient taklifi')}: {k.nom} × {k.qiymat.replace('.', ',')} ({k.qollanish}) — {k.asos}</p>)}
            </div>
            <button type="button" aria-label={t('Ishni olib tashlash')} className="text-xs text-text-mute hover:text-danger" onClick={() => setIshlar(l => l.filter(x => x.id !== i.id))}>✕</button>
          </div>
          <label className="block text-[11px] text-text-dim">{t('Normativ ish')}
            <select className="input mt-0.5 h-7 w-full text-[11.5px]" value={i.tanlangan?.workId ?? ''}
              onChange={e => { const n = i.nomzodlar.find(x => x.id === e.target.value); ishniYangila(i.id, { tanlangan: n ? { workId: n.id, kod: n.kod, nom: n.nom, birlik: n.birlik, sabab: t('qo‘lda tanlandi'), qolda: true } : null }); }}>
              <option value="">{i.nomzodlar.length ? t('— tanlang ({n} nomzod) —', { n: i.nomzodlar.length }) : t('— katalogda topilmadi —')}</option>
              {i.nomzodlar.map(n => <option key={n.id} value={n.id}>{n.kod} · {n.nom}{n.birlik ? ` (${n.birlik})` : ''}{n.toplam ? ` — ${n.toplam}` : ''}</option>)}
            </select></label>
          {katalog && <KatalogQidiruv katalog={katalog} onPick={n => ishniYangila(i.id, {
            nomzodlar: [...i.nomzodlar.filter(x => x.id !== n.id), n],
            tanlangan: { workId: n.id, kod: n.kod, nom: n.nom, birlik: n.birlik, sabab: t('qo‘lda tanlandi'), qolda: true },
          })} />}
          {i.tanlangan && katalog && <p className="whitespace-pre-line text-[11px] text-text-mute">{tanlovDalili(i, katalog)}</p>}
          {i.tanlangan && <NormaTarkibi code={i.tanlangan.kod} />}
          {overlaps.has(i.id) && <p role="status" className="text-[11px] text-warn">
            {t('Norma tarkibi bilan takrorlanish xavfi — alohida ish hajmi va qo‘llanishini tekshiring.')}{' '}
            <a className="underline" href={`${overlaps.get(i.id)!.url}#page=${overlaps.get(i.id)!.page}`} target="_blank" rel="noreferrer">{overlaps.get(i.id)!.code} · {overlaps.get(i.id)!.document} · {overlaps.get(i.id)!.page}</a>
            <br />{t('Murakkab normada (masalan temirbeton poydevor) armatura va qolip resurslari bor. Ikki yo‘l: alohida o‘rnatish ishini olib tashlang (✕) va armatura miqdorini LRV da normadagi «АРМАТУРА» qatoriga kiriting, yoki norma tarkibini tekshirib, alohida hisoblanishini tasdiqlang.')}
            {/(?:armatur|арматур|qolip|opalub|опалуб)/i.test(`${i.tavsif} ${i.tanlangan?.nom ?? ''}`) && <button type="button" className="ml-1 underline" onClick={() => ishniYangila(i.id, { takrorTasdiq: true })}>{t('Alohida hisoblashni tasdiqlayman')}</button>}
          </p>}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-text-dim">{t('Hajm formulasi')}
              <input className="input h-7 w-40 text-[12px]" value={i.hajmIfoda ?? ''} placeholder="12*0,6*0,1" onChange={e => formula(i.id, e.target.value)} /></label>
            <span className="tabular-nums font-medium">{i.hajm ? `= ${i.hajm.qiymat.replace('.', ',')} ${i.birlik}` : <span className="text-warn">{i.hajmXato ? t('formula noto‘g‘ri') : t('hajm kerak')}</span>}</span>
          </div>
          {i.hajmIzoh && <p className="text-[11px] text-text-mute">{i.hajmIzoh}</p>}
        </li>)}
      </ul>
    </div>}
  </section>;
}

function NormaTarkibi({ code }: { code: string }) {
  const ref = foundationReference(code);
  if (!ref) return null;
  return <details className="text-[11px] text-text-dim">
    <summary>{t('Normaning ish tarkibi (manba bo‘yicha)')}</summary>
    <ol className="ml-4 list-decimal">{ref.operations.map(op => <li key={op}>{t(op)}</li>)}</ol>
    <a className="text-accent underline" href={`${ref.url}#page=${ref.pdfPage}`} target="_blank" rel="noreferrer">{ref.document} · {ref.table} · {ref.printedPage}</a>
    <p className="text-warn">{t(ref.caution)}</p>
  </details>;
}

function KatalogQidiruv({ katalog, onPick }: { katalog: AiKatalog; onPick: (n: TanlovNomzodi) => void }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ query: string; page: number; rows: TanlovNomzodi[]; total: number; hasNext: boolean; manoBoyicha?: boolean } | null>(null);
  const search = (q: string, page: number) => setResult({ query: q, page, ...katalogSahifasi(katalog, q, page) });
  return <details className="text-[11px] text-text-dim">
    <summary>{t('Boshqa normani katalogdan qidirish')}</summary>
    <div className="mt-1 flex gap-1">
      <input aria-label={t('Norma kodi yoki nomi')} className="input h-7 flex-1" value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(query, 0); } }} />
      <button type="button" className="tugma h-7" onClick={() => search(query, 0)}>{t('Qidirish')}</button>
    </div>
    {result && <div className="space-y-1">
      <p>{result.manoBoyicha ? t('Aynan mos yozuv yo‘q — ma’no bo‘yicha eng yaqin ishlar') : <>{t('Topildi')}: {result.total}</>} · {t('Sahifa')}: {result.page + 1}</p>
      {result.rows.map(n => <button key={n.id} type="button" className="block w-full rounded border border-border p-1 text-left" onClick={() => onPick(n)}>
        {n.kod} · {n.nom} · {n.birlik ?? '—'}
      </button>)}
      <div className="flex gap-1">
        <button type="button" className="tugma" disabled={result.page === 0} onClick={() => search(result.query, result.page - 1)}>{t('Oldingi')}</button>
        <button type="button" className="tugma" disabled={!result.hasNext} onClick={() => search(result.query, result.page + 1)}>{t('Keyingi')}</button>
      </div>
    </div>}
  </details>;
}
