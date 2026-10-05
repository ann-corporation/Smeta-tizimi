/** Chat/voice proposes facts; this review contract never writes canonical data. */
export type QuantityUnit = 'm3' | 'm2' | 't' | 'kg' | 'item';
export type ConversationFact = {
  factId: string; sourceQuote: string; description: string;
  quantity: string | null; unit: QuantityUnit | null;
  materialQuote: string | null;
};
export type ConfirmedQuantityScope = {
  basis: 'PER_ITEM' | 'TOTAL'; itemCount: string;
  /** Issued by host after explicit user confirmation, never by the extraction model. */
  confirmationId: string;
};
export type EstimateIssue = 'QUANTITY_SCOPE_UNRESOLVED' | 'QUANTITY_MISSING' | 'UNIT_MISSING' | 'SOURCE_EVIDENCE_INVALID';
export type ConversationEstimateReview = {
  status: 'REVIEW_ONLY'; canWriteCanonical: false;
  lines: Array<{ fact: ConversationFact; totalQuantity: string | null; issues: EstimateIssue[] }>;
  requiredNextSteps: readonly ['CATALOG_WORK_REVIEW', 'NORM_UNIT_BASIS_REVIEW', 'PRICE_BASIS_REVIEW', 'USER_SAVE_CONFIRMATION'];
};
export interface ConversationEstimatePort {
  /** Same estimate builder read port; suggestion is not binding/approval. */
  suggestWorks(input: { companyId: number; objectId: number; fact: ConversationFact; catalogRevisionId: string }):
    Promise<Array<{ sourceWorkId: string; catalogRevisionId: string; evidence: string[]; needsReview: true }>>;
}
const decimal = /^\d+(?:[.,]\d{1,12})?$/;
function multiply(quantity: string, count: string): string {
  const parts=quantity.replace(',', '.').split('.'); const places=parts[1]?.length ?? 0;
  const product=BigInt(parts[0]+(parts[1] ?? ''))*BigInt(count);
  if (!places) return product.toString();
  const text=product.toString().padStart(places+1,'0');
  return (text.slice(0,-places)+'.'+text.slice(-places)).replace(/\.?0+$/, '');
}
export function reviewConversationEstimate(sourceText: string, facts: ConversationFact[], scope: ConfirmedQuantityScope | null): ConversationEstimateReview {
  if (!sourceText.trim() || sourceText.length>100000 || !Array.isArray(facts) || facts.length>500) throw new Error('BRIEF_INVALID');
  if (scope && (!scope.confirmationId.trim() || !/^[1-9]\d{0,5}$/.test(scope.itemCount) || !['PER_ITEM','TOTAL'].includes(scope.basis))) throw new Error('SCOPE_INVALID');
  const ids=new Set<string>();
  const lines=facts.map(fact=>{
    if (!fact.factId || ids.has(fact.factId)) throw new Error('FACT_ID_INVALID'); ids.add(fact.factId);
    const issues: EstimateIssue[]=[];
    if (!scope) issues.push('QUANTITY_SCOPE_UNRESOLVED');
    if (fact.quantity==null) issues.push('QUANTITY_MISSING');
    if (fact.unit==null) issues.push('UNIT_MISSING');
    if (!fact.sourceQuote.trim() || !sourceText.includes(fact.sourceQuote) || !fact.description.trim()
      || fact.materialQuote!=null && !fact.sourceQuote.includes(fact.materialQuote)) issues.push('SOURCE_EVIDENCE_INVALID');
    if (fact.quantity!=null) {
      if (fact.quantity.length>100 || !decimal.test(fact.quantity)) throw new Error('QUANTITY_INVALID');
      // Match the actual quantity token, not the "4" inside "14" or a grade.
      const token=fact.quantity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const units: Record<QuantityUnit,string> = {m3:'(?:m3|m³|м3|м³)',m2:'(?:m2|m²|м2|м²)',t:'(?:tonna|тонн(?:а|ы)?|t|т)',kg:'(?:kg|кг)',item:'(?:dona|шт)'};
      if (fact.unit && (!Object.hasOwn(units,fact.unit) || !new RegExp('(?<![\\d.,])'+token+'\\s*'+units[fact.unit]+'(?=$|[\\s,.;])','iu').test(fact.sourceQuote))) issues.push('SOURCE_EVIDENCE_INVALID');
    }
    const totalQuantity=issues.length || !scope || fact.quantity==null ? null : multiply(fact.quantity,scope.basis==='PER_ITEM'?scope.itemCount:'1');
    return {fact:{...fact},totalQuantity,issues};
  });
  return {status:'REVIEW_ONLY',canWriteCanonical:false,lines,requiredNextSteps:['CATALOG_WORK_REVIEW','NORM_UNIT_BASIS_REVIEW','PRICE_BASIS_REVIEW','USER_SAVE_CONFIRMATION']};
}
