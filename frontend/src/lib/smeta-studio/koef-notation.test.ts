import { expect, it } from 'vitest';
import { coefficientNotation } from './koef-notation';
import type { WorkCoefficient } from './model';
it('prints accepted normative codes with scope and exact zero without pending coefficients', () => {
 const c: WorkCoefficient={id:'n',name:'TEST',value:'0',scope:'МАТ',evidence:'K-8 · TEST CLAUSE',origin:'NORM',accepted:true};
 expect(coefficientNotation([c,{...c,id:'pending',value:'2',accepted:false}])).toEqual(['K-8 Кмр=0']);
 expect(c.evidence).toBe('K-8 · TEST CLAUSE');
});
it('does not invent a normative code for a manual coefficient', () => {
 expect(coefficientNotation([{id:'m',name:'TEST',value:'1.15',scope:'ЧЕЛ',evidence:'TEST SOURCE',origin:'OPERATOR',accepted:true}])).toEqual(['Кзтр=1,15']);
});
