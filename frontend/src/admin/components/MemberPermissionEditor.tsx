import { useState } from 'react';
import { useTil } from '../../i18n/til';
import type { AzolikRuxsat, AzolikRuxsatSetInput } from '../../api/t2-men';
import { PERMISSIONS } from '../../lib/company-authorization/effective-authorization';
import { PERMISSION_LABELS } from '../../lib/company-authorization/permission-labels';

const CATALOG=PERMISSIONS.filter(p=>!p.startsWith('control.global'));
const MANAGEMENT=new Set(['company.member.manage','control.company.write','company.profile.update']);
export function MemberPermissionEditor({member,companyId,pending,onSave}:{member:AzolikRuxsat;companyId:number;pending:boolean;onSave:(input:AzolikRuxsatSetInput)=>void}) {
  const {t}=useTil();
  const effective=new Set<string>(member.effective_permissions??[]);
  const inherited=new Set<string>(member.base_permissions??[]);
  const initial=()=>Object.fromEntries(CATALOG.map(p=>[p,effective.has(p)]));
  const [values,setValues]=useState<Record<string,boolean>>(initial);
  const [baseVersion,setBaseVersion]=useState(member.ruxsat_versiya);
  const conflict=member.ruxsat_versiya!==baseVersion;
  const dirty=CATALOG.some(p=>values[p]!==initial()[p]);
  if (member.protected) return <p className="text-sm text-text-dim">{t("Bu hisobning boshqaruv vakolati himoyalangan. Superadmin — platforma bo‘yicha, rahbar — kompaniya bo‘yicha to‘liq vakolatga ega.")}</p>;
  if (!member.effective_permissions || member.ruxsat_versiya==null) return <p className="text-sm text-amber-300">{t("Yangi ruxsat modeli yuklanmadi. Sahifani yangilang.")}</p>;
  return <section aria-label={t("Individual ruxsatlar")} className="mt-3 space-y-3">
    {conflict&&<p role="alert" className="text-amber-300">{t("Boshqa boshqaruvchi ruxsatlarni yangilagan. Saqlanmagan belgilaringiz saqlanib turibdi; «Bekor qilish» orqali joriy holatni yuklang.")}</p>}
    <p className="text-xs text-text-dim">{t("Belgini olib tashlasangiz, lavozimdan berilgan huquq ham o‘chadi. O‘zgarishlar «Saqlash» bosilgandan keyin kuchga kiradi.")}</p>
    <div className="grid gap-2 md:grid-cols-2">{CATALOG.map(p=>{
      const base=inherited.has(p);
      return <label key={p} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
        <input type="checkbox" checked={!!values[p]} disabled={pending||(MANAGEMENT.has(p)&&!values[p])} onChange={e=>setValues({...values,[p]:e.target.checked})}/>
        <span>{t(PERMISSION_LABELS[p])}<small className="block text-text-mute">{MANAGEMENT.has(p)?t("Rahbar yoki administrator lavozimi kerak"):values[p]===base?(base?t("Lavozim standarti: ruxsat bor"):t("Lavozim standarti: ruxsat yo‘q")):(values[p]?t("Individual ruxsat"):t("Individual taqiq"))}</small></span>
      </label>;
    })}</div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-aksent" disabled={pending||!dirty||conflict} onClick={()=>onSave({kompaniya_id:companyId,azolik_id:member.azolik_id,expected_version:baseVersion!,permissions:values,operation_id:crypto.randomUUID()})}>{pending?t("Saqlanmoqda…"):t("Saqlash")}</button>
      <button type="button" disabled={pending||(!dirty&&!conflict)} onClick={()=>{setValues(initial());setBaseVersion(member.ruxsat_versiya);}}>{t("Bekor qilish")}</button>
      <button type="button" disabled={pending} onClick={()=>setValues(Object.fromEntries(CATALOG.map(p=>[p,inherited.has(p)])))}>{t("Lavozim standartiga qaytarish")}</button>
      <span role="status" className="text-xs text-text-dim">{dirty?t("Saqlanmagan o‘zgarishlar bor"):t("Saqlangan ruxsatlar")}</span>
    </div>
  </section>;
}
