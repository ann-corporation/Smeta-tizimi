import { expect,it } from 'vitest';
import { coefficientNotation,coefficientWorkCode } from './koef-notation';
import type { WorkCoefficient } from './model';
const c:WorkCoefficient={id:'c',name:'TEST',scope:'МАТ',value:'0',accepted:true,origin:'NORM',evidence:'П-8 · TEST BASIS'};
it('only accepted coefficients affect public code; zero and legacy rule identifiers survive',()=>{
 expect(coefficientNotation([c,{...c,id:'pending',accepted:false,value:'1.2'}])).toEqual(['П-8 Кмр=0']);
 expect(coefficientWorkCode({source:{code:'E1'} as never,coefficients:[]})).toBe('E1');
 expect(coefficientNotation([{...c,code:'К-9'}])).toEqual(['К-9 Кмр=0']);
});
