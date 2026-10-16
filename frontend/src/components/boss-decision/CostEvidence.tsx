import { useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { finite, rowArithmetic } from './model';
import { leafSummary, scopeRows, type ObjectEvidence } from './report';
const nf=new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:8});
const n=(v:unknown)=>finite(v)?nf.format(v):'—';
export default function CostEvidence({evidence,sectionId}:{evidence:ObjectEvidence;sectionId?:number}) {
  const [search,setSearch]=useState('');const [page,setPage]=useState(0);const [selected,setSelected]=useState<number|null>(null);
  const result=useMemo(()=>{try{return {rows:scopeRows(evidence,sectionId),error:false};}catch{return {rows:[],error:true};}},[evidence,sectionId]);
  const states=useMemo(()=>new Map(evidence.states.map(s=>[s.qator_id,s])),[evidence]);
  const parents=useMemo(()=>new Set(result.rows.map(r=>r.ota_id)),[result.rows]);
  const summary=useMemo(()=>leafSummary(result.rows,evidence.states),[result.rows,evidence]);
  const query=qidiruvKaliti(search);
  const leaves=result.rows.filter(r=>r.tur!=='rz'&&!parents.has(r.id));
  const sum=(r:typeof leaves[number])=>states.get(r.id)?.smeta_summa??r.summa;
  const filtered=leaves.filter(r=>!query||qidiruvKaliti(`${r.nom??''} ${r.kod??''} ${r.birlik??''}`).includes(query)).sort((a,b)=>Math.abs(sum(b)??0)-Math.abs(sum(a)??0)||a.id-b.id);
  const pages=Math.max(1,Math.ceil(filtered.length/20));const current=Math.min(page,pages-1);
  const row=result.rows.find(r=>r.id===selected);const arithmetic=row?rowArithmetic(row.hajm,row.narx,sum(row)):null;
  const byId=new Map(evidence.rows.map(r=>[r.id,r]));
  const path=(id:number)=>{const names:string[]=[];const seen=new Set<number>();let r=byId.get(id);while(r&&!seen.has(r.id)){seen.add(r.id);names.unshift(r.nom??String(r.id));r=r.ota_id==null?undefined:byId.get(r.ota_id);}return names.join(' → ');};
  if(result.error) return <p role="alert" className="rounded-xl bg-danger/10 p-4 text-danger">{t('Qatorlar zanjiri to‘liq emas. Summa isbotlangan deb ko‘rsatilmaydi.')}</p>;
  return <section className="rounded-2xl border border-accent/25 bg-accent/5 p-4 md:p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-lg">{t('Summa nimadan yig‘ilgan?')}</h3><p className="text-sm text-text-dim mt-1">{t('Faqat oxirgi qatorlar yig‘iladi. Ish va uning resurslari takror qo‘shilmaydi.')}</p></div><div className="text-right"><strong className="text-xl tabular-nums">{n(summary.estimate)} UZS</strong><p className="text-xs text-text-dim mt-1">{t('Summasi noma’lum')}: {summary.missing} / {summary.leaves}</p></div></div>
    <input value={search} onChange={ev=>{setSearch(ev.target.value);setPage(0);}} placeholder={t('Resurs yoki ish nomi')} aria-label={t('Resurs yoki ish nomi')} className="bg-surface rounded-xl border border-border px-3 py-2 w-full md:max-w-md"/>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="text-text-dim text-left"><tr><th className="pb-3">{t('Qator va hisob asosi')}</th><th className="text-right">{t('Hajm')}</th><th className="text-right">{t('Birlik narxi')}</th><th className="text-right">{t('Manba summasi')}</th></tr></thead><tbody>{filtered.slice(current*20,current*20+20).map(r=><tr key={r.id} className="border-t border-border/60"><td className="py-3 pr-4 max-w-80"><button type="button" aria-expanded={selected===r.id} className="text-left hover:text-accent hover:underline" onClick={()=>setSelected(selected===r.id?null:r.id)}>{r.nom??'—'}</button><p className="text-xs text-text-dim mt-1 truncate" title={path(r.id)}>{path(r.id)}</p></td><td className="text-right tabular-nums whitespace-nowrap">{n(r.hajm)} {r.birlik}</td><td className="text-right tabular-nums whitespace-nowrap pl-3">{n(r.narx)}</td><td className="text-right tabular-nums whitespace-nowrap pl-3">{n(sum(r))}</td></tr>)}</tbody></table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-dim"><p>{t('Ko‘rsatilgan / jami')}: {filtered.length===0?0:current*20+1}–{Math.min((current+1)*20,filtered.length)} / {filtered.length}</p><div className="flex items-center gap-3"><button className="rounded-lg border border-border px-3 py-2 disabled:opacity-30" disabled={current===0} onClick={()=>setPage(current-1)}>{t('Oldingi')}</button><span>{current+1} / {pages}</span><button className="rounded-lg border border-border px-3 py-2 disabled:opacity-30" disabled={current+1===pages} onClick={()=>setPage(current+1)}>{t('Keyingi')}</button></div></div>
    {row&&<div className="rounded-xl bg-surface border border-border p-4 space-y-3"><div className="flex justify-between items-start gap-4"><h4 className="font-semibold break-words">{row.nom}</h4><button className="text-text-dim underline text-sm" onClick={()=>setSelected(null)}>{t('Yopish')}</button></div><p className="text-xs text-text-dim break-words">{path(row.id)}</p>
      <dl className="grid gap-3 sm:grid-cols-3 text-sm"><div><dt className="text-text-dim">{t('Hajm')}</dt><dd>{n(row.hajm)} {row.birlik}</dd></div><div><dt className="text-text-dim">{t('Birlik narxi')}</dt><dd>{n(row.narx)} UZS</dd></div><div><dt className="text-text-dim">{t('Manba summasi')}</dt><dd>{n(sum(row))} UZS</dd></div></dl>
      {arithmetic?<p className={arithmetic.matches?'text-ok text-sm':'text-warn text-sm'}>{n(row.hajm)} × {n(row.narx)} = {n(arithmetic.product)} UZS. {arithmetic.matches?t('Ko‘rsatilgan aniqlikda summa mos.'):t('Manba summasi bilan farq bor. Hisob asosi va koeffitsientlar tekshirilsin.')}{!arithmetic.matches&&` ${t('Farq')}: ${n(arithmetic.difference)} UZS`}</p>:<p className="text-warn text-sm">{t('Hajm, narx yoki summa yetishmaydi — hisob to‘liq asoslangan deb berilmaydi.')}</p>}
      <p className="text-xs text-text-dim">{t('Asos')}: t2_qator #{row.id} · {t('Versiya')}: {row.versiya} · {t('Manba qatori')}: {row.xom_qator??'—'} · {t('Narx usuli')}: {row.narx_usul??'—'}</p>
      <p className="text-xs text-text-dim">{t('Bu smetada qayd etilgan qiymatlar. Narxning tashqi hujjati bu o‘qishda olinmagan; katalog narxi deb taxmin qilinmaydi.')}</p>
    </div>}
  </section>;
}
