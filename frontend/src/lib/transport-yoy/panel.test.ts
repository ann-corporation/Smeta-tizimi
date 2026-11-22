import { describe, expect, it } from 'vitest';
import {
  belgilaPreviewMatni, tasdiqHolati, transportBelgiXaritasi, transportBelgisi, transportKartalar, yoyHolatChip, yoyJadval, yoyPreviewMatni, yoyXulosa, yoyYukiAjrat,
  yukIshiKodmi, type PanelQator, type YoyGuruhNatija,
} from './panel';

// Faqat sintetik raqamlar va nomlar.
const MAT = (id: number, usul: string | null = null): PanelQator => ({ id, tur: 'mat', kat: 'МАТ', kod: `M${id}`, nom: `Material ${id}`, summa: 1000, transport_usul: usul });
const TKM = (id: number, manba: number, summa: number | null): PanelQator => ({ id, tur: 'rs', kat: 'МАШ', kod: 'Т·КМ', nom: '↳ ТРАНСПОРТ', summa, transport_manba_qator_id: manba });
const ISH = (id: number, kod: string, summa: number | null): PanelQator => ({ id, tur: 'bl', kod, nom: 'Ish', summa });

describe('transportKartalar', () => {
  const qs = [MAT(1), MAT(2, 'foiz'), MAT(3, 'narx_ichida'), MAT(4, 'tkm'), TKM(5, 4, 250), TKM(6, 4, null), ISH(7, 'Е310-1005', 500), ISH(8, 'E311-2', 700), ISH(9, 'Е201-1', 9999)];
  it('t·km qatorlari, foiz/narx ichida soni va Е310/Е311 ishlari alohida sanaladi', () => {
    const k = transportKartalar(qs, null);
    expect(k.tkm).toEqual({ soni: 2, som: 250, somNomalum: 1 });
    expect(k.foiz.soni).toBe(2);
    expect(k.narxIchida.soni).toBe(1);
    expect(k.yuk).toEqual({ soni: 2, som: 1200, somNomalum: 0 });
    expect(k.xatoSoni).toBe(0);
  });
  it('audit xulosasi (server) qatorlardan ustun; xato soni auditdan', () => {
    const k = transportKartalar(qs, { xulosa: { foiz: 11, narx_ichida: 3, xato_soni: 2 }, xatolar: [] });
    expect(k.foiz.soni).toBe(11);
    expect(k.narxIchida.soni).toBe(3);
    expect(k.xatoSoni).toBe(2);
  });
  it('narxsiz qator so‘mi 0 emas — noma‘lum (null), hammasi narxsiz bo‘lsa so‘m null', () => {
    const k = transportKartalar([TKM(5, 4, null)], null);
    expect(k.tkm).toEqual({ soni: 1, som: null, somNomalum: 1 });
  });
  it('yukIshiKodmi: kirill va lotin, boshqa kod emas', () => {
    expect(['Е310-1', 'E311-5', 'С310-1005', 'e310 1'].map(yukIshiKodmi)).toEqual([true, true, true, true]);
    expect(['Е3100', 'Е201-1', '', null].map((k) => yukIshiKodmi(k))).toEqual([false, false, false, false]);
  });
});

describe('transport belgisi', () => {
  it('foiz — belgi yo‘q; tkm / narx_ichida — belgi; t·km qatori — tkmQator', () => {
    expect(transportBelgisi(MAT(1))).toBeNull();
    expect(transportBelgisi(MAT(2, 'foiz'))).toBeNull();
    expect(transportBelgisi(MAT(3, 'tkm'))).toEqual({ usul: 'tkm', tkmQator: false });
    expect(transportBelgisi(MAT(4, 'narx_ichida'))).toEqual({ usul: 'narx_ichida', tkmQator: false });
    expect(transportBelgisi(TKM(5, 3, 1))).toEqual({ usul: null, tkmQator: true });
    expect([...transportBelgiXaritasi([MAT(1), MAT(3, 'tkm'), TKM(5, 3, 1)]).keys()]).toEqual([3, 5]);
  });
});

const G = (over: Partial<YoyGuruhNatija>): YoyGuruhNatija => ({ material: 'Sintetik', holat: 'tayyor', topilgan_soni: 2, miqdor_tizim: 10, miqdor_hisob: 10, tkm_tizim: 300, tkm_hisob: 300, farq_som: 0, ...over });

describe('yoy preview jadvali va tasdiqlash tugmasi', () => {
  it('holat chiplari: tayyor yashil, chetlanish ogohlantirish, topilmadi xavfli', () => {
    expect(yoyHolatChip('tayyor').ton).toBe('ok');
    expect(yoyHolatChip('chetlanish').ton).toBe('warn');
    expect(yoyHolatChip('topilmadi').ton).toBe('danger');
    expect(yoyHolatChip('nomalum_holat')).toMatchObject({ soz: 'nomalum_holat', ton: 'mute' });
  });
  it('jadval va xulosa: farq so‘mi yig‘iladi, bloklovchi guruhlar sanaladi', () => {
    const g = [G({}), G({ holat: 'chetlanish', farq_som: 50, topilgan_soni: 1 }), G({ holat: 'topilmadi', topilgan_soni: 0, farq_som: null })];
    expect(yoyJadval(g)).toHaveLength(3);
    expect(yoyXulosa(g)).toEqual({ jami: 3, tayyor: 1, bloklovchi: 2, yozilishiMumkin: 3, farqJami: 50 });
    expect(yoyXulosa(undefined)).toEqual({ jami: 0, tayyor: 0, bloklovchi: 0, yozilishiMumkin: 0, farqJami: null });
  });
  it('tasdiq: bloklangan bo‘lsa faqat aniq qabul bilan yoqiladi (majburiy:true)', () => {
    expect(tasdiqHolati({ bloklangan: false, qabul: false, yozilishiMumkin: 3, band: false })).toEqual({ disabled: false, majburiy: false, sabab: null });
    expect(tasdiqHolati({ bloklangan: true, qabul: false, yozilishiMumkin: 3, band: false })).toEqual({ disabled: true, majburiy: false, sabab: 'qabul_kerak' });
    expect(tasdiqHolati({ bloklangan: true, qabul: true, yozilishiMumkin: 3, band: false })).toEqual({ disabled: false, majburiy: true, sabab: null });
    // qabul belgisi bloklanmagan jadvalda majburiy qilmaydi
    expect(tasdiqHolati({ bloklangan: false, qabul: true, yozilishiMumkin: 3, band: false }).majburiy).toBe(false);
  });
  it('yozadigan narsa yo‘q yoki band bo‘lsa — o‘chiq', () => {
    expect(tasdiqHolati({ bloklangan: false, qabul: true, yozilishiMumkin: 0, band: false })).toMatchObject({ disabled: true, sabab: 'bosh' });
    expect(tasdiqHolati({ bloklangan: false, qabul: true, yozilishiMumkin: 3, band: true })).toMatchObject({ disabled: true, sabab: 'band' });
  });
  it('matnli preview (Jarvis) farq, bloklanish va jamini ko‘rsatadi', () => {
    const m = yoyPreviewMatni([G({ holat: 'chetlanish', farq_som: 50, sabab: 'miqdor farqi' })], true);
    expect(m).toContain('Farq bor');
    expect(m).toContain('+50');
    expect(m).toContain('majburiy');
    expect(belgilaPreviewMatni([{ id: 3, kod: 'M3', nom: 'Material', oldin: 'foiz', keyin: 'tkm' }])).toBe('- M3 Material: foiz → tkm');
  });
});

describe('yoyYukiAjrat (fayl_oqi javobidan transport_yoy)', () => {
  it('to‘g‘ri yukni ajratadi, yo‘q/bo‘sh yukni null qiladi', () => {
    expect(yoyYukiAjrat({ transport_yoy: { varaq: 'трансп.', tkm_narx: 100, qatorlar: [{ material: 'X' }], topilmadi: ['Y'] } }))
      .toMatchObject({ varaq: 'трансп.', tkm_narx: 100, topilmadi: ['Y'] });
    expect(yoyYukiAjrat({})).toBeNull();
    expect(yoyYukiAjrat({ transport_yoy: { qatorlar: [] } })).toBeNull();
    expect(yoyYukiAjrat(null)).toBeNull();
  });
  it('narx noma‘lum bo‘lsa 0 emas, null', () => {
    expect(yoyYukiAjrat({ transport_yoy: { tkm_narx: null, qatorlar: [{ material: 'X' }] } })?.tkm_narx).toBeNull();
  });
});
