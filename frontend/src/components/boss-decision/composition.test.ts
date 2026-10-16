import{describe,it,expect}from'vitest';
import{costComposition,knownShare,russianCategory}from'./composition';
import{evidenceFixture}from'./fixtures.fixture';
describe('cost groups come from source leaves only',()=>{
 it('never adds section and work amounts over resource amounts',()=>{const e=evidenceFixture();e.rows[2].kat='МАТ';e.rows[3].kat='ЧЕЛ';const c=costComposition(e.rows,e.states);expect(c.known).toBe(190);expect(c.rows).toBe(4);expect(c.missing).toBe(1);expect(c.groups.find(g=>g.key==='МАТ')?.known).toBe(100);expect(c.groups.find(g=>g.key==='ЧЕЛ')?.known).toBe(0);expect(knownShare(c,c.groups.find(g=>g.key==='МАТ')!)!).toBeCloseTo(100/190*100);});
 it('keeps all-unknown totals null and explicit zero separate',()=>{const e=evidenceFixture();const c=costComposition([e.rows[4]],e.states);expect(c.known).toBeNull();expect(c.groups[0].known).toBeNull();expect(knownShare(c,c.groups[0])).toBeNull();const zero=costComposition([e.rows[3]],e.states);expect(zero.known).toBe(0);expect(zero.missing).toBe(0);expect(zero.sharesAvailable).toBe(false);});
 it('preserves negative corrections and does not draw misleading proportional bars',()=>{const e=evidenceFixture();e.rows[3].summa=-20;const states=e.states.filter(s=>s.qator_id!==4);const c=costComposition(e.rows,states);expect(c.known).toBe(170);expect(c.negativeRows).toBe(1);expect(c.sharesAvailable).toBe(false);expect(knownShare(c,c.groups[0])).toBeNull();});
 it('does not guess a category from a resource name',()=>{const e=evidenceFixture();e.rows[2].nom='БЕТОН B20';e.rows[2].kat=null;const c=costComposition([e.rows[2]],e.states);expect(c.groups[0].key).toBe('UNCLASSIFIED');expect(c.groups[0].known).toBe(100);expect(russianCategory('constructor')).toBe('constructor');});
});
