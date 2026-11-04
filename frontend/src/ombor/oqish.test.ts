// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { obyektOqi, type OqishPort } from './oqish';
import type { ObyektOmbor } from './obyekt-ombor';
import { paketDekod, type PaketXom } from './paket';
import { omborYoqilgan } from './bayroq';

function paket(): PaketXom {
  const q = Object.fromEntries(['id','ota_id','daraja','tartib','tur','kat','kod','nom','birlik','hajm','narx','summa','norma','narx_usul','versiya','qoshimcha','zamena'].map(k => [k, []]));
  const h = Object.fromEntries(['fakt_hajm','fakt_summa','f2_hajm','f2_summa','f2_summa_nomalum','direct_fakt_hajm','fakt_manbasi'].map(k => [k, []]));
  return { format:'t2-paket/1', obyekt_id:4, kompaniya_id:8, obyekt_nom:null, soni:0,
    lugat:{nom:[],kod:[],birlik:[],tur:[],kat:[]}, q:{...q,xom_qator:{}},
    h:{...h,almashtirilgan_hajm:{},almashtirilgan_summa:{}},f2:[],meta:{} } as unknown as PaketXom;
}
function setup() {
  const port: OqishPort = { paket: vi.fn(async () => ({ok:true as const,paket:paket()})), eski: vi.fn(async () => ({rows:[],states:[]})) };
  const korsat = vi.fn(), ombor = {och:vi.fn(async () => ({paket:paketDekod(paket()),serverTasdiq:false})),serverdan:vi.fn(async () => {}),yop:vi.fn(async () => {})};
  const t = {obyektId:4,kompaniyaId:8,yoqilgan:true,paketRuxsat:true,joriy:() => true,korsat,ombor:ombor as unknown as ObyektOmbor};
  return {port,t,korsat,ombor};
}
describe('obyekt o‘qish oqimi', () => {
  it.each(['yoqilgan','paketRuxsat'] as const)('%s o‘chiq — eski API, kesh ham paket ham o‘qilmaydi', async flag => {
    const {port,t,ombor} = setup(); t[flag]=false; await obyektOqi(t,port);
    expect(port.eski).toHaveBeenCalledOnce(); expect(port.paket).not.toHaveBeenCalled(); expect(ombor.och).not.toHaveBeenCalled();
  });
  it('session authorizer yo‘q: boolean ruxsat keshni ochmaydi yoki yozmaydi', async () => {
    const {port,t,korsat,ombor} = setup(); await obyektOqi(t,port);
    expect(korsat.mock.calls.at(-1)?.[0]).toMatchObject({serverTasdiq:true,manba:'paket'});
    expect(korsat).toHaveBeenCalledOnce();
    expect(ombor.och).not.toHaveBeenCalled(); expect(ombor.serverdan).not.toHaveBeenCalled();
  });
  it('403 keshni yopadi va ruxsatli eski readerni sinaydi', async () => {
    const {port,t,ombor,korsat}=setup(); port.paket=async()=>({ok:false,status:403,error:'internal'}); await obyektOqi(t,port);
    expect(ombor.och).not.toHaveBeenCalled(); expect(ombor.yop).toHaveBeenCalledOnce(); expect(port.eski).toHaveBeenCalledOnce(); expect(korsat.mock.calls.at(-1)?.[0].manba).toBe('eski');
  });
  it('401 canonical fallback bermaydi', async () => {
    const {port,t,ombor}=setup(); port.paket=async()=>({ok:false,status:401,error:'internal'});
    await expect(obyektOqi(t,port)).rejects.toThrow('READ_FAILED'); expect(ombor.och).not.toHaveBeenCalled(); expect(ombor.yop).toHaveBeenCalledOnce(); expect(port.eski).not.toHaveBeenCalled();
  });
  it('begona kompaniya javobi UI yoki diskka tushmaydi', async () => {
    const {port,t,ombor,korsat}=setup(); ombor.och.mockResolvedValue(undefined as never);
    port.paket=async()=>({ok:true,paket:{...paket(),kompaniya_id:9}});
    await expect(obyektOqi(t,port)).rejects.toThrow('SCOPE_MISMATCH'); expect(korsat).not.toHaveBeenCalled(); expect(ombor.serverdan).not.toHaveBeenCalled();
  });
  it('bekor qilingan epoch server natijasini qo‘llamaydi', async () => {
    const {port,t,korsat,ombor}=setup(); let active=true; t.joriy=()=>active;
    ombor.och.mockResolvedValue(undefined as never); port.paket=async()=>{active=false;return {ok:true,paket:paket()};};
    await obyektOqi(t,port); expect(korsat).not.toHaveBeenCalled(); expect(ombor.serverdan).not.toHaveBeenCalled();
  });
  it('bayroq browsersiz sukut o‘chiq',()=>{expect(omborYoqilgan()).toBe(false);});
});
