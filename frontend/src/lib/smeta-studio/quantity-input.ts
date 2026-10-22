import { normDec } from './model';
import { ifodaHisobla } from '../smeta-ai/ifoda';

/** Keep a stated decimal exactly. Only derived expressions use the evaluator's
 * documented six-place rounding; merely focusing a saved value must not round it. */
export function parseQuantityInput(source:string):{qiymat:string;ifoda:string} {
  const text=source.trim();
  const literal=/^\d{1,3}(?:\s+\d{3})+(?:[.,]\d+)?$/.test(text) ? text.replace(/\s/g,'') : text;
  try{const qiymat=normDec(literal,'QUANTITY_INVALID');return {qiymat,ifoda:qiymat};}
  catch(error){
    if(!/[+*/()×÷:xхXХ−–—-]/.test(text))throw error;
    const result=ifodaHisobla(text);
    return {...result,qiymat:normDec(result.qiymat,'QUANTITY_INVALID')};
  }
}
