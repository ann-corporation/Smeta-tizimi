import { expect,it } from 'vitest';
import { parseQuantityInput } from './quantity-input';
it('preserves literal precision and thousands grouping without rounding source quantities',()=>{
 expect(parseQuantityInput('0,123456789012').qiymat).toBe('0.123456789012');
 expect(parseQuantityInput('1 234,123456789012').qiymat).toBe('1234.123456789012');
 expect(parseQuantityInput('1\u202f234,5').qiymat).toBe('1234.5');
 expect(parseQuantityInput('1\t234,5').qiymat).toBe('1234.5');
 expect(parseQuantityInput('0').qiymat).toBe('0');
});
it('uses the existing exact expression policy and rejects invalid or out-of-model values',()=>{
 expect(parseQuantityInput('0.1+0.2').qiymat).toBe('0.3');
 expect(parseQuantityInput('1/3').qiymat).toBe('0.333333');
 for(const value of ['0.1234567890123','1/0','-1','1000000000000000','1e3','unknown'])expect(()=>parseQuantityInput(value)).toThrow();
});
