import {describe,expect,it} from 'vitest';
import {dashboardFixture} from './fixtures.fixture';
import {assessContract,attentionObjects,compactMoney,contractPresentation,moneyProportion,paymentEvidence} from './decision-v2';

const object=()=>dashboardFixture().executive!.objects[0];
describe('V2 executive decisions preserve evidence',()=>{
  it('uses explicit mln/mlrd/trln with signed values and preserves zero',()=>{
    expect(compactMoney(14.26e9)).toBe('14,3 mlrd');
    expect(compactMoney(72.76e12)).toBe('72,8 trln');
    expect(compactMoney(-2.54e6)).toBe('-2,5 mln');
    expect(compactMoney(0)).toBe('0 UZS');
    expect(compactMoney(null)).toBeNull();expect(compactMoney(Infinity)).toBeNull();
  });
  it('quarantines only amounts strictly over 100x a complete linked estimate',()=>{
    const source={contractId:1,sourceAmount:10000,objectIds:[127],linksComplete:true};
    expect(assessContract(source,[object()]).suspiciousAmount).toBe(false);
    const assessed=assessContract({...source,sourceAmount:10001},[object()]);
    expect(assessed.suspiciousAmount).toBe(true);expect(assessed.sourceAmount).toBe(10001);
    const shown=contractPresentation([assessed]);expect(shown.known).toBeNull();expect(shown.excluded[0].sourceAmount).toBe(10001);
  });
  it('never diagnoses a contract against a partial or missing estimate',()=>{
    for(const o of [{...object(),estimate_missing:1},{...object(),estimate_known:null},{...object(),estimate_known:0}]) {
      expect(assessContract({contractId:1,sourceAmount:1e6,objectIds:[127],linksComplete:true},[o]).suspiciousAmount).toBe(false);
    }
    expect(assessContract({contractId:1,sourceAmount:1e6,objectIds:[127,999],linksComplete:true},[object()]).estimate).toBeNull();
    expect(assessContract({contractId:1,sourceAmount:1e6,objectIds:[127],linksComplete:false},[object()]).estimate).toBeNull();
  });
  it('compares shared contract to the full linked roster and deduplicates repeated links',()=>{
    const a=object();const b={...object(),object_id:128};
    const result=assessContract({contractId:1,sourceAmount:15000,objectIds:[127,128,128],linksComplete:true},[a,b]);
    expect(result.estimate).toBe(200);expect(result.suspiciousAmount).toBe(false);expect(result.shared).toBe(true);
    expect(contractPresentation([result]).known).toBe(15000);
    expect(()=>contractPresentation([result,result])).toThrow('DUPLICATE_CONTRACT');
  });
  it('flags approved F2 over whole contract, including a zero contract, without division by zero',()=>{
    const c={contractId:1,sourceAmount:20,objectIds:[127],linksComplete:true};
    expect(assessContract(c,[object()]).approvedContractRatio).toBe(3);
    expect(assessContract(c,[object()]).approvedExceedsContract).toBe(true);
    expect(assessContract(c,[{...object(),approved_missing:1}]).approvedExceedsContract).toBe(false);
    const zero=assessContract({...c,sourceAmount:0},[object()]);
    expect(zero.approvedExceedsContract).toBe(true);expect(zero.approvedContractRatio).toBeNull();
  });
  it('puts anomaly before review before unpriced quantity, without mutating objects',()=>{
    const a={...object(),object_id:1,review_count:0,unpriced_rows:0};
    const b={...object(),object_id:2,review_count:1,unpriced_rows:0};
    const c={...object(),object_id:3,review_count:0,unpriced_rows:9999};
    const source=[c,b,a];expect(attentionObjects(source,new Set([1])).map(o=>o.object_id)).toEqual([1,2,3]);
    expect(source.map(o=>o.object_id)).toEqual([3,2,1]);
  });
  it('does not mistake missing payments for actual zero; keeps explicit recorded zero',()=>{
    expect(paymentEvidence(0,0)).toEqual({state:'not-entered',amount:null});
    expect(paymentEvidence(0,2)).toEqual({state:'recorded',amount:0});
    expect(paymentEvidence(100,null).state).toBe('unknown');
    expect(paymentEvidence(null,2).state).toBe('unknown');
  });
  it('does not cap financial ratio or invent a physical completion percentage',()=>{
    expect(moneyProportion(300,100)).toBe(300);expect(moneyProportion(0,100)).toBe(0);
    expect(moneyProportion(100,0)).toBeNull();expect(moneyProportion(null,100)).toBeNull();
  });
});
