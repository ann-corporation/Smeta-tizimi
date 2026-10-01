import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, FileSignature, Link2, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { yangiOperationId } from '../../api/supabase';
import { liniyaXato, shartnomaLiniyaOl, shartnomaSaqlaV2, type Liniya, type LiniyaShartnoma } from '../../api/t2-shartnoma-liniya';
import {
  ROL_TAKLIF, TUR_TAKLIF, liniyaDaraxt, shaklQur, shaklTekshir, shaklYuk, shartnomasizObyektlar, takliflar, tanlashMumkin, type Shakl,
} from '../../lib/shartnoma-liniya';

const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';
const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';

/**
 * Egasi (2026-10-01): «loyiha ichida shartnoma, shartnomada tomonlar bog'lanadi, undan keyingi qavatlarda obyektlar».
 * Asosiy (buyurtmachi ↔ pudratchi) shartnoma — obyektda bitta; subpudrat, laboratoriya, loyihachi, yetkazib beruvchi — cheklanmagan.
 * Rollar va turlar erkin matn (takliflar bilan).
 */
export function ShartnomaLiniya() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const [liniya, setLiniya] = useState<Liniya | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [shakl, setShakl] = useState<Shakl | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [obQidir, setObQidir] = useState('');

  const yukla = useCallback(async () => {
    if (!kid) return;
    setYuklanmoqda(true);
    const r = await shartnomaLiniyaOl(kid);
    setYuklanmoqda(false);
    if (r.ok) { setLiniya(r.natija); setXato(null); } else setXato(r.error);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);

  const daraxt = useMemo(() => (liniya ? liniyaDaraxt(liniya) : []), [liniya]);
  const shartnomasiz = useMemo(() => (liniya ? shartnomasizObyektlar(liniya) : []), [liniya]);
  const obNom = useMemo(() => new Map((liniya?.obyektlar ?? []).map((o) => [o.id, o.nom])), [liniya]);
  const rollar = useMemo(() => takliflar(ROL_TAKLIF, liniya?.rollar ?? []), [liniya]);
  const turlar = useMemo(() => takliflar(TUR_TAKLIF, liniya?.turlar ?? []), [liniya]);
  const asosiylar = useMemo(() => (liniya?.shartnomalar ?? []).filter((s) => s.asosiy), [liniya]);
  const xatolar = useMemo(() => (shakl ? shaklTekshir(shakl) : []), [shakl]);
  const tanlov = useMemo(() => (liniya && shakl ? tanlashMumkin(liniya, shakl) : []), [liniya, shakl]);

  const ochish = (s: LiniyaShartnoma | null, loyihaId: number | null = null) => { setShakl(shaklQur(s, loyihaId)); setObQidir(''); };
  const ozgar = (p: Partial<Shakl>) => setShakl((s) => (s ? { ...s, ...p } : s));

  async function saqla(s: Shakl, xabar = 'Shartnoma saqlandi') {
    if (!kid || saqlanmoqda) return false;
    if (shaklTekshir(s).length) { toast('Shaklda xato bor', 'danger'); return false; }
    setSaqlanmoqda(true);
    const y = shaklYuk(s);
    const r = await shartnomaSaqlaV2({ kompaniyaId: kid, id: s.id, kutilganVersiya: s.versiya, ...y, operationId: yangiOperationId() });
    setSaqlanmoqda(false);
    if (!r.ok) { toast(liniyaXato(r), 'danger'); return false; }
    toast(xabar, 'ok');
    await yukla();
    return true;
  }

  /** Shartnomasiz obyektni asosiy shartnomaga bir bosishda biriktirish. */
  async function biriktir(obyektId: number, shartnomaId: number) {
    const s = asosiylar.find((x) => x.id === shartnomaId);
    if (!s) return;
    const sh = shaklQur(s);
    await saqla({ ...sh, obyektlar: [...sh.obyektlar, obyektId] }, `«${obNom.get(obyektId) ?? obyektId}» № ${s.raqam} ga biriktirildi`);
  }

  function shartnomaQatori(s: LiniyaShartnoma) {
    const tanlangan = shakl?.id === s.id;
    return (
      <li key={s.id}>
        <button type="button" onClick={() => ochish(s)} aria-label={`Shartnoma № ${s.raqam}`}
          className={`w-full rounded-lg border px-3 py-2 text-left transition ${tanlangan ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}>
          <div className="flex items-center gap-2">
            <FileSignature size={14} className={s.asosiy ? 'text-accent' : 'text-text-mute'} />
            <span className="truncate text-[13px] font-semibold text-text">№ {s.raqam}</span>
            <span className={`shrink-0 rounded px-1 text-[10px] ${s.asosiy ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-text-dim'}`}>{s.asosiy ? 'asosiy' : (s.turi || 'qo‘shimcha')}</span>
            {s.asosiy && s.turi && <span className="shrink-0 truncate text-[10px] text-text-mute">{s.turi}</span>}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-dim">{s.jami_nds_bilan != null ? <FmtN val={s.jami_nds_bilan} /> : null}</span>
          </div>
          {s.nom && <div className="mt-0.5 truncate text-[12px] text-text-dim">{s.nom}</div>}
          {s.tomonlar.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{s.tomonlar.map((t, i) => <span key={i} className="rounded bg-surface-2 px-1.5 text-[10px] text-text-dim"><span className="text-text-mute">{t.rol}:</span> {t.nom}</span>)}</div>}
          {s.obyektlar.length > 0 && <ul className="mt-1.5 space-y-0.5 border-l border-border pl-2">{s.obyektlar.map((o) => <li key={o} className="flex items-center gap-1 truncate text-[12px] text-text"><Building2 size={11} className="shrink-0 text-text-mute" />{obNom.get(o) ?? `#${o}`}</li>)}</ul>}
        </button>
      </li>
    );
  }

  function karta(s: Shakl) {
    const xatoJoy = (j: string) => xatolar.find((x) => x.joy === j)?.matn;
    const q = obQidir.trim().toLocaleLowerCase('ru');
    const korinadi = tanlov.filter((o) => !q || o.nom.toLocaleLowerCase('ru').includes(q) || s.obyektlar.includes(o.id));
    return (
      <section className="karta flex min-h-0 flex-col overflow-hidden" aria-label="Shartnoma kartasi">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <FileSignature size={16} className="text-accent" />
          <h2 className="text-[14px] font-semibold text-text">{s.id ? `Shartnoma № ${s.raqam || '—'}` : 'Yangi shartnoma'}</h2>
          <button type="button" aria-label="Yopish" onClick={() => setShakl(null)} className="ml-auto rounded p-1 text-text-mute hover:text-text"><X size={16} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label><span className={yorliq}>Loyiha *</span>
              <select aria-label="Loyiha" className={kirit} value={s.loyiha_id ?? ''} onChange={(e) => ozgar({ loyiha_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— tanlang —</option>
                {liniya?.loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
              {xatoJoy('loyiha') && <span className="text-[11px] text-danger">{xatoJoy('loyiha')}</span>}
            </label>
            <label><span className={yorliq}>Raqam *</span>
              <input aria-label="Raqam" className={kirit} value={s.raqam} onChange={(e) => ozgar({ raqam: e.target.value })} />
              {xatoJoy('raqam') && <span className="text-[11px] text-danger">{xatoJoy('raqam')}</span>}
            </label>
            <label className="sm:col-span-2"><span className={yorliq}>Nomi / predmeti</span>
              <input aria-label="Nomi" className={kirit} value={s.nom} onChange={(e) => ozgar({ nom: e.target.value })} />
            </label>
            <label><span className={yorliq}>Turi (erkin)</span>
              <input aria-label="Turi" list="sh-turlar" className={kirit} value={s.turi} onChange={(e) => ozgar({ turi: e.target.value })} placeholder="Bosh shartnoma, Subpudrat, Laboratoriya…" />
              <datalist id="sh-turlar">{turlar.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
            <label className="flex items-start gap-2 pt-5">
              <input type="checkbox" aria-label="Asosiy shartnoma" checked={s.asosiy} onChange={(e) => ozgar({ asosiy: e.target.checked })} className="mt-0.5" />
              <span className="text-[12px] text-text">Asosiy (buyurtmachi ↔ pudratchi)<span className="block text-[11px] text-text-mute">Obyekt faqat bitta asosiy shartnomada bo‘ladi; qolganlari cheklanmagan.</span></span>
            </label>
            {(['summa_bez_nds', 'nds', 'jami_nds_bilan'] as const).map((k) => (
              <label key={k}><span className={yorliq}>{k === 'summa_bez_nds' ? 'Summa (QQSsiz)' : k === 'nds' ? 'QQS' : 'Jami (QQS bilan)'}</span>
                <input aria-label={k} inputMode="decimal" className={`${kirit} tabular-nums`} value={s[k]} onChange={(e) => ozgar({ [k]: e.target.value } as Partial<Shakl>)} />
                {xatoJoy(k) && <span className="text-[11px] text-danger">{xatoJoy(k)}</span>}
              </label>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2"><Users size={14} className="text-text-mute" /><span className="text-[13px] font-semibold text-text">Tomonlar</span>
              <button type="button" onClick={() => ozgar({ tomonlar: [...s.tomonlar, { rol: '', nom: '', inn: null }] })} className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text-dim hover:border-accent hover:text-text"><Plus size={12} />Tomon</button>
            </div>
            <datalist id="sh-rollar">{rollar.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="space-y-1.5">
              {s.tomonlar.map((t, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,7rem)_auto] items-start gap-1.5">
                  <input aria-label={`${i + 1}-tomon roli`} list="sh-rollar" className={kirit} value={t.rol} placeholder="Rol" onChange={(e) => ozgar({ tomonlar: s.tomonlar.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)) })} />
                  <input aria-label={`${i + 1}-tomon nomi`} className={kirit} value={t.nom} placeholder="Tashkilot nomi" onChange={(e) => ozgar({ tomonlar: s.tomonlar.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })} />
                  <input aria-label={`${i + 1}-tomon INN`} className={kirit} value={t.inn ?? ''} placeholder="INN" onChange={(e) => ozgar({ tomonlar: s.tomonlar.map((x, j) => (j === i ? { ...x, inn: e.target.value } : x)) })} />
                  <button type="button" aria-label={`${i + 1}-tomonni olib tashlash`} onClick={() => ozgar({ tomonlar: s.tomonlar.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-text-mute hover:bg-danger/10 hover:text-danger"><Trash2 size={14} /></button>
                  {xatoJoy(`t${i}`) && <span className="col-span-4 text-[11px] text-danger">{xatoJoy(`t${i}`)}</span>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2"><Building2 size={14} className="text-text-mute" /><span className="text-[13px] font-semibold text-text">Obyektlar</span><span className="text-[11px] text-text-mute">{s.obyektlar.length} ta tanlangan</span></div>
            <input aria-label="Obyekt qidirish" className={`${kirit} mb-1.5`} value={obQidir} onChange={(e) => setObQidir(e.target.value)} placeholder="Obyekt nomi…" />
            <ul className="max-h-64 space-y-0.5 overflow-auto rounded-md border border-border p-1">
              {korinadi.length === 0 && <li className="px-2 py-1 text-[12px] text-text-mute">Mos obyekt yo‘q{s.asosiy ? ' (boshqa asosiy shartnomadagilar ko‘rsatilmaydi)' : ''}</li>}
              {korinadi.map((o) => (
                <li key={o.id}><label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] text-text hover:bg-surface-2">
                  <input type="checkbox" aria-label={`Obyekt: ${o.nom}`} checked={s.obyektlar.includes(o.id)}
                    onChange={(e) => ozgar({ obyektlar: e.target.checked ? [...s.obyektlar, o.id] : s.obyektlar.filter((x) => x !== o.id) })} />
                  <span className="truncate">{o.nom}</span>
                  {o.loyiha_id == null && <span className="ml-auto shrink-0 rounded bg-warn/10 px-1 text-[10px] text-warn">loyihasiz</span>}
                </label></li>
              ))}
            </ul>
          </div>

          <label className="block"><span className={yorliq}>Izoh</span>
            <textarea aria-label="Izoh" rows={2} className={kirit} value={s.izoh} onChange={(e) => ozgar({ izoh: e.target.value })} />
          </label>
        </div>
        <footer className="flex items-center gap-3 border-t border-border px-4 py-2.5">
          {xatolar.length > 0 && <span className="flex items-center gap-1 text-[12px] text-warn"><AlertTriangle size={13} />{xatolar.length} ta xato</span>}
          <button type="button" disabled={saqlanmoqda || xatolar.length > 0} onClick={() => void saqla(s).then((ok) => { if (ok && !s.id) setShakl(null); })}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"><Save size={14} />{saqlanmoqda ? 'Saqlanmoqda…' : 'Saqlash'}</button>
        </footer>
      </section>
    );
  }

  return (
    <Sahifa sarlavha="Shartnoma liniyasi" tavsif="Loyiha → shartnoma (tomonlar) → obyektlar" onYangila={() => void yukla()} yangilanmoqda={yuklanmoqda}
      amallar={<button type="button" onClick={() => ochish(null, daraxt.find((t) => t.id != null)?.id ?? null)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white"><Plus size={14} />Shartnoma</button>}>
      {!kid && <section className="karta p-4 text-text-dim">Avval kompaniyani tanlang.</section>}
      {xato && <section role="alert" className="karta flex items-center gap-2 border-danger/40 bg-danger/5 p-4 text-danger"><AlertTriangle size={16} />{xato}</section>}
      {!liniya && yuklanmoqda && <div className="skel min-h-[280px] rounded-xl" />}
      {liniya && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="min-h-0 space-y-3 overflow-auto">
            {shartnomasiz.length > 0 && (
              <section className="karta border-warn/40 p-3" aria-label="Shartnomasiz obyektlar">
                <div className="mb-2 flex items-center gap-2"><Link2 size={14} className="text-warn" /><span className="text-[13px] font-semibold text-text">Asosiy shartnomasiz obyektlar</span><span className="rounded bg-warn/10 px-1.5 text-[11px] text-warn">{shartnomasiz.length}</span></div>
                <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                  {shartnomasiz.map((o) => {
                    const mos = asosiylar.filter((s) => o.loyiha_id == null || s.loyiha_id == null || s.loyiha_id === o.loyiha_id);
                    return (
                      <li key={o.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-text">{o.nom}</span>
                        <select aria-label={`Biriktirish: ${o.nom}`} disabled={saqlanmoqda || mos.length === 0} value="" onChange={(e) => e.target.value && void biriktir(o.id, Number(e.target.value))}
                          className="max-w-[11rem] shrink-0 rounded border border-border bg-surface px-1 py-0.5 text-[11px] text-text-dim">
                          <option value="">{mos.length ? 'Shartnomaga…' : 'mos shartnoma yo‘q'}</option>
                          {mos.map((s) => <option key={s.id} value={s.id}>№ {s.raqam}{s.nom ? ` — ${s.nom}` : ''}</option>)}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {daraxt.map((t) => (
              <section key={t.id ?? 'yoq'} className="karta p-3" aria-label={`Loyiha: ${t.nom}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`text-[14px] font-semibold ${t.id == null ? 'text-warn' : 'text-text'}`}>{t.nom}</span>
                  {t.id != null && <span className="text-[11px] text-text-mute">{t.obyektSoni} obyekt · {t.asosiy.length + t.qoshimcha.length} shartnoma</span>}
                  {t.id != null && <button type="button" onClick={() => ochish(null, t.id)} className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text-dim hover:border-accent hover:text-text"><Plus size={12} />Shartnoma</button>}
                </div>
                {t.id == null && <p className="mb-2 text-[11px] text-text-mute">Bu shartnomalarga loyiha biriktirilmagan — kartani ochib loyihani tanlang.</p>}
                {t.asosiy.length + t.qoshimcha.length === 0 ? <p className="text-[12px] text-text-mute">Shartnoma yo‘q</p> : (
                  <ul className="space-y-1.5">{t.asosiy.map(shartnomaQatori)}{t.qoshimcha.map(shartnomaQatori)}</ul>
                )}
              </section>
            ))}
          </div>
          {shakl ? karta(shakl) : <section className="karta hidden items-center justify-center p-6 text-center text-[13px] text-text-mute lg:flex">Shartnomani tanlang yoki yangisini qo‘shing.</section>}
        </div>
      )}
    </Sahifa>
  );
}

export default ShartnomaLiniya;
