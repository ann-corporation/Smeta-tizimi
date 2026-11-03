// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OmborSessiya, type ObyektRuxsatPort } from './sessiya';
import type { Saqlash } from './saqlash';
import type { PaketXom } from './paket';
import { obyektOqi, type OqishPort } from './oqish';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function paket(id = 4, kid = 8): PaketXom {
  const q = Object.fromEntries(['id','ota_id','daraja','tartib','tur','kat','kod','nom','birlik','hajm','narx','summa','norma','narx_usul','versiya','qoshimcha','zamena'].map(k => [k, []]));
  const h = Object.fromEntries(['fakt_hajm','fakt_summa','f2_hajm','f2_summa','f2_summa_nomalum','direct_fakt_hajm','fakt_manbasi'].map(k => [k, []]));
  return { format:'t2-paket/1', obyekt_id:id, kompaniya_id:kid, obyekt_nom:null, soni:0,
    lugat:{nom:[],kod:[],birlik:[],tur:[],kat:[]}, q:{...q,xom_qator:{}},
    h:{...h,almashtirilgan_hajm:{},almashtirilgan_summa:{}},f2:[],meta:{} } as unknown as PaketXom;
}
const sessions: OmborSessiya[] = [];
afterEach(async () => { await Promise.all(sessions.splice(0).map(s => s.yop())); vi.restoreAllMocks(); vi.useRealTimers(); });
async function setup(authorize?: ObyektRuxsatPort) {
  const data = new Map<string, Uint8Array>();
  const disk: Saqlash = {
    ol: vi.fn(async k => data.get(k)),
    yoz: vi.fn(async (k, v) => { data.set(k, v); }),
    ochir: vi.fn(async k => { data.delete(k); }),
    kalitlar: vi.fn(async () => [...data.keys()]),
  };
  const ruxsat = vi.fn<ObyektRuxsatPort>(authorize ?? (async doira => ({ok:true, doira:{...doira}})));
  const bekor = vi.fn();
  const sessiya = new OmborSessiya(disk, ruxsat, bekor); sessions.push(sessiya);
  await sessiya.boshlash({kompaniyaId:8, foydalanuvchiId:2}, Date.now() + 60_000);
  bekor.mockClear();
  const korsat = vi.fn();
  const t = {obyektId:4, kompaniyaId:8, yoqilgan:true, paketRuxsat:true, joriy:()=>true, korsat, sessiya};
  const port: OqishPort = {paket:vi.fn(async()=>({ok:true as const,paket:paket()})), eski:vi.fn(async()=>({rows:[],states:[]}))};
  return {data,disk,ruxsat,bekor,sessiya,t,port,korsat};
}

describe('D1b object authorization and lifecycle', () => {
  it('authorized loader does not wait for a stalled encrypted cache read', async () => {
    const {t,port,disk,korsat} = await setup();
    disk.ol=vi.fn(()=>new Promise<Uint8Array | undefined>(()=>{}));
    await obyektOqi(t,port);
    expect(disk.ol).toHaveBeenCalledOnce();
    expect(korsat.mock.calls.at(-1)?.[0]).toMatchObject({manba:'paket',serverTasdiq:true});
  });
  it('authorized loader publishes the server result before delayed disk persistence', async () => {
    const {t,port,disk,korsat,data} = await setup();
    const started=deferred<void>(), release=deferred<void>();
    disk.yoz=async(k,v)=>{started.resolve();await release.promise;data.set(k,v);};
    await obyektOqi(t,port); await started.promise;
    expect(korsat.mock.calls.at(-1)?.[0]).toMatchObject({manba:'paket',serverTasdiq:true});
    expect(data.size).toBe(0); release.resolve();
  });
  it('quota failure during authorized cache write preserves a valid server result', async () => {
    const {t,port,disk,korsat} = await setup();
    disk.yoz=vi.fn(async()=>{throw new Error('quota');});
    await obyektOqi(t,port);
    await vi.waitFor(()=>expect(disk.yoz).toHaveBeenCalledOnce());
    expect(korsat.mock.calls.at(-1)?.[0]).toMatchObject({manba:'paket',serverTasdiq:true});
  });
  it.each(['authorize','paket'] as const)('%s 403 falls back to server-authorized legacy rows, never raw cache', async source => {
    const {t,port,disk,korsat} = await setup(source==='authorize' ? async()=>({ok:false,status:403}) : undefined);
    if(source==='paket') port.paket=async()=>({ok:false,status:403,error:'synthetic'});
    const rows = [{id:123}] as Awaited<ReturnType<OqishPort['eski']>>['rows'];
    port.eski = vi.fn(async()=>({rows,states:[]}));
    await obyektOqi(t,port);
    expect(port.eski).toHaveBeenCalledOnce();
    expect(korsat.mock.calls.at(-1)?.[0]).toMatchObject({rows,manba:'eski',serverTasdiq:true});
    if(source==='authorize') expect(disk.ol).not.toHaveBeenCalled();
    expect(disk.yoz).not.toHaveBeenCalled();
  });
  it.each(['logout','switch','new-read'] as const)('authorization403 fallback ticket dies on %s', async reason => {
    const {t,port,sessiya,korsat} = await setup(async()=>({ok:false,status:403}));
    const legacy = deferred<Awaited<ReturnType<OqishPort['eski']>>>();
    port.eski=vi.fn(()=>legacy.promise);
    const read=obyektOqi(t,port);
    await vi.waitFor(()=>expect(port.eski).toHaveBeenCalledOnce());
    if(reason==='logout') await sessiya.yop();
    else if(reason==='switch') await sessiya.boshlash({kompaniyaId:9,foydalanuvchiId:3},Date.now()+60_000);
    else await sessiya.obyekt(5,8);
    legacy.resolve({rows:[],states:[]}); await read;
    expect(korsat).not.toHaveBeenCalled();
  });
  it('default-off legacy reader does not wait for a hung session cleanup', async () => {
    const {t,port,sessiya,disk,data} = await setup();
    const started = deferred<void>(), release = deferred<void>();
    disk.yoz=async(k,v)=>{started.resolve();await release.promise;data.set(k,v);};
    const write=(await sessiya.obyekt(4,8))!.serverdan(paket()); await started.promise;
    const close=sessiya.yop();
    await obyektOqi({...t,yoqilgan:false},port);
    expect(port.eski).toHaveBeenCalledOnce();
    release.resolve(); await Promise.all([write,close]);
  });
  it('legacy server denial is not converted into cached or empty authorized rows', async () => {
    const {t,port,korsat,disk} = await setup(async()=>({ok:false,status:403}));
    port.eski=async()=>{throw new Error('LEGACY_403');};
    await expect(obyektOqi(t,port)).rejects.toThrow('LEGACY_403');
    expect(korsat).not.toHaveBeenCalled(); expect(disk.ol).not.toHaveBeenCalled();
  });
  it.each([401,503])('denied %i cannot read ANY cache or start package fetch', async status => {
    const {sessiya,t,port,disk,korsat,bekor} = await setup(async()=>({ok:false,status}));
    await obyektOqi(t,port);
    expect(disk.ol).not.toHaveBeenCalled(); expect(port.paket).not.toHaveBeenCalled();
    expect(port.eski).not.toHaveBeenCalled(); expect(korsat).not.toHaveBeenCalled();
    expect(bekor).toHaveBeenCalledOnce(); expect(await sessiya.obyekt(4,8)).toBeUndefined();
  });
  it('authorization must finish before disk and is repeated for every open', async () => {
    const grant = deferred<Awaited<ReturnType<ObyektRuxsatPort>>>();
    const {t,port,disk,ruxsat} = await setup(()=>grant.promise);
    const read = obyektOqi(t,port);
    await Promise.resolve();
    expect(disk.ol).not.toHaveBeenCalled(); expect(port.paket).not.toHaveBeenCalled();
    grant.resolve({ok:true,doira:{kompaniyaId:8,foydalanuvchiId:2,obyektId:4}});
    await read; await obyektOqi(t,port);
    expect(ruxsat).toHaveBeenCalledTimes(2);
    expect(ruxsat).toHaveBeenCalledWith({kompaniyaId:8,foydalanuvchiId:2,obyektId:4});
  });
  it('cache after online authorization remains unconfirmed until server result', async () => {
    const {sessiya,t,port,korsat} = await setup();
    const access = (await sessiya.obyekt(4,8))!;
    await access.serverdan(paket());
    const server = deferred<Awaited<ReturnType<OqishPort['paket']>>>();
    port.paket = ()=>server.promise;
    const read = obyektOqi(t,port);
    await vi.waitFor(()=>expect(korsat).toHaveBeenCalledWith(expect.objectContaining({manba:'kesh',serverTasdiq:false})));
    server.resolve({ok:true,paket:paket()}); await read;
    expect(korsat.mock.calls.at(-1)?.[0]).toMatchObject({manba:'paket',serverTasdiq:true});
  });
  it.each(['kompaniyaId','foydalanuvchiId','obyektId'] as const)('mismatched authorization %s fails closed', async field => {
    const {t,port,disk} = await setup(async doira=>({ok:true,doira:{...doira,[field]:99}}));
    await obyektOqi(t,port); expect(disk.ol).not.toHaveBeenCalled(); expect(port.paket).not.toHaveBeenCalled();
  });
  it('network authorization error does not unlock cache', async () => {
    const {t,port,disk,bekor} = await setup(async()=>{throw new Error('offline');});
    await obyektOqi(t,port); expect(disk.ol).not.toHaveBeenCalled(); expect(port.paket).not.toHaveBeenCalled(); expect(bekor).toHaveBeenCalledOnce();
  });
  it('logout during authorization ignores the late grant', async () => {
    const grant = deferred<Awaited<ReturnType<ObyektRuxsatPort>>>();
    const {t,port,sessiya,disk} = await setup(()=>grant.promise);
    const read = obyektOqi(t,port); await sessiya.yop();
    grant.resolve({ok:true,doira:{kompaniyaId:8,foydalanuvchiId:2,obyektId:4}});
    await read; expect(port.paket).not.toHaveBeenCalled(); expect(disk.ol).not.toHaveBeenCalled();
  });
  it('older denied authorization cannot revoke a newer authorized object', async () => {
    const denied = deferred<Awaited<ReturnType<ObyektRuxsatPort>>>();
    const {sessiya,ruxsat,bekor} = await setup();
    ruxsat.mockImplementationOnce(()=>denied.promise);
    const old=sessiya.obyekt(4,8);
    const current=(await sessiya.obyekt(5,8))!;
    denied.resolve({ok:false,status:403});
    expect(await old).toBeUndefined(); expect(current.joriy()).toBe(true);
    expect(bekor).not.toHaveBeenCalled();
  });
  it('delayed encrypted disk read cannot restore data after logout', async () => {
    const {sessiya,disk,data} = await setup();
    for(const id of [4,5,6,7]) await (await sessiya.obyekt(id,8))!.serverdan(paket(id));
    const bytes=data.get('paket/8/2/4')!;
    const started=deferred<void>(), delayed=deferred<Uint8Array|undefined>();
    disk.ol=async()=>{started.resolve();return delayed.promise;};
    const access=(await sessiya.obyekt(4,8))!;
    const read=access.och(); await started.promise;
    await sessiya.yop(); delayed.resolve(bytes);
    expect(await read).toBeUndefined(); expect(data.size).toBe(0);
  });
  it('logout during package request prevents late display/write', async () => {
    const {t,port,sessiya,disk,korsat} = await setup();
    const server = deferred<Awaited<ReturnType<OqishPort['paket']>>>();
    port.paket = vi.fn(()=>server.promise);
    const read = obyektOqi(t,port); await vi.waitFor(()=>expect(port.paket).toHaveBeenCalledOnce());
    await sessiya.yop(); server.resolve({ok:true,paket:paket()}); await read;
    expect(korsat).not.toHaveBeenCalled(); expect(disk.yoz).not.toHaveBeenCalled();
  });
  it.each([401,403])('package %i invalidates immediately and cannot publish fallback after logout', async status => {
    const {sessiya,t,port,bekor,korsat} = await setup();
    await (await sessiya.obyekt(4,8))!.serverdan(paket());
    const fallback = deferred<Awaited<ReturnType<OqishPort['eski']>>>();
    port.paket = async()=>({ok:false,status,error:'synthetic'});
    port.eski = ()=>fallback.promise;
    const read = obyektOqi(t,port);
    if (status === 401) await expect(read).rejects.toThrow('READ_FAILED');
    else {
      await vi.waitFor(()=>expect(bekor).toHaveBeenCalled());
      await sessiya.yop(); fallback.resolve({rows:[],states:[]}); await read;
    }
    expect(bekor).toHaveBeenCalled();
    expect(korsat.mock.calls.every(([x])=>x.manba==='kesh')).toBe(true);
    expect(await sessiya.obyekt(4,8)).toBeUndefined();
  });
  it('old object response cannot publish after a newer open', async () => {
    const {sessiya,t,port,korsat,disk} = await setup();
    const server = deferred<Awaited<ReturnType<OqishPort['paket']>>>(); port.paket=vi.fn(()=>server.promise);
    const read = obyektOqi(t,port); await vi.waitFor(()=>expect(port.paket).toHaveBeenCalled());
    await sessiya.obyekt(5,8);
    server.resolve({ok:true,paket:paket()}); await read;
    expect(korsat).not.toHaveBeenCalled(); expect(disk.yoz).not.toHaveBeenCalled();
  });
  it('logout clears memory/UI synchronously; delayed disk write is deleted before new session', async () => {
    const {sessiya,disk,data,bekor} = await setup();
    const started = deferred<void>(), release = deferred<void>();
    disk.yoz = vi.fn(async(k,v)=>{started.resolve();await release.promise;data.set(k,v);});
    const access = (await sessiya.obyekt(4,8))!;
    const write = access.serverdan(paket()); await started.promise;
    const closed = sessiya.yop();
    expect(bekor).toHaveBeenCalledOnce(); expect(access.joriy()).toBe(false); expect(await access.och()).toBeUndefined();
    let renewed = false;
    const renew = sessiya.boshlash({kompaniyaId:8,foydalanuvchiId:2},Date.now()+60_000).then(v=>{renewed=v;});
    await Promise.resolve(); expect(renewed).toBe(false);
    release.resolve(); await Promise.all([write,closed,renew]);
    expect(renewed).toBe(true); expect(data.size).toBe(0);
  });
  it('refresh/switch rotates non-extractable AES key; no key material is persisted', async () => {
    const generate = vi.spyOn(crypto.subtle,'generateKey');
    const {sessiya,disk,data} = await setup();
    const first = await generate.mock.results[0].value as CryptoKey;
    expect(first.extractable).toBe(false); await expect(crypto.subtle.exportKey('raw',first)).rejects.toThrow();
    await (await sessiya.obyekt(4,8))!.serverdan(paket());
    expect([...data.keys()]).toEqual(['paket/8/2/4']);
    const firstAccess = (await sessiya.obyekt(4,8))!;
    await sessiya.boshlash({kompaniyaId:9,foydalanuvchiId:3},Date.now()+60_000);
    const second = await generate.mock.results[1].value as CryptoKey;
    expect(second).not.toBe(first); expect(second.extractable).toBe(false);
    expect(firstAccess.joriy()).toBe(false); expect(data.size).toBe(0);
    expect(disk.yoz).toHaveBeenCalledTimes(1);
    expect(await sessiya.obyekt(4,8)).toBeUndefined();
  });
  it('TTL expires without another request, and invalid TTL never starts a session', async () => {
    vi.useFakeTimers();
    const {sessiya,bekor} = await setup();
    const access = (await sessiya.obyekt(4,8))!;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(access.joriy()).toBe(false); expect(bekor).toHaveBeenCalledOnce();
    for (const ttl of [NaN,Infinity,Date.now(),Date.now()-1]) {
      expect(await sessiya.boshlash({kompaniyaId:8,foydalanuvchiId:2},ttl)).toBe(false);
    }
  });
  it('403 legacy result still clears at TTL even if wall clock moves backwards', async () => {
    vi.useFakeTimers();
    const {t,port,bekor,korsat,sessiya} = await setup(async()=>({ok:false,status:403}));
    await obyektOqi(t,port);
    expect(korsat.mock.calls.at(-1)?.[0].manba).toBe('eski');
    expect(bekor).toHaveBeenCalledOnce();
    // A newer denied open invalidates the result ticket but must not cancel UI expiry.
    await sessiya.obyekt(5,8);
    vi.setSystemTime(Date.now()-10_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bekor).toHaveBeenCalledTimes(2);
  });
  it('disk cleanup failure blocks refresh instead of reviving unclean state', async () => {
    const {sessiya,disk} = await setup();
    await (await sessiya.obyekt(4,8))!.serverdan(paket());
    disk.ochir = async()=>{throw new Error('quota/private disk');};
    await sessiya.yop();
    expect(await sessiya.boshlash({kompaniyaId:8,foydalanuvchiId:2},Date.now()+60_000)).toBe(false);
    expect(await sessiya.obyekt(4,8)).toBeUndefined();
  });
});
