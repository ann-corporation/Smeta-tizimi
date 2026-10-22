import { useState } from 'react';
import { t } from '../../i18n/til';
import { parseQuantityInput } from '../../lib/smeta-studio/quantity-input';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { StudioCommand } from '../../lib/smeta-studio/commands';

const templates = [
  { id: 'volume', name: 'Beton yoki qazish hajmi', unit: 'm³', fields: ['Uzunlik, m', 'Kenglik, m', 'Balandlik yoki chuqurlik, m', 'Soni'], formula: (v: string[]) => v.map(x=>`(${x})`).join('*') },
  { id: 'area', name: 'Pol, tom yoki qoplama maydoni', unit: 'm²', fields: ['Uzunlik, m', 'Kenglik, m', 'Soni'], formula: (v: string[]) => v.map(x=>`(${x})`).join('*') },
  { id: 'wall', name: 'Devorning sof maydoni', unit: 'm²', fields: ['Devor uzunligi, m', 'Devor balandligi, m', 'Ochilishlar maydoni, m²', 'Soni'], formula: (v: string[]) => `((${v[0]})*(${v[1]})-(${v[2]}))*(${v[3]})` },
  { id: 'layer', name: 'Yo‘l yoki pol qatlami hajmi', unit: 'm³', fields: ['Maydon, m²', 'Qalinlik, mm'], formula: (v: string[]) => `(${v[0]})*(${v[1]})/1000` },
  { id: 'length', name: 'Quvur yoki kabel uzunligi', unit: 'm', fields: ['Bir uchastka uzunligi, m', 'Uchastkalar soni'], formula: (v: string[]) => `(${v[0]})*(${v[1]})` },
  { id: 'mass', name: 'Profil yoki armatura massasi', unit: 'kg', fields: ['Uzunlik, m', 'Manbadagi 1 metr massasi, kg/m', 'Soni'], formula: (v: string[]) => v.map(x=>`(${x})`).join('*') },
] as const;

/** Dimensions are operator facts; the existing exact evaluator performs all arithmetic. */
export function QuantityWorkbench({doc, command, onWork}: {doc: EstimateDoc; command:(c:StudioCommand)=>boolean; onWork:(id:string)=>void}) {
  const [kind,setKind]=useState('volume'), [values,setValues]=useState<string[]>([]);
  const [custom,setCustom]=useState(''), [unit,setUnit]=useState(''), [target,setTarget]=useState('');
  const [basis,setBasis]=useState(''), [message,setMessage]=useState('');
  const template=templates.find(x=>x.id===kind);
  const formula=template ? (template.fields.every((_,i)=>values[i]?.trim()) ? template.formula(values) : '') : custom;
  const resultUnit=template?.unit ?? unit;
  let result:ReturnType<typeof parseQuantityInput> | null=null;
  try { if(formula) result=parseQuantityInput(formula); } catch { /* invalid input has no applicable result */ }
  const work=doc.occurrences[target];
  const [confirmed,setConfirmed]=useState(false);
  function change() {setMessage('');setConfirmed(false);}
  return <section className="karta space-y-4 p-4" aria-label={t('Hajm kalkulyatori')}>
    <div><h2 className="text-lg font-semibold">{t('Hajm kalkulyatori')}</h2><p className="text-sm text-text-dim">{t('O‘lchamlarni kiriting, formulani tekshiring va natijani kerakli ishga qo‘llang.')}</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3"><label className="block text-sm">{t('Hisob turi')}<select className="input mt-1 w-full" value={kind} onChange={e=>{setKind(e.target.value);setValues([]);change();}}>{templates.map(x=><option key={x.id} value={x.id}>{t(x.name)}</option>)}<option value="custom">{t('Erkin formula')}</option></select></label>
      {template ? <div className="grid grid-cols-2 gap-3">{template.fields.map((label,i)=><label key={label} className="block text-xs">{t(label)}<input className="input mt-1 w-full" inputMode="decimal" value={values[i] ?? ''} onChange={e=>{setValues(old=>{const next=[...old];next[i]=e.target.value;return next;});change();}} /></label>)}</div> : <><label className="block text-sm">{t('Formula')}<input className="input mt-1 w-full" value={custom} placeholder="(12 + 8) * 2.5 - 6" onChange={e=>{setCustom(e.target.value);change();}} /></label><label className="block text-sm">{t('Natija birligi')}<input className="input mt-1 w-full" value={unit} onChange={e=>{setUnit(e.target.value);change();}} /></label></>}
      <label className="block text-sm">{t('O‘lcham manbasi')}<input className="input mt-1 w-full" value={basis} placeholder={t('Chizma varag‘i, o‘lchov dalolatnomasi yoki hisob asosi')} onChange={e=>{setBasis(e.target.value);change();}} /></label>
      </div>
      <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-3">
        <p className="text-xs text-text-dim">{t('Hisob natijasi')}</p><p className="text-3xl font-semibold tabular-nums">{result?.qiymat ?? '—'} <span className="text-base">{resultUnit}</span></p>
        <p className="break-words font-mono text-xs">{result?.ifoda ?? (formula ? t('Formulani tekshiring') : t('Barcha o‘lchamlarni kiriting'))}</p>
        <label className="block text-sm">{t('Natija qo‘llanadigan ish')}<select className="input mt-1 w-full" value={target} onChange={e=>{setTarget(e.target.value);change();}}><option value="">{t('Ishni tanlang')}</option>{Object.values(doc.occurrences).map(w=><option key={w.id} value={w.id}>{w.source.code} · {w.source.name}</option>)}</select></label>
        {work && <p className="text-xs">{t('Ish birligi')}: {work.basis.unitLabel ?? '—'} · {t('Joriy hajm')}: {work.quantity ?? '—'}</p>}
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />{t('Natija va ishning fizik birligi mosligini tekshirdim. Hajm normaning masshtabiga bo‘linmaydi.')}</label>
        <button className="tugma tugma-asosiy px-4 py-2" disabled={!result || !work || !confirmed || !basis.trim() || !resultUnit.trim()} onClick={()=>{
          if(!result || !work) return;
          if(command({type:'SET_QUANTITY',occurrenceId:work.id,quantity:result.qiymat})) setMessage(t('Hajm ishga qo‘llandi. Bekor qilish orqali qaytarish mumkin.'));
        }}>{t('Hajmni ishga qo‘llash')}</button>
        {message && <p role="status" className="text-sm text-accent">{message}<button className="ml-2 underline" onClick={()=>onWork(target)}>{t('Ishni ko‘rish')}</button></p>}
        <p className="text-xs text-text-dim">{t('Natija joriy hajm sifatida qo‘llanadi. O‘lchamlar o‘zgarsa, qayta hisoblab qo‘llang; chizma yoki hisob dalilini loyiha hujjatlarida saqlang.')}</p>
      </div>
    </div>
  </section>;
}
