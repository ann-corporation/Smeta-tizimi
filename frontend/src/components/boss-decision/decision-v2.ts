import type {ExecutiveObject} from './model';
import {amount} from './model';

/** Presentation only; source amounts remain available unchanged in the dossier. */
export function compactMoney(value:unknown):string|null {
  const n=amount(value);
  if(n===null)return null;
  const scale=Math.abs(n)>=1e12?{by:1e12,label:'trln'}:Math.abs(n)>=1e9?{by:1e9,label:'mlrd'}:Math.abs(n)>=1e6?{by:1e6,label:'mln'}:null;
  const formatted=new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:scale?1:2}).format(scale?n/scale.by:n);
  return scale?`${formatted} ${scale.label}`:`${formatted} UZS`;
}

export type ContractEvidence={
  contractId:number;
  sourceAmount:number|null;
  /** Explicit links, with the entire linked roster read, not the selected object alone. */
  objectIds:number[];
  linksComplete:boolean;
};
export type ContractAssessment={
  contractId:number;
  sourceAmount:number|null;
  estimate:number|null;
  approved:number|null;
  estimateComplete:boolean;
  approvedComplete:boolean;
  suspiciousAmount:boolean;
  approvedExceedsContract:boolean;
  contractEstimateRatio:number|null;
  approvedContractRatio:number|null;
  shared:boolean;
};
const ratio=(numerator:number|null,denominator:number|null)=>{
  if(numerator===null||denominator===null||denominator<=0)return null;
  const r=numerator/denominator;
  return Number.isFinite(r)?r:null;
};
/** Shared contracts are compared with ALL explicitly linked objects, never allocated. */
export function assessContract(contract:ContractEvidence,objects:ExecutiveObject[]):ContractAssessment {
  const ids=new Set(contract.objectIds);
  const linked=objects.filter(o=>ids.has(o.object_id));
  const allLinked=contract.linksComplete&&ids.size>0&&linked.length===ids.size;
  const estimateComplete=allLinked&&linked.every(o=>o.estimate_missing===0&&amount(o.estimate_known)!==null);
  const approvedComplete=allLinked&&linked.every(o=>o.approved_missing===0&&amount(o.approved_known)!==null);
  const total=(key:'estimate_known'|'approved_known',complete:boolean)=>{
    if(!complete)return null;
    const sum=linked.reduce((s,o)=>s+o[key]!,0);
    return Number.isFinite(sum)?sum:null;
  };
  const estimate=total('estimate_known',estimateComplete);
  const approved=total('approved_known',approvedComplete);
  const sourceAmount=amount(contract.sourceAmount);
  const contractEstimateRatio=ratio(sourceAmount,estimate);
  const approvedContractRatio=ratio(approved,sourceAmount);
  return {contractId:contract.contractId,sourceAmount,estimate,approved,estimateComplete,approvedComplete,
    suspiciousAmount:contractEstimateRatio!==null&&contractEstimateRatio>100,
    // An explicit zero contract may be exceeded, but division by zero is never displayed.
    approvedExceedsContract:approved!==null&&sourceAmount!==null&&sourceAmount>=0&&approved>sourceAmount,
    contractEstimateRatio,approvedContractRatio,shared:ids.size>1};
}

/** No mutation of source or silent replacement of a suspicious amount. */
export function contractPresentation(contracts:ContractAssessment[]) {
  if(new Set(contracts.map(c=>c.contractId)).size!==contracts.length)throw Error('DUPLICATE_CONTRACT');
  const included=contracts.filter(c=>!c.suspiciousAmount&&c.sourceAmount!==null);
  const sum=included.reduce((s,c)=>s+c.sourceAmount!,0);
  return {known:included.length&&Number.isFinite(sum)?sum:null,
    excluded:contracts.filter(c=>c.suspiciousAmount),missing:contracts.filter(c=>c.sourceAmount===null).length};
}

/** A2 ordering is lexicographic: no quantity of cheap warnings outranks an anomaly. */
export function attentionObjects(objects:ExecutiveObject[],anomalyIds:ReadonlySet<number>=new Set()) {
  return [...objects].sort((a,b)=>Number(anomalyIds.has(b.object_id))-Number(anomalyIds.has(a.object_id))
    ||Number(b.review_count>0)-Number(a.review_count>0)
    ||b.unpriced_rows-a.unpriced_rows
    ||b.approved_missing-a.approved_missing||b.pending_changes-a.pending_changes
    ||a.name.localeCompare(b.name)||a.object_id-b.object_id);
}

/** Financial proportion only; may exceed 100%, never clamped into physical progress. */
export function moneyProportion(approved:unknown,estimate:unknown):number|null {
  const r=ratio(amount(approved),amount(estimate));
  return r===null||!Number.isFinite(r*100)?null:r*100;
}

export function paymentEvidence(value:unknown,recordCount:number|null) {
  if(recordCount===null||!Number.isSafeInteger(recordCount)||recordCount<0)return {state:'unknown',amount:null} as const;
  if(recordCount===0)return {state:'not-entered',amount:null} as const;
  const n=amount(value);
  return n===null?{state:'unknown',amount:null} as const:{state:'recorded',amount:n} as const;
}
