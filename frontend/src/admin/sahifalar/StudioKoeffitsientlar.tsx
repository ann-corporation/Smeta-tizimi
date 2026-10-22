/**
 * LRV dagi ish sharoiti koeffitsientlari (egasi 2026-10-15: "koeffitsientni qo'lda qo'yadigan qilib qo'yibsan — berilgan
 * ma'lumotlarda koeffitsientlar qo'llanadigan vaziyatlar uchun bo'lishi va taklif qilishi kerak edi").
 *
 *   • har ish uchun uning norma jadvaliga tegishli NORMATIV koeffitsientlar (ШНК texnik qismi: shart matni, Кзтр/Кэм/Кмр, band);
 *   • foydalanuvchi sharoitni yozadi → AI faqat shu ro'yxatdan mosini tanlaydi (taklif, qabul qilinmaguncha hisobga kirmaydi);
 *   • qo'lda qo'shish — faqat manba (hujjat va band) bilan. Boshqaruv to'liq foydalanuvchida.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { agentRegister } from './studioAgent';
import { t } from '../../i18n/til';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { EstimateDoc, Occurrence, WorkCoefficient } from '../../lib/smeta-studio/model';
import { ishKoeffitsientlari, koefgaAylantir, koefKatalogi, qollanadi, type KoefKatalog, type KoefNomzod } from '../../lib/smeta-studio/koef-katalog';
import { coefficientApplyCommand } from '../../lib/smeta-studio/coefficient-agent';
import { manbaKorinishi } from '../../lib/manba-nomi';
import { smetachiKoefTanla } from '../../api/smeta-ai';

const OP_SCOPES = ['ALL', 'ЧЕЛ', 'МАШ', 'ЧЕЛ+МАШ', 'МАТ'] as const;
const kStr = (k: KoefNomzod['yozuv']['k']) => Object.entries(k).map(([s, v]) => `${s === 'ЧЕЛ' ? 'Кзтр' : s === 'МАШ' ? 'Кэм' : 'Кмр'}=${String(v).replace('.', ',')}`).join(', ');

export function KoeffitsientlarPaneli({ doc, command, kompaniyaId, workId, sourceLabel, agentOnly = false }: { agentOnly?: boolean; workId?: string; sourceLabel?: (raw: string) => string; doc: EstimateDoc; command: (c: StudioCommand) => boolean; kompaniyaId?: number | null }) {
  const [kat, setKat] = useState<KoefKatalog | null>(null);
  const [katXato, setKatXato] = useState(false);
  const [ochiq, setOchiq] = useState<string | null>(null);
  const [sharoit, setSharoit] = useState('');
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState('');
  const [yangi, setYangi] = useState<{ occ: string; nom: string; qiymat: string; scope: WorkCoefficient['scope']; asos: string }>({ occ: workId ?? '', nom: '', qiymat: '', scope: 'ALL', asos: '' });
  useEffect(() => { let alive = true; koefKatalogi().then(k => { if (alive) setKat(k); }).catch(() => { if (alive) setKatXato(true); }); return () => { alive = false; }; }, []);
  const works = Object.values(doc.occurrences).filter(o => !workId || o.id === workId);
  const publicSource = sourceLabel ?? manbaKorinishi;
  const normativ = useMemo(() => new Map(works.map(o => [o.id, kat ? ishKoeffitsientlari(kat, o.source.code) : []])), [works, kat]);
  const set = (occ: string, coefficients: WorkCoefficient[]) => command({ type: 'SET_COEFFICIENTS', occurrenceId: occ, coefficients });
  /** Adds the coefficients of one normative record (replacing an earlier copy of the same record). */
  const qosh = (o: Occurrence, n: KoefNomzod, accepted: boolean, sabab?: string) => {
    const add = koefgaAylantir(n, accepted).map(c => sabab ? { ...c, evidence: `${c.evidence}`.slice(0, 240) + ` · AI: ${sabab}`.slice(0, 60) } : c);
    const ids = new Set(add.map(c => c.id));
    return set(o.id, [...(o.coefficients ?? []).filter(c => !ids.has(c.id)), ...add]);
  };
  async function aiTanla(sharoitMatn = sharoit): Promise<string> {
    if (kompaniyaId == null || !sharoitMatn.trim()) return t('Ish sharoiti yozilmagan.');
    const sorovlar = works.filter(o => normativ.get(o.id)?.length).slice(0, 40)
      .map(o => ({ id: o.id, ish: `${o.source.code} ${o.source.name}`, nomzodlar: normativ.get(o.id)!.filter(qollanadi).map(n => ({ kod: n.kod, shart: `${publicSource(n.yozuv.t)}. ${publicSource(n.yozuv.s || n.yozuv.q)}` })) }))
      .filter(x => x.nomzodlar.length);
    if (!sorovlar.length) { setXabar(t('Smetadagi ishlar uchun normativ koeffitsient topilmadi.')); return t('Smetadagi ishlar uchun normativ koeffitsient topilmadi.'); }
    setBand(true); setXabar('');
    try {
      const requestDoc = doc;
      const r = await smetachiKoefTanla(kompaniyaId, sharoitMatn.trim(), sorovlar);
      if (latestDoc.current !== requestDoc || latestCompany.current !== kompaniyaId) return t('AI javob bermadi. Qayta urinib ko‘ring.');
      if (!r.ok) { setXabar(t('AI javob bermadi. Qayta urinib ko‘ring.')); return t('AI javob bermadi. Qayta urinib ko‘ring.'); }
      const commands: StudioCommand[] = [];
      for (const x of r.tanlovlar) {
        const o = doc.occurrences[x.ish]; if (!o) continue;
        let list = [...(o.coefficients ?? [])];
        for (const kod of x.kodlar) {
          const n = normativ.get(o.id)?.find(v => v.kod === kod); if (!n || !qollanadi(n)) continue;
          const add = koefgaAylantir(n, false).map(c => ({ ...c, accepted: list.find(existing => existing.id === c.id)?.accepted ?? false, evidence: `${c.evidence.slice(0, 230)} · AI: ${x.sabab}`.slice(0, 300) }));
          const ids = new Set(add.map(c => c.id));
          list = [...list.filter(c => !ids.has(c.id)), ...add];
        }
        if (JSON.stringify(list)!==JSON.stringify(o.coefficients ?? [])) commands.push({ type: 'SET_COEFFICIENTS', occurrenceId: o.id, coefficients: list });
      }
      if (commands.length) command({ type: 'BATCH', label: t('AI: normativ koeffitsientlar'), commands });
      const natija = [t('AI {n} ish uchun koeffitsient taklif qildi — tekshirib qabul qiling.', { n: commands.length }), r.savol ? `${t('Aniqlashtiring')}: ${publicSource(r.savol)}` : ''].filter(Boolean).join(' ');
      setXabar(natija);
      return natija;
    } finally { setBand(false); }
  }
  const latestCompany = useRef(kompaniyaId);
  latestCompany.current = kompaniyaId;
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  const aiRef = useRef(aiTanla);
  aiRef.current = aiTanla;
  useEffect(() => workId ? undefined : agentRegister('koef_tanla', async v => { setSharoit(v ?? ''); return aiRef.current(v ?? ''); }), [workId]);

  const current = useRef({doc,command,kompaniyaId});
  current.current={doc,command,kompaniyaId};
  useEffect(()=>{
    if (workId) return;
    return agentRegister('koef_qolla',async (_value,action)=>{
      const context=current.current;
      const catalog=await koefKatalogi();
      if (current.current.doc!==context.doc || current.current.kompaniyaId!==context.kompaniyaId) throw new Error('COEFFICIENT_CONTEXT_CHANGED');
      const cmd=coefficientApplyCommand(context.doc,catalog,action.ish,action.qiymat,action.manba);
      if (!context.command(cmd)) throw new Error('COEFFICIENT_COMMAND_FAILED');
      return t('Normativ koeffitsient qo‘llandi. Bekor qilish mumkin.');
    });
  },[workId]);
  if (agentOnly || !works.length) return null;
  const jamiNormativ = works.reduce((s, o) => s + (normativ.get(o.id)?.length ?? 0), 0);
  return <section aria-label={t('Ish koeffitsientlari')} className="karta space-y-2 p-2 text-[12.5px]">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Ish koeffitsientlari')}</strong>
      <span className="text-xs text-text-mute">{kat ? t('ШНК texnik qismidan {n} ta normativ koeffitsient shu smeta ishlariga tegishli. Qabul qilinmaguncha hisobga kirmaydi.', { n: jamiNormativ })
        : katXato ? t('Normativ koeffitsientlar ma’lumotnomasi ochilmadi.') : t('Normativ koeffitsientlar yuklanmoqda...')}</span>
    </div>
    {kat && jamiNormativ > 0 && kompaniyaId != null && <form className="flex flex-wrap gap-1" onSubmit={e => { e.preventDefault(); void aiTanla(sharoit); }}>
      <input aria-label={t('Ish sharoiti')} className="input h-7 flex-1 min-w-[240px] text-[11.5px]" value={sharoit} onChange={e => setSharoit(e.target.value)}
        placeholder={t('Sharoit: masalan kotlovan hajmi 250 m³, mavjud bino ichida ta’mir, tor joy, qish')} />
      <button type="submit" className="tugma h-7 px-2 text-[11.5px]" disabled={band || !sharoit.trim()}>{band ? t('AI tanlamoqda...') : t('AI sharoit bo‘yicha tanlasin')}</button>
    </form>}
    {xabar && <p role="status" className="text-xs text-accent">{xabar}</p>}
    {works.map(o => {
      const norm = normativ.get(o.id) ?? [], bor = o.coefficients ?? [];
      if (!norm.length && !bor.length) return null;
      return <div key={o.id} className="rounded border border-border p-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium"><span className="font-mono text-accent">{o.source.code}</span> {o.source.name}</p>
          <span className="flex-1" />
          {(workId ? 2 : 0) < norm.length && <button type="button" className="text-[11px] underline" onClick={() => setOchiq(ochiq === o.id ? null : o.id)}>
            {ochiq === o.id ? t('Yopish') : t('Normativ koeffitsientlar ({n})', { n: norm.length })}</button>}
        </div>
        {bor.map(k => <div key={k.id} className="mt-1 flex flex-wrap items-center gap-2">
          <span className={k.accepted ? 'text-ok' : 'text-warn'}>{k.accepted ? '✓' : '•'}</span>
          <span>{publicSource(k.name)} × <b>{k.value.replace('.', ',')}</b> ({k.scope})</span>
          <span className="text-[11px] text-text-mute">{publicSource(k.evidence)}{k.origin === 'AI' ? ` · ${t('AI taklifi')}` : k.origin === 'NORM' ? ` · ${t('normativ')}` : ''}</span>
          <span className="flex-1" />
          <button type="button" className="tugma h-6 px-2 text-[11px]" onClick={() => set(o.id, bor.map(x => x.id === k.id ? { ...x, accepted: !x.accepted } : x))}>
            {k.accepted ? t('Bekor qilish') : t('Qabul qilish')}</button>
          <button type="button" aria-label={t('Koeffitsientni olib tashlash')} className="text-xs text-text-mute hover:text-danger" onClick={() => set(o.id, bor.filter(x => x.id !== k.id))}>✕</button>
        </div>)}
        {(workId || ochiq === o.id) && <ul className="mt-1 space-y-1 border-t border-border/60 pt-1">
          {(workId && ochiq !== o.id ? norm.slice(0, 2) : norm).map(n => <li key={n.kod} className="flex flex-wrap items-start gap-2 text-[11.5px]">
            <span className="font-mono text-text-dim">{n.kod}</span>
            <span className="flex-1 min-w-[240px]"><b>{kStr(n.yozuv.k)}</b> — {publicSource(n.yozuv.s || n.yozuv.q)} <span className="text-text-mute">({publicSource(n.yozuv.a)})</span></span>
            {qollanadi(n) ? <button type="button" className="tugma h-6 px-2 text-[11px]" onClick={() => qosh(o, n, true)}>{t('Qo‘llash')}</button>
              : <span className="text-[11px] text-warn">{t('Parametrli qoida (har metr/har 100 mm) — avtomatik qo‘llanmaydi; kerak bo‘lsa hisoblab «Qo‘lda qo‘shish» bilan kiriting')}</span>}
          </li>)}
        </ul>}
      </div>;
    })}
    <details><summary className="cursor-pointer text-[11.5px] text-text-dim">{t('Koeffitsientni qo‘lda kiritish')}</summary>
    <form className="flex flex-wrap items-end gap-1" onSubmit={e => {
      e.preventDefault();
      const o = doc.occurrences[workId ?? yangi.occ]; if (!o) return;
      const id = `op${Date.now().toString(36)}`;
      if (set(o.id, [...(o.coefficients ?? []), { id, name: yangi.nom, value: yangi.qiymat, scope: yangi.scope, evidence: yangi.asos, origin: 'OPERATOR', accepted: true }]))
        setYangi({ occ: yangi.occ, nom: '', qiymat: '', scope: 'ALL', asos: '' });
    }}>
      {!workId && <select aria-label={t('Ish')} className="input h-7 max-w-[220px] text-[11.5px]" value={yangi.occ} onChange={e => setYangi({ ...yangi, occ: e.target.value })}>
        <option value="">{t('— ishni tanlang —')}</option>
        {works.map(o => <option key={o.id} value={o.id}>{o.source.code} · {(o.source.name ?? '').slice(0, 60)}</option>)}
      </select>}
      <input aria-label={t('Koeffitsient nomi')} className="input h-7 w-36 text-[11.5px]" placeholder={t('Nomi')} value={yangi.nom} onChange={e => setYangi({ ...yangi, nom: e.target.value })} />
      <input aria-label={t('Koeffitsient qiymati')} className="input h-7 w-16 text-[11.5px]" inputMode="decimal" placeholder="1,15" value={yangi.qiymat} onChange={e => setYangi({ ...yangi, qiymat: e.target.value })} />
      <select aria-label={t('Qo‘llanish')} className="input h-7 text-[11.5px]" value={yangi.scope} onChange={e => setYangi({ ...yangi, scope: e.target.value as WorkCoefficient['scope'] })}>
        {OP_SCOPES.map(s => <option key={s} value={s}>{s === 'ALL' ? t('barcha resurslar') : s}</option>)}
      </select>
      <input aria-label={t('Koeffitsient asosi')} className="input h-7 flex-1 min-w-[160px] text-[11.5px]" placeholder={t('Asos: hujjat va band')} value={yangi.asos} onChange={e => setYangi({ ...yangi, asos: e.target.value })} />
      <button type="submit" className="tugma h-7 px-2 text-[11.5px]" disabled={!yangi.occ || !yangi.nom.trim() || !yangi.qiymat.trim() || !yangi.asos.trim()}>{t('Qo‘lda qo‘shish')}</button>
    </form></details>
  </section>;
}
