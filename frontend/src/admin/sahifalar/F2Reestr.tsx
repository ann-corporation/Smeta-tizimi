/**
 * F2 REESTRI — butun kompaniya bo'yicha F2 holati bitta joyda (egasi 2026-10-21). Har obyekt: loyiha, shartnoma, smeta,
 * tasdiqlangan F2 (o'tgan davr importi va tizimda tayyorlangan alohida), jarayondagi / rad etilgan / bekor qilingan F2,
 * oxirgi oy va ogohlantirishlar. Qator ochilsa — aktlar ro'yxati (qaysi fayldan import qilingan), akt yozilmagan import
 * fayllari va obyektning F2 tarixiga havola. Faqat o'qish.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { FmtN, pulQisqa } from '../../lib/format';
import { t } from '../../i18n/til';
import { f2ReestrOl, obyektF2Fayllari, type ReestrMalumot } from '../../api/t2-f2-reestr';
import type { CenterDocument } from '../../api/t2-hujjat-canonical';
import { aktsizFayllar, bosqich, filtrla, reestrQur, tartibla, type F2Bosqich, type Ogoh, type ReestrAkt, type ReestrFiltr, type Summa } from '../../lib/f2-reestr/reestr';

const BOSQICH_NOMI: Record<F2Bosqich, string> = { tasdiqlangan: 'Tasdiqlangan', jarayonda: 'Jarayonda', rad: 'Rad etilgan', bekor: 'Bekor qilingan' };
const BOSQICH_RANG: Record<F2Bosqich, string> = { tasdiqlangan: 'text-ok', jarayonda: 'text-warn', rad: 'text-danger', bekor: 'text-text-mute' };

/** Ma'lum summa + noma'lumlar soni (NULL ≠ 0). */
function SummaKorinish({ s, qisqa = false }: { s: Summa; qisqa?: boolean }) {
  if (!s.soni) return <span className="text-text-mute">—</span>;
  return <span className="tabular-nums">{qisqa ? pulQisqa(s.malum) : <FmtN val={s.malum} />}
    {s.nomalum > 0 && <span className="ml-1 text-[11px] text-warn">{t('+ {n} ta summasi noma’lum', { n: s.nomalum })}</span>}</span>;
}
function ogohMatni(o: Ogoh): string {
  if (o.tur === 'shartnomadan_oshgan') return t('F2 shartnomadan {k} baravar ko‘p — shartnoma summasi yoki biriktirishni tekshiring', { k: String(o.qiymat ?? '').replace('.', ',') });
  if (o.tur === 'oy_takror') return t('{n} oyda bir nechta tasdiqlangan F2', { n: o.qiymat ?? 0 });
  if (o.tur === 'summa_nomalum') return t('{n} ta F2 ning summasi noma’lum', { n: o.qiymat ?? 0 });
  return t(o.matn);
}
function ManbaBelgi({ a, fayl }: { a: ReestrAkt; fayl: string | null }) {
  if (a.manba === 'import') return <span className="text-text-dim">{t('Import')}{fayl ? ` · ${fayl}` : a.hujjat_id ? ` · ${t('hujjat №{n}', { n: a.hujjat_id })}` : ''}</span>;
  if (a.manba === 'tizim') return <span className="text-accent">{t('Tizimda yasalgan')}</span>;
  return <span className="text-warn">{t('aniqlanmadi')}</span>;
}

export default function F2Reestr() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const contextVersion = useRef(0);
  const requestVersion = useRef(0);
  useEffect(() => {
    contextVersion.current++;
    return () => { contextVersion.current++; requestVersion.current++; };
  }, [kompaniyaId]);
  const [malumot, setMalumot] = useState<ReestrMalumot | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [filtr, setFiltr] = useState<ReestrFiltr>({ bosqich: 'hammasi', matn: '', faqatMuammo: false });
  const [ochiq, setOchiq] = useState<Set<number>>(new Set());
  const [fayllar, setFayllar] = useState<Map<number, CenterDocument[] | 'xato' | 'yuklanmoqda'>>(new Map());

  const yukla = useCallback(async () => {
    if (kompaniyaId == null) return;
    const version = ++requestVersion.current;
    setYuklanmoqda(true); setXato('');
    try { const result = await f2ReestrOl(kompaniyaId); if (version === requestVersion.current) setMalumot(result); }
    catch (e) { if (version === requestVersion.current) setXato(e instanceof Error ? e.message : String(e)); }
    finally { if (version === requestVersion.current) setYuklanmoqda(false); }
  }, [kompaniyaId]);
  useEffect(() => { setMalumot(null); setOchiq(new Set()); setFayllar(new Map()); void yukla(); }, [yukla]);

  const reestr = useMemo(() => (malumot ? reestrQur(malumot) : null), [malumot]);
  const qatorlar = useMemo(() => (reestr ? tartibla(filtrla(reestr.qatorlar, filtr)) : []), [reestr, filtr]);

  function ochYop(obyektId: number) {
    setOchiq(s => { const x = new Set(s); if (x.has(obyektId)) x.delete(obyektId); else x.add(obyektId); return x; });
    if (kompaniyaId != null && !fayllar.has(obyektId)) {
      const version = contextVersion.current;
      setFayllar(m => new Map(m).set(obyektId, 'yuklanmoqda'));
      obyektF2Fayllari(kompaniyaId, obyektId)
        .then(l => { if (version === contextVersion.current) setFayllar(m => new Map(m).set(obyektId, l)); })
        .catch(() => { if (version === contextVersion.current) setFayllar(m => new Map(m).set(obyektId, 'xato')); });
    }
  }

  const j = reestr?.jami;
  return <Sahifa sarlavha={t('F2 reestri')} tavsif={t('Kompaniyaning barcha obyektlari bo‘yicha F2: shartnoma, import qilingan va tizimda yasalgan aktlar, summalar va holat')}
    amallar={<button type="button" onClick={() => void yukla()} disabled={yuklanmoqda || kompaniyaId == null} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50">
      <RefreshCw size={14} className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}>
    <div className="flex flex-col gap-3">
      {kompaniyaId == null && <section className="karta p-4 text-[13px] text-text-dim">{t('Avval kompaniyani tanlang.')}</section>}
      {xato && <section role="alert" className="karta border-danger/40 bg-danger/5 p-4 text-[13px] text-danger">{t('F2 reestri o‘qilmadi: {x}', { x: xato })}</section>}
      {yuklanmoqda && !reestr && <section className="karta p-4 text-[13px] text-text-dim">{t('F2 aktlari, shartnomalar va import manbalari o‘qilmoqda…')}</section>}

      {j && <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="karta p-3"><div className="text-[11px] text-text-dim">{t('Obyektlar')}</div><div className="text-lg font-semibold">{j.obyekt}</div>
          <div className="text-[11px] text-text-mute">{t('F2 si bor: {n}', { n: reestr!.qatorlar.filter(q => q.aktlar.length).length })}</div></div>
        <div className="karta p-3"><div className="text-[11px] text-text-dim">{t('Tasdiqlangan F2')}</div><div className="text-lg font-semibold"><SummaKorinish s={j.boyicha.tasdiqlangan} qisqa /></div>
          <div className="text-[11px] text-text-mute">{t('{n} ta akt', { n: j.boyicha.tasdiqlangan.soni })}</div></div>
        <div className="karta p-3"><div className="text-[11px] text-text-dim">{t('Shundan: import (o‘tgan davr)')}</div><div className="text-lg font-semibold"><SummaKorinish s={j.tasdiqImport} qisqa /></div>
          <div className="text-[11px] text-text-mute">{t('tizimda yasalgan: {s}', { s: pulQisqa(j.tasdiqTizim.malum) })}</div></div>
        <div className="karta p-3"><div className="text-[11px] text-text-dim">{t('Jarayonda')}</div><div className="text-lg font-semibold">{j.boyicha.jarayonda.soni}</div>
          <div className="text-[11px] text-text-mute"><SummaKorinish s={j.boyicha.jarayonda} qisqa /></div></div>
        <div className="karta p-3"><div className="text-[11px] text-text-dim">{t('Rad etilgan / bekor')}</div><div className="text-lg font-semibold">{j.boyicha.rad.soni} / {j.boyicha.bekor.soni}</div></div>
        <div className="karta p-3"><div className="text-[11px] text-text-dim">{t('Shartnomasiz obyekt (F2 bilan)')}</div><div className={`text-lg font-semibold ${j.shartnomasiz ? 'text-warn' : ''}`}>{j.shartnomasiz}</div></div>
      </section>}
      {malumot && malumot.manbaXato > 0 && <p role="status" className="text-[12px] text-warn">{t('{n} ta aktning manbasi o‘qilmadi — ular «aniqlanmadi» deb ko‘rsatilgan.', { n: malumot.manbaXato })}</p>}

      {reestr && <section className="karta flex flex-wrap items-end gap-3 p-3 text-[12px]">
        <label className="min-w-[220px] flex-1">{t('Qidirish')}
          <input aria-label={t('Obyekt, loyiha yoki shartnoma')} value={filtr.matn} onChange={e => setFiltr({ ...filtr, matn: e.target.value })} className="input mt-1 block h-8 w-full" /></label>
        <label>{t('Holat')}
          <select aria-label={t('F2 holati')} value={filtr.bosqich} onChange={e => setFiltr({ ...filtr, bosqich: e.target.value as ReestrFiltr['bosqich'] })} className="input mt-1 block h-8">
            <option value="hammasi">{t('Hammasi')}</option>
            {(Object.keys(BOSQICH_NOMI) as F2Bosqich[]).map(b => <option key={b} value={b}>{t(BOSQICH_NOMI[b])}</option>)}
            <option value="f2siz">{t('F2 si yo‘q obyektlar')}</option>
          </select></label>
        <label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={filtr.faqatMuammo} onChange={e => setFiltr({ ...filtr, faqatMuammo: e.target.checked })} /> {t('Faqat e’tibor talab qiladiganlar')}</label>
        <span className="pb-1.5 text-text-mute">{t('{a} / {b} obyekt', { a: qatorlar.length, b: reestr.qatorlar.length })}</span>
      </section>}

      {reestr && <section className="karta overflow-auto p-0">
        <table className="w-full min-w-[960px] text-[12.5px]">
          <thead className="bg-surface-2/60 text-left text-[11px] text-text-dim"><tr>
            <th className="w-6 px-2 py-2" /><th className="px-2">{t('Obyekt')}</th><th className="px-2">{t('Shartnoma')}</th>
            <th className="px-2 text-right">{t('Smeta')}</th><th className="px-2 text-right">{t('Tasdiqlangan F2')}</th>
            <th className="px-2 text-right">{t('Import / tizimda')}</th><th className="px-2 text-center">{t('Jarayonda · rad · bekor')}</th>
            <th className="px-2">{t('Oxirgi oy')}</th>
          </tr></thead>
          <tbody>
            {qatorlar.map(q => {
              const o = ochiq.has(q.obyekt.id);
              const fl = fayllar.get(q.obyekt.id);
              const nomi = new Map([...malumot!.faylNomlari, ...(Array.isArray(fl) ? fl : []).map(d => [Number(d.id), d.filename] as const)]);
              return <Fragment key={q.obyekt.id}>
                <tr className="cursor-pointer border-t border-border/60 align-top hover:bg-surface-2/40" onClick={() => ochYop(q.obyekt.id)}>
                  <td className="px-2 py-2 text-text-mute">{o ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td className="px-2 py-2"><div className="font-medium text-text">{q.obyekt.nom}</div>
                    {q.loyiha && <div className="text-[11px] text-text-mute">{q.loyiha}</div>}
                    {q.ogohlar.map((g, i) => <div key={i} className="text-[11px] text-warn">{ogohMatni(g)}</div>)}</td>
                  <td className="px-2 py-2">{q.shartnomalar.length ? q.shartnomalar.map(s => <div key={s.id}>№ {s.raqam}{s.nom ? ` · ${s.nom}` : ''}
                    <span className="ml-1 text-[11px] text-text-mute">{s.jami_nds_bilan != null ? pulQisqa(s.jami_nds_bilan) : t('summa yo‘q')}</span></div>)
                    : <span className="text-text-mute">{t('biriktirilmagan')}</span>}</td>
                  <td className="px-2 py-2 text-right">{q.obyekt.jami != null ? pulQisqa(q.obyekt.jami) : <span className="text-text-mute">—</span>}
                    {(q.obyekt.narxsiz ?? 0) > 0 && <div className="text-[11px] text-warn">{t('{n} narxsiz qator', { n: q.obyekt.narxsiz ?? 0 })}</div>}</td>
                  <td className="px-2 py-2 text-right"><SummaKorinish s={q.boyicha.tasdiqlangan} qisqa />
                    {q.boyicha.tasdiqlangan.soni > 0 && <div className="text-[11px] text-text-mute">{t('{n} ta akt', { n: q.boyicha.tasdiqlangan.soni })}</div>}</td>
                  <td className="px-2 py-2 text-right text-[12px]"><div><SummaKorinish s={q.tasdiqImport} qisqa /></div><div className="text-accent"><SummaKorinish s={q.tasdiqTizim} qisqa /></div></td>
                  <td className="px-2 py-2 text-center tabular-nums"><span className="text-warn">{q.boyicha.jarayonda.soni}</span> · <span className="text-danger">{q.boyicha.rad.soni}</span> · <span className="text-text-mute">{q.boyicha.bekor.soni}</span></td>
                  <td className="px-2 py-2">{q.oxirgiOy ? q.oxirgiOy.slice(0, 7) : <span className="text-text-mute">{t('F2 yo‘q')}</span>}</td>
                </tr>
                {o && <tr className="bg-surface-2/30"><td /><td colSpan={7} className="px-2 pb-3 pt-1">
                  {q.aktlar.length ? <table className="w-full text-[12px]">
                    <thead className="text-left text-[11px] text-text-dim"><tr><th className="py-1">{t('Oy')}</th><th>{t('Raqam')}</th><th>{t('Manba')}</th><th>{t('Holat')}</th>
                      <th className="text-right">{t('Summa')}</th><th className="text-right">{t('Qatorlar')}</th></tr></thead>
                    <tbody>{q.aktlar.map(a => { const b = bosqich(a); return <tr key={a.id} className="border-t border-border/40">
                      <td className="py-1">{a.oy.slice(0, 7)}</td><td>{a.raqam ?? <span className="text-text-mute">—</span>}</td>
                      <td><ManbaBelgi a={a} fayl={a.hujjat_id != null ? nomi.get(a.hujjat_id) ?? null : null} /></td>
                      <td className={BOSQICH_RANG[b]}>{t(BOSQICH_NOMI[b])}</td>
                      <td className="text-right">{a.hujjat_jami != null ? <FmtN val={a.hujjat_jami} /> : <span className="text-warn">{t('noma’lum')}</span>}</td>
                      <td className="text-right tabular-nums">{a.qator_soni ?? '—'}{(a.narxsiz_qator ?? 0) > 0 && <span className="ml-1 text-warn">{t('({n} narxsiz)', { n: a.narxsiz_qator ?? 0 })}</span>}</td>
                    </tr>; })}</tbody>
                  </table> : <p className="text-[12px] text-text-mute">{t('Bu obyektda F2 akt yo‘q.')}</p>}
                  {fl === 'yuklanmoqda' && <p className="mt-2 text-[11px] text-text-mute">{t('Import fayllari o‘qilmoqda…')}</p>}
                  {fl === 'xato' && <p className="mt-2 text-[11px] text-warn">{t('Import fayllari ro‘yxati o‘qilmadi.')}</p>}
                  {Array.isArray(fl) && aktsizFayllar(fl, q.aktlar).length > 0 && <div className="mt-2 text-[12px]">
                    <div className="text-[11px] font-semibold text-text-dim">{t('Akt yozilmagan import fayllari (ish qoralamasi yoki tugallanmagan import)')}</div>
                    {aktsizFayllar(fl, q.aktlar).map(d => <div key={d.id} className="text-text-dim">{d.filename} <span className="text-[11px] text-text-mute">· {d.updatedAt.slice(0, 10)}</span></div>)}
                  </div>}
                  <Link to={`/admin/f2-tarix?obyekt=${q.obyekt.id}`} className="mt-2 inline-block text-[12px] text-accent underline">{t('Obyektning F2 tarixini ochish')}</Link>
                </td></tr>}
              </Fragment>;
            })}
          </tbody>
        </table>
      </section>}
    </div>
  </Sahifa>;
}
