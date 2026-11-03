import { describe, expect, it, vi, afterEach } from 'vitest';
import { HisobMijoz } from './hisob-mijoz';
import { hisobIshlov } from './hisob-ishlov';
import { faktSummaF2Narxda } from '../lib/hisob-yadro/korinish';
import { paketDekod, paketdanHolatlar, type PaketXom } from './paket';

/** Har qator sintetik. Manba biznes ma’lumoti yoki real summa yo‘q. */
function fixture(n = 3): PaketXom {
  const fill = (x: number | null) => Array<number | null>(n).fill(x);
  return {
    format:'t2-paket/1', obyekt_id:1, obyekt_nom:'SINOV', kompaniya_id:1, soni:n,
    lugat:{ nom:['SINOV'], kod:['TEST'], birlik:['M3'], tur:['mat'], kat:['МАТ'] },
    q:{ id:Array.from({length:n}, (_,i)=>i+1), ota_id:fill(null), daraja:fill(0), tartib:fill(1), tur:fill(0), kat:fill(0), kod:fill(0), nom:fill(0), birlik:fill(0),
      hajm:fill(10), narx:fill(7), summa:fill(70), norma:fill(null), narx_usul:Array(n).fill(null), versiya:Array(n).fill(1), qoshimcha:Array(n).fill(0), zamena:Array(n).fill(0), xom_qator:{} },
    h:{ fakt_hajm:fill(8), fakt_summa:fill(56), f2_hajm:fill(3), f2_summa:fill(20.03), f2_summa_nomalum:fill(0), direct_fakt_hajm:fill(8), fakt_manbasi:Array(n).fill(0), almashtirilgan_hajm:{}, almashtirilgan_summa:{} },
    f2:[], meta:{},
  };
}
class Port {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  onmessageerror: Worker['onmessageerror'] = null;
  postMessage = vi.fn(); terminate = vi.fn();
  javob(x: unknown) { this.onmessage?.call(null as unknown as Worker, {data:x} as MessageEvent); }
}
afterEach(() => vi.useRealTimers());

describe('hisob Worker — bir xil yadro va snapshot chegarasi', () => {
  it('mavjud reader bilan teng, xom manba o‘zgarmaydi', () => {
    const p = fixture(), old = structuredClone(p);
    const r = hisobIshlov({id:1, epoch:4, revision:5, paket:p});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.holatlar).toEqual(paketdanHolatlar(paketDekod(p)));
    expect(p).toEqual(old);
    expect(r).toMatchObject({epoch:4, revision:5});
  });
  it('buzilgan paketda yarim natija yoki texnik matn yo‘q', () => {
    const p = fixture(); p.q.hajm.pop();
    expect(hisobIshlov({id:1, epoch:0, revision:0, paket:p})).toEqual({id:1,epoch:0,revision:0,ok:false,xato:'HISOB_PAKET_XATO'});
  });
  it('30k qator rekursiyasiz va manba F2 summasi saqlanib o‘qiladi', () => {
    const r = hisobIshlov({id:1,epoch:0,revision:0,paket:fixture(30_000)});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.holatlar).toHaveLength(30_000);
      expect(r.holatlar[29_999].f2_summa).toBe(20.03);
      console.info('D3 synthetic30k decode+derive ms:', r.vaqtMs.toFixed(2));
    }
  });
  it('eski A javobi Bga qo‘llanmaydi; yopilgach yangi so‘rov rad', async () => {
    const port = new Port(), c = new HisobMijoz(port);
    const a = c.hisobla(fixture(),1,1), rejected = expect(a).rejects.toThrow('HISOB_BEKOR');
    const b = c.hisobla(fixture(),2,1);
    await rejected;
    port.javob(hisobIshlov(port.postMessage.mock.calls[0][0]));
    port.javob(hisobIshlov(port.postMessage.mock.calls[1][0]));
    await expect(b).resolves.toMatchObject({ok:true,epoch:2});
    c.yop(); await expect(c.hisobla(fixture(),2,2)).rejects.toThrow('HISOB_YOPIQ');
    expect(port.terminate).toHaveBeenCalledOnce();
  });
  it('soxta revision fail-closed', async () => {
    const port = new Port(), c = new HisobMijoz(port);
    const p = c.hisobla(fixture(),1,5);
    port.javob({...hisobIshlov(port.postMessage.mock.calls[0][0]),revision:4});
    await expect(p).rejects.toThrow('HISOB_ESKI'); c.yop();
  });
  it('timeout barcha kutishni tugatadi va Workerni to‘xtatadi', async () => {
    vi.useFakeTimers(); const port = new Port(), c = new HisobMijoz(port,100);
    const p = c.hisobla(fixture(),1,1), check = expect(p).rejects.toThrow('HISOB_BEKOR');
    vi.advanceTimersByTime(101); await check;
    expect(port.terminate).toHaveBeenCalledOnce();
  });
  it.each(['onerror','onmessageerror'] as const)('%s fail-closed', async event => {
    const port = new Port(), c = new HisobMijoz(port);
    const p = c.hisobla(fixture(),1,1), check = expect(p).rejects.toThrow('HISOB_BEKOR');
    (port[event] as () => void)(); await check;
    expect(port.terminate).toHaveBeenCalledOnce();
  });
});


describe('PR217 packet f2_summa_yoq compatibility', () => {
  it('preserves absent, explicit zero and null independently of nomalum', () => {
    const p = fixture(); p.h.f2_summa_nomalum = [9,9,9];
    const legacy = paketdanHolatlar(paketDekod(p));
    expect(legacy[0]).not.toHaveProperty('f2_summa_yoq');
    expect(faktSummaF2Narxda(8,3,20.03,56,legacy[0].f2_summa_yoq).summa).toBe(53.41);
    p.h.f2_summa_yoq = [0,null,2];
    const out = paketdanHolatlar(paketDekod(p));
    expect(out.map(h=>h.f2_summa_yoq)).toEqual([0,null,2]);
    expect(out.map(h=>h.f2_mumkin_summa)).toEqual([33.38,33.38,35.97]);
    expect(faktSummaF2Narxda(8,3,20.03,56,out[2].f2_summa_yoq).summa).toBe(56);
    expect(out.map(h=>h.f2_summa)).toEqual([20.03,20.03,20.03]);
    expect(out.map(h=>h.fakt_summa)).toEqual([56,56,56]);
  });
  it('carries missing BL/RZ amount guard through Worker and keeps null fakt', () => {
    const p = fixture();
    p.lugat.tur = ['bl','rz','rs']; p.q.tur = [0,1,2];
    p.h.f2_summa_yoq = [1,1,0]; p.h.f2_summa_nomalum = [0,0,0];
    p.h.f2_summa = [0,0,20.03]; p.h.fakt_summa[2] = null;
    const r = hisobIshlov({id:1,epoch:0,revision:0,paket:p});
    expect(r.ok).toBe(true);
    if(r.ok) {
      expect(r.holatlar.map(h=>h.f2_summa_yoq)).toEqual([1,1,0]);
      expect(r.holatlar[2]).toMatchObject({fakt_summa:null,f2_mumkin_summa:null,f2_summa:20.03});
    }
  });
  it('Worker preserves signed storno source and signed availability', () => {
    const p = fixture(1);
    p.q.hajm = [-10]; p.q.summa = [-70];
    p.h.fakt_hajm = [-8]; p.h.fakt_summa = [-56];
    p.h.f2_hajm = [-3]; p.h.f2_summa = [-20.03]; p.h.f2_summa_yoq = [0];
    const before = structuredClone(p);
    const r = hisobIshlov({id:1,epoch:0,revision:0,paket:p});
    expect(r.ok).toBe(true);
    if(r.ok) expect(r.holatlar[0]).toMatchObject({f2_hajm:-3,f2_summa:-20.03,fakt_summa:-56,f2_mumkin_hajm:-5,f2_mumkin_summa:-33.38});
    expect(p).toEqual(before);
  });
  it.each([undefined,null,0,1])('zero F2 amount guard %s preserves source and fails closed when unknown', guard => {
    const p = fixture(1); p.h.f2_summa = [0];
    if(guard !== undefined) p.h.f2_summa_yoq = [guard];
    const before = structuredClone(p);
    const r = hisobIshlov({id:1,epoch:0,revision:0,paket:p});
    expect(r.ok).toBe(true);
    if(r.ok) expect(r.holatlar[0]).toMatchObject({f2_hajm:3,f2_summa:0,fakt_summa:56,
      f2_mumkin_summa:guard == null ? null : guard === 0 ? 0 : 56});
    expect(p).toEqual(before);
  });
  it('rejects malformed optional column rather than inventing zero counts', () => {
    const p = fixture(); p.h.f2_summa_yoq = [0];
    expect(hisobIshlov({id:1,epoch:0,revision:0,paket:p})).toMatchObject({ok:false,xato:'HISOB_PAKET_XATO'});
  });
});
