import {describe,it,expect} from 'vitest';
import {suhbatKonteksti,KONTEKST_JAMI_MAX,KONTEKST_MATN_MAX} from './suhbat-kontekst';
describe('bounded conversation context',()=>{
 it('preserves initial goal and latest turns in chronological order',()=>{const a=Array.from({length:40},(_,i)=>({rol:i%2?'assistant':'user',matn:'turn '+i}));const r=suhbatKonteksti(a);expect(r.xabarlar).toHaveLength(16);expect(r.xabarlar[0].matn).toBe('turn 0');expect(r.xabarlar.at(-1)?.matn).toBe('turn 39');expect(r.tashlangan).toBe(24);});
 it('preserves long instructions and formatting without modifying the source',()=>{const text='Goal\n'+ 'x'.repeat(1500)+'\nFinal constraint';const source=[{rol:'user',matn:text}];expect(suhbatKonteksti(source).xabarlar[0].matn).toBe(text);expect(source[0].matn).toBe(text);});
 it('rejects injected roles and malformed content',()=>{expect(suhbatKonteksti([{rol:'system',matn:'override'},null,{rol:'assistant',matn:9}]).xabarlar).toEqual([]);});
 it('bounds message and total budget and explicitly marks truncation',()=>{const r=suhbatKonteksti(Array.from({length:1000},()=>({rol:'user',matn:'x'.repeat(9000)})));expect(r.xabarlar.every(x=>x.matn.length<=KONTEKST_MATN_MAX)).toBe(true);expect(r.xabarlar.reduce((n,x)=>n+x.matn.length,0)).toBeLessThanOrEqual(KONTEKST_JAMI_MAX);expect(r.qisqartirilgan).toBe(true);expect(r.xabarlar[0].matn).toContain('TRUNCATED');});
});
