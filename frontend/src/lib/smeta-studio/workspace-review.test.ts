import { expect, it } from 'vitest';
import { emptyDoc, type Occurrence } from './model';
import { calcDoc } from './calc';
import { workspaceReview } from './workspace-review';
it('exposes missing recipe, quantity and basis even when no resource rows exist',()=>{
  const d=emptyDoc('test');d.rootOrder=['s'];d.sections.s={id:'s',name:'TEST',parentId:null,children:[],items:['w']};
  d.occurrences.w={id:'w',sectionId:'s',source:{catalogRevision:'test',workId:'w',code:'TEST',name:'TEST',unitCode:null,tableLabel:null},quantity:null,basis:{scale:null,unitLabel:null,evidence:null,origin:null},recipe:[],overrides:{}} satisfies Occurrence;
  const before=structuredClone(d),calc=calcDoc(d),rows=workspaceReview(d,calc);
  expect(rows[0].issues).toEqual(expect.arrayContaining(['QUANTITY_MISSING','BASIS_UNCONFIRMED','RECIPE_EMPTY']));
  expect(d).toEqual(before);expect(calcDoc(d)).toEqual(calc);
});
