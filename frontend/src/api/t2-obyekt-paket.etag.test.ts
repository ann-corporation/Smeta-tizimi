import { afterEach, describe, expect, it, vi } from 'vitest';
import { obyektPaketOl, obyektPaketTekshir } from './t2-obyekt-paket';
const etag='W/"t2-paket-1-'+ 'a'.repeat(32)+'"';
afterEach(()=>vi.unstubAllGlobals());
describe('paket conditional reader',()=>{
  it('304 JSONsiz receipt; oldingi muhr requestda',async()=>{
    const fetcher=vi.fn(async(_raw: RequestInfo | URL,_init?: RequestInit)=>new Response(null,{status:304,headers:{ETag:etag}}));vi.stubGlobal('fetch',fetcher);
    expect(await obyektPaketTekshir(4,etag)).toEqual({ok:true,notModified:true,etag});
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('If-None-Match')).toBe(etag);
  });
  it.each([undefined,'W/"other"'])('begona yoki mavjud bo‘lmagan muhr bilan 304 rad: %s',async prior=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:304,headers:{ETag:etag}})));
    expect(await obyektPaketTekshir(4,prior)).toMatchObject({ok:false,code:'PAKET_MUHR_INVALID'});
  });
  it('200 paket/muhr birga qaytadi; legacy caller shakli saqlanadi',async()=>{
    const paket={format:'synthetic'};
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json(paket,{headers:{ETag:etag}})));
    expect(await obyektPaketTekshir(4)).toEqual({ok:true,notModified:false,paket,etag});
    expect(await obyektPaketOl(4)).toEqual({ok:true,paket});
  });
});
