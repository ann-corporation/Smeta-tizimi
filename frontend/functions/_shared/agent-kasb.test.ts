import { describe, expect, it } from 'vitest';
import { faktMatni, harakatMatni, javobniAjrat, kasbPrompti, mavzuTaqiqi, mavzular, radMatni, sahifaIshorasi, toifalarniTanla, type KasbMalumoti } from './agent-kasb';

const PRORAB = ['obyektlar', 'hajm', 'grafik', 'ombor', 'sifat', 'texnika'];
const BUGALTER = ['obyektlar', 'f2_fakt_pul', 'moliya', 'kadr'];
const DIREKTOR = ['obyektlar', 'smeta_pul', 'f2_fakt_pul', 'hajm', 'grafik', 'moliya', 'ombor', 'sifat', 'kadr', 'texnika'];
const SKLADCHI = ['obyektlar', 'ombor', 'texnika'];

describe('mavzuTaqiqi — chegara modelga qoldirilmaydi', () => {
  it.each([
    ['Shu oy qancha to‘lov bo‘ldi?', PRORAB, true],
    ['Xodimlar oyligi qancha?', PRORAB, true],
    ['Сколько стоит смета по объекту?', PRORAB, true],
    ['Smeta jami summasi qancha?', PRORAB, true],
    ['Qancha so‘m sarflandi?', SKLADCHI, true],
    ['Какая зарплата у сотрудников?', SKLADCHI, true],
    ['Omborda sement qancha qolgan?', PRORAB, false],
    ['Qaysi ishlar grafikdan orqada?', PRORAB, false],
    ['Shu oy qancha to‘lov bo‘ldi?', BUGALTER, false],
    ['Oylik maosh jami qancha?', BUGALTER, false],
    ['Smeta narxi qancha?', BUGALTER, true],
    ['Omborda nima kam?', BUGALTER, true],
    ['Qaysi obyektlar grafikdan orqada va smeta summasi?', DIREKTOR, false],
  ])('%s [%s] → rad=%s', (savol, ruxsat, rad) => {
    expect(mavzuTaqiqi(savol, ruxsat) !== null).toBe(rad);
  });

  it('aralash savol: ruxsatli qismi bilan javob olinadi (hamma toifa ruxsatsiz emas)', () => {
    expect(mavzuTaqiqi('Omborda nima qolgan va oylik qancha?', PRORAB)).toBeNull();
  });

  it('pul so‘rovi: pul toifasi umuman yo‘q rolga har doim rad (toifa aniq bo‘lmasa sabab «pul»)', () => {
    expect(mavzuTaqiqi('Bu ishning narxi qancha?', PRORAB)).not.toBeNull();
    expect(mavzuTaqiqi('Bu uchun qancha pul ketdi?', PRORAB)).toMatchObject({ sabab: 'pul' });
    expect(mavzuTaqiqi('Bu uchun qancha pul ketdi?', DIREKTOR)).toBeNull();
  });
});

describe('toifalarniTanla — arzon prompt, ruxsat bilan kesishma', () => {
  it('savolga mos toifa + obyektlar; ruxsatsiz toifa HECH QACHON kirmaydi', () => {
    expect(toifalarniTanla('Omborda nima kam?', PRORAB)).toEqual(['obyektlar', 'ombor']);
    expect(toifalarniTanla('Shu oy to‘lov va oylik', PRORAB)).toEqual(['obyektlar']);
    expect(toifalarniTanla('Shu oy to‘lov', DIREKTOR)).toEqual(['obyektlar', 'moliya']);
  });
  it('mavzusiz savol — umumiy arzon to‘plam (obyektlar, hajm, grafik)', () => {
    expect(toifalarniTanla('Salom, ahvol qanday?', PRORAB)).toEqual(['obyektlar', 'hajm', 'grafik']);
    expect(toifalarniTanla('Salom', ['obyektlar'])).toEqual(['obyektlar']);
  });
  it('sahifa ishorasi qo‘shiladi, lekin faqat ruxsat doirasida', () => {
    expect(sahifaIshorasi('/admin/moliya')).toEqual(['moliya']);
    expect(toifalarniTanla('Bu nima?', DIREKTOR, '/admin/sklad')).toContain('ombor');
    expect(toifalarniTanla('Bu nima?', PRORAB, '/admin/moliya')).not.toContain('moliya');
    expect(sahifaIshorasi(null)).toEqual([]);
  });
  it('mavzular: lotin, kirill va rus kalit so‘zlar', () => {
    expect(mavzular('Ombor qoldig‘i va grafik')).toEqual(expect.arrayContaining(['ombor', 'grafik']));
    expect(mavzular('остаток на складе и график')).toEqual(expect.arrayContaining(['ombor', 'grafik']));
  });
});

const kasb: KasbMalumoti = {
  rol: 'prorab', profil: 'prorab', nom: 'Prorab yordamchisi', vazifa: 'Ish borishi va ombor.', kategoriyalar: ['obyektlar'] as never, namuna_savollar: [],
  taqiq_izoh: 'Pul ma’lumotlari sizning doirangizda emas.',
  boshqalar: [{ rol: 'bugalter', nom: 'Bugalter yordamchisi', vazifa: 'To‘lov va xarajat' }, { rol: 'boss', nom: 'Direktor yordamchisi', vazifa: 'Umumiy' }, { rol: 'usta', nom: 'Usta yordamchisi', vazifa: 'Kundalik ish' }],
};

describe('radMatni va kasbPrompti', () => {
  it('rad matni: nima yopiqligi, kim ko‘ra olishi va taqiq izohi; hech qanday ma’lumot yo‘q', () => {
    const m = radMatni(kasb, { sabab: 'pul', toifalar: ['moliya'] });
    expect(m).toContain('doirasida emas'); expect(m).toMatch(/Bugalter|Direktor/); expect(m).toContain('Pul ma’lumotlari');
  });
  it('prompt: yopiq toifalar nomi bor, boshqa ishchilar ro‘yxati bor, o‘zini bajaruvchi emas', () => {
    const p = kasbPrompti(kasb, ['obyektlar', 'ombor'], ['moliya', 'kadr']);
    expect(p).toContain('Prorab yordamchisi'); expect(p).toContain('YOPIQ toifalar'); expect(p).toContain('to‘lov, xarajat'); expect(p).toContain('Bugalter yordamchisi: To‘lov');
    expect(p).toContain('hech narsani bajarmaysan');
  });
  it('faktMatni uzunlikni cheklaydi', () => {
    expect(faktMatni({ a: 'x'.repeat(100) }, 50).endsWith('…[qisqartirildi]')).toBe(true);
    expect(faktMatni({ a: 1 })).toBe('{"a":1}');
  });
});

describe('javobniAjrat — model javobi hech qachon yo‘qolmaydi', () => {
  it('JSON: javob va harakatlar ajratiladi; yaroqsiz harakat tashlanadi', () => {
    const r = javobniAjrat('{"javob":"Tayyor","harakatlar":[{"amal":"ombor_kirim","parametrlar":{"obyekt_id":1,"obyomi":5},"tushuntirish":"Kirim","aniq":true},{"amal":"","parametrlar":{}},{"amal":"x","parametrlar":"matn"}]}');
    expect(r.javob).toBe('Tayyor'); expect(r.harakatlar).toHaveLength(1); expect(r.harakatlar[0]).toMatchObject({ amal: 'ombor_kirim', aniq: true });
  });
  it('markdown fence ichidagi JSON ham o‘qiladi', () => {
    expect(javobniAjrat('```json\n{"javob":"Salom","harakatlar":[]}\n```').javob).toBe('Salom');
  });
  it('JSON bo‘lmasa — butun matn oddiy javob; bo‘sh bo‘lsa xabar', () => {
    expect(javobniAjrat('Omborda 10 t sement bor.')).toEqual({ javob: 'Omborda 10 t sement bor.', harakatlar: [] });
    expect(javobniAjrat('').javob).toContain('bo‘sh');
  });
  it('aniq faqat true bo‘lganda true (taxminiy qiymatlar avto-bajarilmasin)', () => {
    expect(javobniAjrat('{"javob":"x","harakatlar":[{"amal":"eslatma","parametrlar":{"kalit":"a","mazmun":"b"},"tushuntirish":"","aniq":"ha"}]}').harakatlar[0].aniq).toBe(false);
  });
});

describe('harakatMatni', () => {
  it('faqat rolga ruxsat etilgan harakatlar sanaladi; taxmin qilmaslik qoidasi bor', () => {
    const m = harakatMatni(['ombor_chiqim', 'eslatma']);
    expect(m).toContain('ombor_chiqim'); expect(m).toContain('eslatma'); expect(m).not.toContain('grafik_foiz:'); expect(m).not.toContain('ombor_kirim:');
    expect(m).toContain('taxmin qilsang'); expect(m).toContain('FAQAT FAKTLARdan');
    expect(harakatMatni([])).toContain('harakat yo‘q');
  });
});
