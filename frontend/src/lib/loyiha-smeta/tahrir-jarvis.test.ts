import { describe, expect, it } from 'vitest';
import { tahrirMatni, type TahrirMalumot } from './tahrir-jarvis';
import { eskirganBolimlar, tahrirJami, tahrirQatorlari, type TahrirFarqDB, type TahrirItem } from './tahrir-farq';

const item = (o: Partial<TahrirItem>): TahrirItem => ({ varaq: 'КР-5', kalit: 'k', nom: 'Бетон', tur: 'beton', belgi: 'P1', holat: 'ozgargan', eski_birlik: 'м3', yangi_birlik: 'м3', eski_miqdor: 10, yangi_miqdor: 12, eski_norm: 10, yangi_norm: 12, foiz: 20,
  boglar: [{ qator_id: 2, kod: null, nom: 'Бетон монолитный', birlik: 'м3', hajm: 10, narx: 1000, kat: null, bolim_id: 1, bolim_nom: 'РАЗДЕЛ ОБРАЗЕЦ (КР-5)' }], ...o });
const db: TahrirFarqDB = { eski_id: 1, yangi_id: 2, qarorlar: [], items: [item({}), item({ kalit: 'k2', nom: 'Новая', holat: 'yangi', eski_miqdor: null, eski_norm: null, foiz: null, boglar: [] })],
  varaqlar: [{ varaq: 'КР-5', eski_soni: 1, yangi_soni: 2, ozgargan: 1, olingan: 0, yangi: 1, ayni: 0, holat: 'ozgargan' }, { varaq: 'КР-9', eski_soni: 0, yangi_soni: 1, ozgargan: 0, olingan: 0, yangi: 1, ayni: 0, holat: 'yangi_varaq' }] };
const qat = tahrirQatorlari(db);
const m = (asos: boolean): TahrirMalumot => ({ eskiNom: 'Eski', yangiNom: 'Yangi', smetaEskirgan: asos, db, qatorlar: qat, bolimlar: eskirganBolimlar(qat), jami: tahrirJami(db, qat) });

describe('Jarvis: loyiha_tahrir', () => {
  it('«loyihada nima o‘zgardi»: varaqlar, foiz, pul QQS bilan (2 240 = 2 × 1000 × 1.12); bog‘lanmagan element pulga kirmaydi', () => {
    const t = tahrirMatni(m(true), null).replace(/ /g, ' ');
    expect(t).toContain('o‘zgargan 1, olib tashlangan 0, yangi 1'); expect(t).toContain('(+20 %)'); expect(t).toContain('2 240 so‘m QQS bilan'); expect(t).toContain('narxsiz 0'); expect(t).toContain('smetaga bog‘lanmagan 1');
  });
  it('«smeta qaysi joyda eskirgan»: bo‘limlar; asos belgilanmagan bo‘lsa tushuntiradi (o‘ylab topmaydi)', () => {
    expect(tahrirMatni(m(true), 'eskirgan')).toContain('РАЗДЕЛ ОБРАЗЕЦ (КР-5)');
    expect(tahrirMatni(m(false), 'eskirgan')).toContain('Smeta asosi');
    expect(tahrirMatni(null, null)).toContain('kamida ikkita tahrir');
  });
});
