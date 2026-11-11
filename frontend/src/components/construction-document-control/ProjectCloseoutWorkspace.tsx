import type { CloseoutReportRow, WorkbenchException } from '../../lib/construction-document-control';
const REQUIREMENT_LABEL: Record<string, string> = { contract: 'Shartnoma', f2: 'F2 hujjati', nakopitelniy: 'Nakopitelniy', aosr: 'AOSR', change_evidence: 'O‘zgarish dalili', forma3: 'To‘lov sertifikatsiyasi' };
const STATUS_LABEL: Record<string, string> = { required: 'Talab qilinadi', present: 'Mavjud', pending: 'Kutilmoqda', approved: 'Tasdiqlangan', rejected: 'Rad etilgan', superseded: 'Yangisi bilan almashtirilgan', missing: 'Yetishmaydi', unresolved: 'Aniqlashtirish kerak' };
const EXCEPTION_LABEL: Record<string, string> = { OVER_CERTIFICATION: 'Tasdiqlangan hajm limitdan oshgan', MISSING_BASELINE_PRICE: 'Boshlang‘ich narx manbasi yo‘q', MISSING_BASELINE_QUANTITY: 'Boshlang‘ich hajm manbasi yo‘q', DOCUMENT_MISSING: 'Majburiy hujjat yetishmaydi', DOCUMENT_SUPERSEDED: 'Hujjat yangisi bilan almashtirilgan', PENDING_CHANGE: 'O‘zgarish hali tasdiqlanmagan' };
const REASON_LABEL: Record<string, string> = { 'Evidence awaiting approval.': 'Dalil bor, tasdiqlash kutilmoqda.', 'Evidence rejected.': 'Dalil rad etilgan.', 'Only superseded evidence exists.': 'Faqat eskirgan (almashtirilgan) hujjat bor.', 'Required evidence missing.': 'Majburiy hujjat yetishmaydi.', 'Optional requirement.': 'Majburiy emas.', FORMA3_RULE_UNRESOLVED: 'Forma 3 qoidalari hali aniqlanmagan.','Approved evidence present.': 'Tasdiqlangan dalil mavjud.', 'Required evidence is missing.': 'Talab qilinadigan dalil yetishmaydi.', 'Approval is still pending.': 'Tasdiqlash hali kutilmoqda.', 'The latest document supersedes the previous one.': 'Oldingi hujjat yangisi bilan almashtirilgan.', 'Forma-3 rule pack is unresolved.': 'Forma-3 qoidalar to‘plami aniqlashtirilmagan.' };
const requirementLabel = (value: string) => REQUIREMENT_LABEL[value] ?? 'Hujjat talabi';
const statusLabel = (value: string) => STATUS_LABEL[value] ?? 'Holat qayd etilgan';
const exceptionLabel = (value: string) => EXCEPTION_LABEL[value] ?? 'Tekshiruv istisnosi';
const reasonLabel = (value: string) => REASON_LABEL[value] ?? value.replaceAll('_', ' ');
export function ProjectCloseoutMatrix({rows}:{rows:readonly CloseoutReportRow[]}){return <section aria-label="Loyiha yopilish matritsasi" className="rounded-xl border border-white/10 p-4"><h2 className="font-medium">Loyiha yopilish holati</h2><ul className="mt-2 space-y-1 text-sm">{rows.map(r=><li key={r.requirement} className={r.blocking?'text-red-200':''}>{requirementLabel(r.requirement)}: <b>{statusLabel(r.status)}</b> — {reasonLabel(r.reason)}</li>)}</ul></section>}
export function MissingDocumentsPanel({rows}:{rows:readonly CloseoutReportRow[]}){return <section aria-label="Yetishmayotgan hujjatlar" className="rounded-xl border border-amber-500/30 p-4"><h2>Yetishmayotgan hujjatlar</h2>{rows.filter(r=>r.status==='missing'||r.status==='superseded'||r.status==='unresolved').map(r=><p key={r.requirement} className="mt-1 text-sm">{requirementLabel(r.requirement)}: {reasonLabel(r.reason)}</p>)}</section>}
/** Dasturchi kodlari o‘rniga: nima qilish kerak — oddiy o‘zbekcha. */
const ACTION_BY_CODE: Record<string, string> = {
  OVER_CERTIFICATION: 'Tasdiqlangan hajmni ruxsat etilgan hajm bilan solishtirib tuzating.',
  MISSING_CERTIFIED_AMOUNT: 'Tasdiqlangan F2 hujjatidagi aniq summani qayta kiriting (hajm × narx bilan almashtirmang).',
  MISSING_BASELINE_PRICE: 'Smeta narxi manbasini ko‘rsating yoki narxni kiriting.',
  MISSING_BASELINE_QUANTITY: 'Smeta hajmi manbasini ko‘rsating yoki hajmni kiriting.',
  DOCUMENT_MISSING: 'Kerakli hujjatni yuklang yoki tasdiqlang.',
  DOCUMENT_SUPERSEDED: 'Hujjatning joriy (yangi) nusxasini yuklang yoki tasdiqlang.',
};
const PROBLEM_BY_CODE: Record<string, string> = { ...EXCEPTION_LABEL, MISSING_CERTIFIED_AMOUNT: 'Tasdiqlangan summa kiritilmagan' };
const REQUIREMENT_NAME = (id: string) => { const k = Object.keys(REQUIREMENT_LABEL).find((x) => id.toLowerCase().includes(x)); return k ? REQUIREMENT_LABEL[k] : null; };
/** Bir xil muammolar bitta qatorga guruhlanadi: nechta, qaysi ish/hujjat, nima qilish kerak. */
export function BlockingIssuesPanel({issues,nomlar={}}:{issues:readonly WorkbenchException[];nomlar?:Readonly<Record<string,string>>}){
  const guruh=new Map<string,WorkbenchException[]>();
  for(const i of issues){const g=guruh.get(i.code)??[];g.push(i);guruh.set(i.code,g);}
  return <section aria-label="Bloklovchi istisnolar" className="rounded-xl border border-red-500/30 p-4"><h2>Tekshiruv istisnolari</h2>
    {[...guruh.entries()].map(([code,list])=>{
      const nom=list.map(i=>nomlar[i.entityId]??REQUIREMENT_NAME(i.entityId)).filter((x):x is string=>!!x);
      const ko=[...new Set(nom)].slice(0,4);
      return <div key={code} className="mt-2 text-sm"><b>{PROBLEM_BY_CODE[code]??'Tekshiruv istisnosi'}</b> — {list.length} ta
        {ko.length>0&&<span className="text-text-dim"> (masalan: {ko.join('; ')}{nom.length>ko.length?' va boshqalar':''})</span>}
        <div className="text-text-dim">{ACTION_BY_CODE[code]??'Kerakli ma’lumot yoki hujjatni kiriting.'}</div></div>;
    })}
  </section>}
export function PeriodReconciliationPanel({rows}:{rows:readonly CloseoutReportRow[]}){return <ProjectCloseoutMatrix rows={rows}/>}
