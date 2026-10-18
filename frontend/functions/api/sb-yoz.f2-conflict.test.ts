import {describe,it,expect} from 'vitest';
import {f2AktRaqamZiddiyati} from './sb-yoz';
describe('F2 duplicate act identity',()=>{
  it('recognizes only the exact act number constraint for F2 writes',()=>{
    const message=JSON.stringify({code:'23505',message:'duplicate key violates unique constraint "t2_akt_kalit_uniq"'});
    expect(f2AktRaqamZiddiyati('akt_yarat_v2',message)).toBe(true);
    expect(f2AktRaqamZiddiyati('ish_abc_ochir_v1',message)).toBe(false);
  });
  it('never rewrites a stale version, unrelated uniqueness error or network failure as an existing act',()=>{
    for(const j of [{code:'40001',message:'stale'}, {code:'23505',message:'t2_akt_operation_uniq'}, {code:'23505',message:'t2_akt_kalit_uniq_other'}])
      expect(f2AktRaqamZiddiyati('akt_yarat_v2',JSON.stringify(j))).toBe(false);
    expect(f2AktRaqamZiddiyati('akt_yarat_v2','<html>gateway error</html>')).toBe(false);
  });
});
