import { describe, expect, it } from 'vitest';
import { esfCsv, esfJson, esfPaketQur, esfQatorlarF3dan, esfTanlanganId, esfTekshir, stirYaroqli, type EsfKiritma } from './esf-tayyorlash';

// Sintetik ma'lumot: haqiqiy kompaniya/STIR/summa yo'q.
const toliq = (): EsfKiritma => ({
  forma3Raqam: 'TEST-1', davr: '2099-03', hujjatSana: '2099-03-31',
  sotuvchi: { nom: 'Test Sotuvchi', stir: '111111111', bank: 'Test bank', hisobRaqam: '00000000000000000000', mfo: '00000' },
  xaridor: { nom: 'Test Xaridor', stir: '222222222', bank: 'Test bank', hisobRaqam: '11111111111111111111', mfo: '00001' },
  shartnoma: { raqam: 'T-1', sana: '2099-01-10', idTuri: 'my3', my3Id: 'MY3-TEST' },
  qqsFoiz: 12,
  qatorlar: [
    { nom: 'Ish A', miqdor: 1, ikpu: '12345678901234567', birlikKodi: '1', summaNdsiz: 100, qqsSumma: 12, summaNdsBilan: 112 },
    { nom: 'Ish B', miqdor: 2, ikpu: '12345678901234567', birlikKodi: '1', summaNdsiz: 200, qqsSumma: 24, summaNdsBilan: 224 },
  ],
});
const kalit = (k: EsfKiritma, s?: Parameters<typeof esfTekshir>[1]) => Object.fromEntries(esfTekshir(k, s).qatorlar.map((x) => [x.kalit, x.holat]));

describe('esfTekshir', () => {
  it('to‘liq kiritma — tayyor', () => {
    const r = esfTekshir(toliq());
    expect(r.tayyor).toBe(true);
    expect(r.yoqSoni).toBe(0);
  });
  it('STIR yo‘q va noto‘g‘ri', () => {
    const k = toliq(); k.sotuvchi.stir = ''; k.xaridor.stir = '12';
    const h = kalit(k);
    expect(h.sotuvchi_stir).toBe('yoq');
    expect(h.xaridor_stir).toBe('yoq');
    expect(stirYaroqli('123 456 789')).toBe(true);
    expect(stirYaroqli('12345678901234')).toBe(true);
    expect(stirYaroqli('1234')).toBe(false);
  });
  it('ID turi tanlanmagan yoki qiymati yo‘q — majburiy bo‘lsa yo‘q', () => {
    const a = toliq(); a.shartnoma = { raqam: 'T-1', sana: '2099-01-10' };
    expect(kalit(a).shartnoma_id).toBe('yoq');
    const b = toliq(); b.shartnoma = { raqam: 'T-1', sana: '2099-01-10', idTuri: 'kapital', my3Id: 'X' };
    expect(kalit(b).shartnoma_id).toBe('yoq');
    expect(esfTanlanganId(b.shartnoma)).toBeNull();
    const c = toliq(); c.shartnoma = { raqam: 'T-1', sana: '2099-01-10', idTuri: 'kadastr', kadastr: '10:00:00:00:00:0000' };
    expect(kalit(c).shartnoma_id).toBe('ok');
  });
  it('sozlama: ID majburiy emas — faqat ogohlantirish', () => {
    const k = toliq(); k.shartnoma = { raqam: 'T-1', sana: '2099-01-10' };
    const r = esfTekshir(k, { ...{ sotuvchiStir: true, xaridorStir: true, sotuvchiBank: true, xaridorBank: true, shartnomaRaqam: true, shartnomaSana: true, ikpu: false, birlikKodi: false }, shartnomaId: false });
    expect(r.tayyor).toBe(true);
    expect(r.ogohSoni).toBeGreaterThan(0);
  });
  it('IKPU yo‘q — sukut bo‘yicha ogohlantirish, bloklamaydi', () => {
    const k = toliq(); k.qatorlar[0].ikpu = null;
    const r = esfTekshir(k);
    expect(kalit(k).ikpu).toBe('ogohlantirish');
    expect(r.tayyor).toBe(true);
  });
  it('noma‘lum summa (null) bloklaydi, 0 emas', () => {
    const k = toliq(); k.qatorlar = [k.qatorlar[0], { ...k.qatorlar[1], summaNdsiz: null, qqsSumma: null, summaNdsBilan: null }];
    expect(kalit(k).summa_nomalum).toBe('yoq');
    expect(esfPaketQur(k).jami.summaNdsBilan).toBeNull();
  });
  it('NDS siz + QQS ≠ NDS bilan — xato', () => {
    const k = toliq(); k.qatorlar[0].summaNdsBilan = 999;
    expect(kalit(k).summa_mos).toBe('yoq');
  });
  it('QQS stavkasi noma‘lum', () => {
    const k = toliq(); k.qqsFoiz = null;
    expect(kalit(k).qqs_foiz).toBe('yoq');
  });
});

describe('esfPaketQur / eksport', () => {
  it('jami qatorlar yig‘indisi, narx = summa/miqdor', () => {
    const p = esfPaketQur(toliq());
    expect(p.jami).toEqual({ summaNdsiz: 300, qqsSumma: 36, summaNdsBilan: 336 });
    expect(p.qatorlar[1].narx).toBe(100);
    expect(p.shartnoma.idQiymat).toBe('MY3-TEST');
    expect(p.eslatma).toContain('T — tekshirilsin');
  });
  it('JSON va CSV', () => {
    const p = esfPaketQur(toliq());
    expect(JSON.parse(esfJson(p)).format).toBe('neytral-esf-v1');
    const csv = esfCsv(p);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('JAMI');
  });
  it('F3 yig‘indisidan qatorlar (J ustuni)', () => {
    const z = { pryamye: 0, itogo4: 100, qqs: 12, vsego: 112 };
    const q = esfQatorlarF3dan({ obyektlar: [{ obyekt_id: 1, nom: 'Obyekt-1', ndsFoiz: 12, ustun: { G: z, H: z, I: z, J: z }, aktlar: [], diqqat: [] }] });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ summaNdsiz: 100, qqsSumma: 12, summaNdsBilan: 112 });
  });
});
