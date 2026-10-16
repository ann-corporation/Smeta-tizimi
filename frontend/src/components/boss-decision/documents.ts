export type DocumentScope={companyId:number;projectId?:number|null;objectId?:number;withoutProject?:boolean};
export type BossDocument={id:string;filename:string;type:string;revision:number|null;canonicalStatus:string;sha256:string|null;updatedAt:string|null};
export type BossDocuments={ok:true;kompaniya_id:number;loyiha_id:number|null;obyekt_id:number|null;without_project:boolean;documents:BossDocument[];jami:number;next_before_id:number|null};
export async function readDocuments(scope:DocumentScope,before:number|null,signal?:AbortSignal):Promise<BossDocuments> {
 const params=new URLSearchParams({kompaniya_id:String(scope.companyId)});
 if(scope.projectId!=null)params.set('loyiha_id',String(scope.projectId));
 if(scope.objectId!=null)params.set('obyekt_id',String(scope.objectId));
 if(scope.withoutProject)params.set('without_project','true');if(before!=null)params.set('before',String(before));
 const r=await fetch('/api/boss-documents?'+params,{signal});const j=await r.json();
 if(!r.ok||j?.ok!==true)throw new Error('BOSS_DOCUMENTS_FAILED');
 if(j.kompaniya_id!==scope.companyId||j.loyiha_id!==(scope.projectId??null)||j.obyekt_id!==(scope.objectId??null)||j.without_project!==!!scope.withoutProject
  ||!Number.isSafeInteger(j.jami)||j.jami<0||!Array.isArray(j.documents)||j.documents.length>50
  ||(j.next_before_id!==null&&(!Number.isSafeInteger(j.next_before_id)||j.next_before_id<=0)))throw new Error('BOSS_DOCUMENT_SCOPE_MISMATCH');
 let previous=before??Infinity;
 for(const d of j.documents){const id=Number(d.id);if(!Number.isSafeInteger(id)||id<=0||id>=previous||typeof d.filename!=='string')throw new Error('BOSS_DOCUMENT_CURSOR_INVALID');previous=id;}
 if(j.next_before_id!==null&&(j.documents.length===0||j.next_before_id!==previous))throw new Error('BOSS_DOCUMENT_CURSOR_INVALID');
 return j;
}
