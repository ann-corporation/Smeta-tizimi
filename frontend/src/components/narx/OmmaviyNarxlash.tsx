/**
 * «Barcha narxsiz qatorlarni narxlash» — ommaviy narxlash paneli (egasi 2026-11-05).
 * Navbat → mahalliy manbalar (reestr → katalog → КП, bepul) → qolganlari internetdan (AI, token) → BITTA ko'rib chiqish jadvali
 * → qabul qilinganlar mavjud yo'l bilan yoziladi: reestr (narx_manba_yoz) → smeta narxi (smeta_narxla_res_v3) → dalil (narx_dalil_bogla).
 * Mantiq: lib/smeta-ai/ommaviy-narx.ts. Narx QQS siz; NULL ≠ 0 (0 narxlar faqat foydalanuvchi belgilasa).
 */
import { useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { yangiOperationId, type T2Qator } from '../../api/supabase';
import { obyektHududOl, sbNarxDalilBogla, sbNarxManbaYoz, sbNarxTakliflarOl, type NarxTaklif } from '../../api/t2-narx-dalil';
import { sbT2SmetaNarxlaRes } from '../../api/t2-smeta-narxlash';
import { narxTajribaYoz, smetachiNarxInternet } from '../../api/smeta-ai';
import { tokenHolatOl } from '../../api/t2-token';
import {
  DARAJA_NOMI, internetgaMumkin, internetTaklif, lokalTaklif, narxsizNavbat, qabulYuki, resursKalit, taxminiyToken, yakuniyNarx, yuqorilarniQabul,
  type KorikQatori, type LokalTaklif, type NavbatGuruh,
} from '../../lib/smeta-ai/ommaviy-narx';

const PARTIYA = 8;
const BIR_VAQTDA = 2;
const son = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

type Bosqich = 'boshi' | 'tayyor' | 'ishlamoqda' | 'korik' | 'yozildi';

export function OmmaviyNarxlash({ kompaniyaId, obyektId, qatorlar, nolHam, onYangilandi }: {
  kompaniyaId: number; obyektId: number; qatorlar: readonly T2Qator[]; nolHam: boolean; onYangilandi?: () => unknown;
}) {
  const navbat = useMemo(() => narxsizNavbat(qatorlar.map(q => ({ id: q.id, tur: q.tur, kat: q.kat, kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx })), { nolHam }), [qatorlar, nolHam]);
  const [bosqich, setBosqich] = useState<Bosqich>('boshi');
  const [rows, setRows] = useState<KorikQatori[]>([]);
  const [internetKerak, setInternetKerak] = useState<NavbatGuruh[]>([]);
  const [tokenBaho, setTokenBaho] = useState<number | null>(null);
  const [hudud, setHudud] = useState<string | null>(null);
  const [jarayon, setJarayon] = useState({ tayyor: 0, jami: 0 });
  const [xato, setXato] = useState('');
  const [natija, setNatija] = useState('');
  const [band, setBand] = useState(false);
  const op = useRef({ reestr: '', narx: '' });

  const qatorSoni = navbat.reduce((s, g) => s + g.qatorIds.length, 0);

  /** Step 1: free local sources for every group; the rest is the internet queue with its estimated cost. */
  async function tayyorla() {
    setBand(true); setXato(''); setNatija('');
    try {
      const [tk, hd, th] = await Promise.all([sbNarxTakliflarOl(kompaniyaId, obyektId), obyektHududOl(obyektId), tokenHolatOl(kompaniyaId)]);
      if (!tk.ok) throw new Error(tk.error || t('Narx manbalari o‘qilmadi'));
      const takliflar = (tk.qatorlar ?? []) as unknown as LokalTaklif[];
      const r: KorikQatori[] = navbat.map(g => ({ guruh: g, taklif: lokalTaklif(g, takliflar), holat: 'kutilmoqda', tahrir: null }));
      const kerak = r.filter(x => !x.taklif && internetgaMumkin(x.guruh)).map(x => x.guruh);
      setRows(r); setInternetKerak(kerak); setHudud(hd?.hudud ?? null);
      setTokenBaho(taxminiyToken(kerak.length, th.ok ? th.natija.sozlama : null));
      op.current = { reestr: yangiOperationId(), narx: yangiOperationId() };
      setBosqich('tayyor');
    } catch (e) { setXato(e instanceof Error ? e.message : String(e)); }
    finally { setBand(false); }
  }

  /** Step 2: internet for the groups no local source priced — batches of 8, two requests at a time, live progress. */
  async function internetdanQidir() {
    setBosqich('ishlamoqda'); setXato('');
    const partiyalar: NavbatGuruh[][] = [];
    for (let i = 0; i < internetKerak.length; i += PARTIYA) partiyalar.push(internetKerak.slice(i, i + PARTIYA));
    setJarayon({ tayyor: 0, jami: internetKerak.length });
    let navbatdagi = 0; let tayyor = 0; let birinchiXato = '';
    const ishchi = async () => {
      while (navbatdagi < partiyalar.length) {
        const p = partiyalar[navbatdagi++];
        const j = await smetachiNarxInternet(kompaniyaId, p.map((g, i) => ({ id: `g${i}`, nom: g.nom, birlik: g.birlik, kat: g.kat })), hudud);
        if (j.ok) {
          const m = new Map(j.natijalar.map(n => [n.id, n]));
          const yangi = new Map(p.map((g, i) => [g.kalit, m.get(`g${i}`)]));
          setRows(old => old.map(r => {
            const n = yangi.get(r.guruh.kalit);
            if (!n) return r;
            const tk = internetTaklif(r.guruh, n);
            return { ...r, taklif: tk, sabab: tk ? null : (n.izoh || n.manbalar.find(x => x.sabab)?.sabab || t('ishonchli manba topilmadi')) };
          }));
        } else if (!birinchiXato) birinchiXato = j.message || j.code;
        tayyor += p.length;
        setJarayon({ tayyor, jami: internetKerak.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(BIR_VAQTDA, partiyalar.length) }, ishchi));
    if (birinchiXato) setXato(t('Internet qidiruvi qisman bajarilmadi: {x}', { x: birinchiXato }));
    setBosqich('korik');
  }

  const holat = (kalit: string, h: KorikQatori['holat']) => setRows(l => l.map(r => (r.guruh.kalit === kalit ? { ...r, holat: h } : r)));
  const tahrirla = (kalit: string, v: string) => setRows(l => l.map(r => {
    if (r.guruh.kalit !== kalit) return r;
    const n = v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.'));
    return { ...r, tahrir: n != null && Number.isFinite(n) && n >= 0 ? n : null, holat: n != null && Number.isFinite(n) && n >= 0 ? 'qabul' : r.holat };
  }));

  /** Step 3: accepted rows through the existing write path; evidence in t2_narx_dalil. */
  async function yoz() {
    const y = qabulYuki(rows, hudud);
    if (!y.narxlar.length) return;
    setBand(true); setXato(''); setNatija('');
    try {
      const kun = new Date().toISOString().slice(0, 10);
      let reestrId: number | null = null;
      if (y.reestr.length) {
        const r = await sbNarxManbaYoz({ kompaniyaId, operationId: op.current.reestr, rejim: 'almashtir',
          malumot: { tur: 'boshqa', nom: `Internet narxlari (AI) ${kun}`, sana: kun, region: hudud, nds_holati: 'nds_siz',
            izoh: 'Ommaviy narxlash: tekshirilgan internet manbalari va tahrirlangan narxlar (QQS siz; havola va sana har qatorda)' },
          qatorlar: y.reestr.map(x => ({ nom: x.nom, birlik: x.birlik, narx: x.narx, izoh: x.izoh, hudud: x.hudud, nds_holati: x.nds_holati })) });
        if (!r.ok || !r.id) throw new Error(r.error || r.sabab || t('Narx reestriga yozilmadi'));
        reestrId = r.id;
      }
      const n = await sbT2SmetaNarxlaRes({ kompaniyaId, obyektId, operationId: op.current.narx, narxlar: y.narxlar, nolHam });
      if (!n.ok) throw new Error(n.error || n.code || t('Narxlash bajarilmadi.'));
      const dalil = [...y.dalil];
      if (reestrId != null) {
        const tk = await sbNarxTakliflarOl(kompaniyaId, obyektId);
        const kerak = new Map(rows.filter(r => y.reestrKalitlar.includes(r.guruh.kalit)).flatMap(r => r.guruh.qatorIds.map(id => [id, r.guruh.kalit] as const)));
        for (const x of (tk.qatorlar ?? []) as NarxTaklif[]) if (x.manba_id === reestrId && kerak.has(x.qator_id) && !dalil.some(d => d.qator_id === x.qator_id))
          dalil.push({ qator_id: x.qator_id, manba_qator_id: x.manba_qator_id, izoh: 'Ommaviy narxlash · Internet (reestr)' });
      }
      let boglandi = 0;
      for (let i = 0; i < dalil.length; i += 5000) {
        const b = await sbNarxDalilBogla(kompaniyaId, obyektId, dalil.slice(i, i + 5000));
        if (b.ok) boglandi += b.boglandi ?? 0;
      }
      // Every decision teaches the platform (fire-and-forget, never blocks the write).
      void narxTajribaYoz(kompaniyaId, rows.filter(r => r.taklif && r.holat !== 'kutilmoqda').map(r => ({
        resurs: resursKalit(r.guruh.nom, r.guruh.birlik), manba: (r.taklif!.manbalar[0]?.url ?? r.taklif!.manbalar[0]?.nom ?? 'manba').slice(0, 300),
        tur: r.taklif!.daraja === 'reestr' ? 'qolda' as const : r.taklif!.daraja, narx: yakuniyNarx(r) ?? undefined, holat: r.holat === 'qabul' ? 'qabul' as const : 'rad' as const }))).catch(() => null);
      setNatija(t('{y} qator narxlandi, {d} ta dalil bog‘landi; {q} qator narxsiz qoldi.', { y: String(n.yozildi ?? 0), d: String(boglandi), q: String(n.narxsiz_qoldi ?? 0) }));
      setBosqich('yozildi');
      await onYangilandi?.();
    } catch (e) { setXato(e instanceof Error ? e.message : String(e)); }
    finally { setBand(false); }
  }

  const topildi = rows.filter(r => r.taklif).length;
  const qabulSoni = rows.filter(r => r.holat === 'qabul' && yakuniyNarx(r) != null).length;
  const yuqoriSoni = rows.filter(r => r.holat === 'kutilmoqda' && r.taklif?.ishonch === 'yuqori').length;

  if (!navbat.length) return null;
  return <section className="fz-card" aria-live="polite">
    <div className="fz-card__head">
      <h3 className="fz-card__title">{t('Barcha narxsiz qatorlarni narxlash')}</h3>
      <p className="fz-card__sub">{t('{g} ta resurs ({q} smeta qatori) narxsiz. Tartib: kompaniya reestri → katalog → КП → internet. Narxlar QQS siz.', { g: String(navbat.length), q: String(qatorSoni) })}</p>
    </div>
    <div className="fz-card__body flex flex-col gap-3">
      {bosqich === 'boshi' && <div><button type="button" className="fz-btn fz-btn--primary fz-btn--lg" disabled={band} onClick={() => void tayyorla()}>
        {band ? t('Manbalar o‘qilmoqda…') : t('Barcha narxsiz qatorlarni narxlash')}</button></div>}

      {bosqich === 'tayyor' && <div className="fz-note fz-note--info flex flex-col gap-2">
        <p>{t('Mahalliy manbalardan (bepul): {n} ta resurs. Internetdan qidiriladi: {i} ta.', { n: String(topildi), i: String(internetKerak.length) })}</p>
        {internetKerak.length > 0 && <p><b>{tokenBaho != null ? t('Taxminiy narx: ~{t} token (shu oy qidirilganlari bepul).', { t: String(tokenBaho) }) : t('Taxminiy narx: har resurs uchun bitta AI qidiruv (shu oy qidirilganlari bepul).')}</b></p>}
        <div className="flex flex-wrap gap-2">
          {internetKerak.length > 0 && <button type="button" className="fz-btn fz-btn--primary" onClick={() => void internetdanQidir()}>{t('Internetdan qidirishni boshlash')}</button>}
          <button type="button" className="fz-btn" onClick={() => setBosqich('korik')}>{internetKerak.length > 0 ? t('Internetsiz ko‘rib chiqish') : t('Ko‘rib chiqish')}</button>
        </div>
      </div>}

      {bosqich === 'ishlamoqda' && <div role="status">
        <p className="text-[13px]">{t('Internetdan qidirilmoqda: {a} / {b}', { a: String(jarayon.tayyor), b: String(jarayon.jami) })}</p>
        <progress className="w-full" max={Math.max(1, jarayon.jami)} value={jarayon.tayyor} aria-label={t('Narxlash jarayoni')} />
      </div>}

      {xato && <p role="alert" className="fz-note fz-note--danger">{xato}</p>}
      {natija && <p role="status" className="fz-note border-ok/40 bg-[var(--ok-soft)] text-[13px]">{natija}</p>}

      {(bosqich === 'korik' || bosqich === 'ishlamoqda') && rows.length > 0 && <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="fz-chip">{t('Taklif bor: {n} / {m}', { n: String(topildi), m: String(rows.length) })}</span>
          <button type="button" className="fz-btn" disabled={!yuqoriSoni || bosqich !== 'korik'} onClick={() => setRows(yuqorilarniQabul)}>{t('Yuqori ishonchlilarni qabul qilish ({n})', { n: String(yuqoriSoni) })}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={band || !qabulSoni || bosqich !== 'korik'} onClick={() => void yoz()}>{t('Qabul qilinganlarni yozish ({n})', { n: String(qabulSoni) })}</button>
        </div>
        <div className="fz-table-wrap max-h-[60vh] overflow-auto">
          <table className="fz-table text-[12px]">
            <thead><tr>
              <th>{t('Resurs')}</th><th>{t('Birlik')}</th><th className="text-right">{t('Hajm')}</th><th className="text-right">{t('Qatorlar')}</th>
              <th className="text-right">{t('Taklif narxi (QQS siz)')}</th><th>{t('Manbalar')}</th><th>{t('Ishonch')}</th><th>{t('Qaror')}</th>
            </tr></thead>
            <tbody>
              {rows.map(r => { const tk = r.taklif; return <tr key={r.guruh.kalit} className={r.holat === 'rad' ? 'opacity-50' : ''}>
                <td className="max-w-[320px]">{r.guruh.nom}{r.guruh.nolNarxli > 0 && <span className="fz-chip fz-chip--warn ml-1">{t('narx 0')}</span>}</td>
                <td>{r.guruh.birlik}</td>
                <td className="text-right tabular-nums">{son(r.guruh.hajm)}</td>
                <td className="text-right tabular-nums">{r.guruh.qatorIds.length}</td>
                <td className="text-right">
                  <input className="input h-7 w-28 px-1 text-right tabular-nums" inputMode="decimal" aria-label={t('Narxni tahrirlash')}
                    placeholder={tk ? son(tk.narx) : '—'} value={r.tahrir ?? ''} onChange={e => tahrirla(r.guruh.kalit, e.target.value)} />
                </td>
                <td className="max-w-[300px]">
                  {tk ? <>
                    <span className="fz-chip mr-1">{t(DARAJA_NOMI[tk.daraja])}</span>
                    {tk.manbalar.map((m, i) => <div key={i} className="truncate">
                      {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">{m.nom}</a> : m.nom}
                      {' · '}{son(m.narx)}{m.izoh ? ` · ${m.izoh}` : ''}</div>)}
                    {tk.izoh && <div className="text-text-dim">{tk.izoh}</div>}
                  </> : <span className="text-text-dim">{r.sabab ?? (internetgaMumkin(r.guruh) ? t('mahalliy manbada yo‘q') : t('mehnat/mashina — internetga yuborilmaydi'))}</span>}
                </td>
                <td>{tk && <span className={`fz-chip ${tk.ishonch === 'yuqori' ? 'fz-chip--ok' : 'fz-chip--warn'}`}>{tk.ishonch === 'yuqori' ? t('yuqori') : t('o‘rta')}</span>}
                  {tk?.tarqoq != null && tk.tarqoq > 0.3 && <span className="fz-chip fz-chip--warn ml-1">{t('tarqoqlik {p}%', { p: String(Math.round(tk.tarqoq * 100)) })}</span>}</td>
                <td className="whitespace-nowrap">
                  <button type="button" className={`fz-btn fz-btn--sm ${r.holat === 'qabul' ? 'fz-btn--primary' : ''}`} disabled={yakuniyNarx(r) == null} onClick={() => holat(r.guruh.kalit, 'qabul')}>{t('Qabul')}</button>
                  <button type="button" className="fz-btn fz-btn--sm ml-1" onClick={() => holat(r.guruh.kalit, 'rad')}>{t('Rad')}</button>
                </td>
              </tr>; })}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  </section>;
}
