import { describe, expect, it } from 'vitest';
import { savolYasa, tarixNomlari, tarixdanMosla, xomOqi } from './tushun';
import { oddiyTahlil, qismanBuyruq, buyruqBirlashtir, buyruqTekshir } from '../../../functions/_shared/ombor-buyruq-yadro';

// Faqat sintetik jumlalar va nomlar.
const HOZIR = new Date('2026-11-17T08:00:00Z');
const x = (s: string) => xomOqi(s, HOZIR);

type Kutilgan = { yonalish?: 'prixod' | 'chiqim'; miqdor?: number; birlik?: string; nomi?: string | RegExp; kontragent?: string | null; obyekt?: string | null; narx?: number | null; narx_jami?: number | null; narx_rejim?: 'bilan' | 'siz' | null; sana?: string | null };
const MISOLLAR: [string, Kutilgan][] = [
  // o'zbek lotin — kirim
  ['10 qop sement keldi', { yonalish: 'prixod', miqdor: 10, birlik: 'мешок', nomi: 'sement', kontragent: null }],
  ['Akmaldan 2 tonna armatura 12 lik oldik 8 mln', { yonalish: 'prixod', miqdor: 2, birlik: 'тн', nomi: 'armatura 12', kontragent: 'Akmal', narx: 8_000_000, narx_jami: null, narx_rejim: null }],
  ['sement 50 qop keldi 1,5 mln', { yonalish: 'prixod', miqdor: 50, nomi: 'sement', narx: 1_500_000 }],
  ['100 dona g\'isht keldi narxi 1200 QQS bilan', { yonalish: 'prixod', miqdor: 100, birlik: 'шт', nomi: "g'isht", narx: 1200, narx_rejim: 'bilan' }],
  ['Karimdan 3 tonna qum oldik qqs siz 450 ming', { yonalish: 'prixod', miqdor: 3, nomi: 'qum', kontragent: 'Karim', narx_rejim: 'siz', narx: 450_000 }],
  ['kecha 20 dona kabel keldi', { yonalish: 'prixod', miqdor: 20, nomi: 'kabel', sana: '2026-11-16' }],
  ['mix 40 kg olindi', { yonalish: 'prixod', miqdor: 40, birlik: 'кг', nomi: 'mix' }],
  ['Sherzoddan 15 metr kabel 3x2.5 oldim', { yonalish: 'prixod', miqdor: 15, birlik: 'м', kontragent: 'Sherzod' }],
  ['25 kg bo\'yoq keldi, narxi 80 ming ndssiz', { yonalish: 'prixod', miqdor: 25, birlik: 'кг', nomi: "bo'yoq", narx: 80_000, narx_rejim: 'siz' }],
  ['sementni 10 qop oldik', { yonalish: 'prixod', miqdor: 10, nomi: 'sement' }],
  ['o\'n besh qop sement keldi', { yonalish: 'prixod', miqdor: 15, nomi: 'sement' }],
  ['ikki tonna armatura keldi', { yonalish: 'prixod', miqdor: 2, birlik: 'тн', nomi: 'armatura' }],
  // imlo xatolari
  ['10 qop sement keldii', { yonalish: 'prixod', miqdor: 10, nomi: 'sement' }],
  ['10 qop sement kedi', { yonalish: 'prixod', miqdor: 10, nomi: 'sement' }],
  ['5 ta lampa chqdi', { yonalish: 'chiqim', miqdor: 5, nomi: 'lampa' }],
  // o'zbek lotin — chiqim
  ['5 ta lampa chiqdi 3-blokka', { yonalish: 'chiqim', miqdor: 5, birlik: 'шт', nomi: 'lampa', obyekt: '3-blok' }],
  ['qum 9 m3 prorab Aliga berdim', { yonalish: 'chiqim', miqdor: 9, birlik: 'м3', nomi: 'qum', kontragent: 'Ali' }],
  ['12 qop sement ketdi 2-blok', { yonalish: 'chiqim', miqdor: 12, nomi: 'sement', obyekt: '2-blok' }],
  ['bugun 30 metr kabel berildi Vohidga', { yonalish: 'chiqim', miqdor: 30, birlik: 'м', nomi: 'kabel', kontragent: 'Vohid' }],
  ['4 dona eshik chiqdi blok 5', { yonalish: 'chiqim', miqdor: 4, nomi: 'eshik', obyekt: '5-blok' }],
  // kirill (o'zbek)
  ['10 қоп цемент келди', { yonalish: 'prixod', miqdor: 10, birlik: 'мешок', nomi: 'цемент' }],
  ['Акмалдан 2 тонна арматура олдик', { yonalish: 'prixod', miqdor: 2, birlik: 'тн', nomi: 'арматура', kontragent: 'Акмал' }],
  ['5 та лампа чиқди', { yonalish: 'chiqim', miqdor: 5, birlik: 'шт', nomi: 'лампа' }],
  // rus
  ['пришло 20 мешков цемента', { yonalish: 'prixod', miqdor: 20, birlik: 'мешок', nomi: 'цемент' }],
  ['Приход цемент 10,5 тонн от Тест-Снаб', { yonalish: 'prixod', miqdor: 10.5, birlik: 'тн', nomi: 'цемент', kontragent: 'Тест-Снаб' }],
  ['выдано 5 штук арматуры 12 прорабу Алишеру', { yonalish: 'chiqim', miqdor: 5, birlik: 'шт', kontragent: 'Алишер' }],
  ['расход 30 кг гвоздей', { yonalish: 'chiqim', miqdor: 30, birlik: 'кг' }],
  ['получили 2 тонны арматуры за 14 млн с НДС', { yonalish: 'prixod', miqdor: 2, birlik: 'тн', nomi: 'арматура', narx_rejim: 'bilan', narx_jami: 14_000_000, narx: 7_000_000 }],
  ['вчера пришло 100 штук кирпича цена 1200 без НДС', { yonalish: 'prixod', miqdor: 100, birlik: 'шт', nomi: 'кирпич', narx: 1200, narx_rejim: 'siz', sana: '2026-11-16' }],
  ['завезли 8 рулонов рубероида от Строй Тест', { yonalish: 'prixod', miqdor: 8, birlik: 'рулон', nomi: 'рубероид' }],
  ['списано 3 листа гипсокартона', { yonalish: 'chiqim', miqdor: 3, birlik: 'лист' }],
  ['отпущено 7 мешков цемента на 3 блок', { yonalish: 'chiqim', miqdor: 7, birlik: 'мешок', nomi: 'цемент', obyekt: '3-блок' }],
  // aralash
  ['Sement M400 10 tonna Akmal MChJdan keldi', { yonalish: 'prixod', miqdor: 10, birlik: 'тн' }],
  ['2 ming dona g\'isht keldi', { yonalish: 'prixod', miqdor: 2000, birlik: 'шт', nomi: "g'isht" }],
  ['1 200 000 so\'m 4 qop elim keldi', { yonalish: 'prixod', miqdor: 4, nomi: 'elim', narx: 1_200_000 }],
];

describe('xomOqi: real jumlalar (o\'zbek lotin/kirill, rus, imlo xatosi)', () => {
  it.each(MISOLLAR)('%s', (matn, k) => {
    const q = x(matn);
    if (k.yonalish) expect(q.yonalish).toBe(k.yonalish);
    if (k.miqdor != null) expect(q.miqdor).toBe(k.miqdor);
    if (k.birlik) expect(q.birlik).toBe(k.birlik);
    if (k.nomi instanceof RegExp) expect(q.nomi).toMatch(k.nomi); else if (k.nomi) expect(q.nomi?.toLowerCase()).toBe(k.nomi.toLowerCase());
    if (k.kontragent !== undefined) expect(q.kontragent).toBe(k.kontragent);
    if (k.obyekt !== undefined) expect(q.obyekt).toBe(k.obyekt);
    if (k.narx !== undefined) expect(q.narx).toBe(k.narx);
    if (k.narx_jami !== undefined) expect(q.narx_jami).toBe(k.narx_jami);
    if (k.narx_rejim !== undefined) expect(q.narx_rejim).toBe(k.narx_rejim);
    if (k.sana !== undefined) expect(q.sana).toBe(k.sana);
  });

  it('«jami/за» aytilsa — summa miqdorga bo\'linadi va eslatma beriladi; yalang\'och yoki «narxi» — birlik narxi', () => {
    const j = x('2 tonna armatura keldi jami 16 mln');
    expect(j).toMatchObject({ narx: 8_000_000, narx_jami: 16_000_000 });
    expect(j.eslatmalar.join(' ')).toMatch(/jami summa/);
    expect(x('Akmaldan 2 tonna armatura 12 lik oldik 8 mln').eslatmalar).toEqual([]);
    expect(x('100 dona g\'isht keldi narxi 1200').eslatmalar).toEqual([]);
  });
  it('yo\'nalish aytilmasa — null, ishora bilan taxmin', () => {
    expect(x('Akmaldan 2 tonna armatura').yonalish).toBeNull();
    expect(x('Akmaldan 2 tonna armatura').taxmin).toBe('prixod');
    expect(x('5 ta lampa 3-blokka').taxmin).toBe('chiqim');
  });
});

describe('oddiyTahlil: yangi tahlil eski xatti-harakatni buzmaydi', () => {
  const t = (s: string) => oddiyTahlil(s, HOZIR);
  it('to\'liq buyruq — yuqori ishonch; narx va QQS rejimi buyruqqa tushadi', () => {
    const r = t('Akmaldan 2 tonna armatura 12 lik oldik 8 mln');
    expect(r.ishonch).toBe('yuqori');
    expect(r.buyruq).toMatchObject({ amal: 'prixod', miqdor: 2, birlik: 'тн', nomi: 'armatura 12', kontragent: 'Akmal', narx: 8_000_000, narx_rejim: null });
  });
  it('chiqimda narx tushmaydi', () => {
    expect(t('5 ta lampa chiqdi 3-blokka narxi 5000').buyruq).toMatchObject({ amal: 'chiqim', narx: null, obyekt: '3-blok' });
  });
  it('raqam so\'zi — past ishonch (LLM tekshiradi), lekin qiymat bor', () => {
    const r = t('o\'n besh qop sement keldi');
    expect(r.ishonch).toBe('past');
    expect(r.buyruq?.miqdor).toBe(15);
  });
  it('savollar buyruqqa aylanmaydi', () => {
    expect(t('o\'tgan oy sement qancha keldi').buyruq?.amal).toBe('hisobot');
    expect(t('сколько осталось песка').buyruq?.amal).toBe('qoldiq');
    expect(t('bugungi qoldiq').buyruq?.amal).toBe('qoldiq');
  });
  it('tuzatish/bekor yo\'li o\'zgarmagan', () => {
    expect(t('#123 ni 50 ga o\'zgartir').buyruq).toMatchObject({ amal: 'tuzat', harakat_id: 123, miqdor: 50 });
    expect(t('bekor qil №77').buyruq).toMatchObject({ amal: 'bekor', harakat_id: 77 });
  });
  it('yo\'nalishsiz gap — qisman natija (savol uchun), buyruq yo\'q; ma\'nosiz gap — qisman ham yo\'q', () => {
    const r = t('Akmaldan 2 tonna armatura');
    expect(r.buyruq).toBeNull();
    expect(r.qisman).toMatchObject({ taxmin: 'prixod', miqdor: 2, kontragent: 'Akmal' });
    expect(t('salom qalaysan')).toMatchObject({ buyruq: null, qisman: null });
  });
  it('qismanBuyruq / buyruqBirlashtir: LLM bo\'sh qoldirganini matn to\'ldiradi', () => {
    const q = x('Akmaldan 2 tonna armatura 12 lik oldik 8 mln');
    const llm = buyruqTekshir({ amal: 'prixod', nomi: 'armatura 12', miqdor: 2, birlik: 'тн' });
    expect(buyruqBirlashtir(llm!, q)).toMatchObject({ kontragent: 'Akmal', narx: 8_000_000 });
    expect(qismanBuyruq(q, 'chiqim').narx).toBeNull();
  });
  it('LLM «jami» narxni birlik narxiga keltiradi', () => {
    expect(buyruqTekshir({ amal: 'prixod', nomi: 'sement', miqdor: 10, narx: 1_000_000, narx_turi: 'jami' })?.narx).toBe(100_000);
    expect(buyruqTekshir({ amal: 'prixod', nomi: 'sement', miqdor: 10, narx: 90_000, narx_turi: 'birlik' })?.narx).toBe(90_000);
  });
});

describe('tarixdanMosla: material/yetkazuvchini kompaniya tarixiga moslash', () => {
  const yoz = [
    { operatsiya: 'prixod', nomi: 'Sement M400', birligi: 'qop', postavshik: 'Akmal Savdo', sana: '2026-11-01' },
    { operatsiya: 'prixod', nomi: 'Sement M400', birligi: 'qop', postavshik: 'Akmal Savdo', sana: '2026-11-02' },
    { operatsiya: 'prixod', nomi: 'Armatura 12', birligi: 'tn', postavshik: 'Akmal Trans', sana: '2026-11-03' },
    { operatsiya: 'prixod', nomi: 'Armatura 16', birligi: 'tn', postavshik: 'Karim Metall', sana: '2026-11-04' },
    { operatsiya: 'prixod', nomi: 'Лампа LED 9W', birligi: 'шт', postavshik: 'Тест-Электро', sana: '2026-11-05' },
    { operatsiya: 'rasxod', nomi: 'Sement M400', birligi: 'qop', qabul_qiluvchi: 'Ali prorab', sana: '2026-11-06' },
  ];
  const n = tarixNomlari(yoz, 'prixod');
  it('nomlar va birliklar', () => {
    expect(n.materiallar).toContain('Sement M400');
    expect(n.birlik.get('Armatura 12')).toBe('tn');
    expect(n.kontragentlar).toEqual(['Akmal Savdo', 'Akmal Trans', 'Karim Metall', 'Тест-Электро']);
    expect(tarixNomlari(yoz, 'chiqim').kontragentlar).toEqual(['Ali prorab']);
  });
  it('imlo xatosi va o\'lcham', () => {
    expect(tarixdanMosla('armatora 12', n.materiallar)).toMatchObject({ holat: 'aniq', tanlangan: 'Armatura 12' });
    expect(tarixdanMosla('armatura 16', n.materiallar)).toMatchObject({ holat: 'aniq', tanlangan: 'Armatura 16' });
    expect(tarixdanMosla('sement', n.materiallar)).toMatchObject({ holat: 'aniq', tanlangan: 'Sement M400' });
  });
  it('lotin ↔ kirill', () => {
    expect(tarixdanMosla('Test Elektro', n.kontragentlar)).toMatchObject({ holat: 'aniq', tanlangan: 'Тест-Электро' });
    expect(tarixdanMosla('лампа', n.materiallar).tanlangan).toBe('Лампа LED 9W');
  });
  it('bir nechta yaqin — noaniq; yangi nom — yoq', () => {
    expect(tarixdanMosla('Akmal', n.kontragentlar)).toMatchObject({ holat: 'noaniq', nomzodlar: ['Akmal Savdo', 'Akmal Trans'] });
    expect(tarixdanMosla('Rustam', n.kontragentlar)).toMatchObject({ holat: 'yoq', tanlangan: null });
    expect(tarixdanMosla('Akmal', ['Akmal', 'Akmal Savdo'])).toMatchObject({ holat: 'aniq', tanlangan: 'Akmal' });
  });
  it('rus kelishigi: «Акмала» → «Акмал»', () => {
    expect(tarixdanMosla('Акмала', ['Акмал', 'Карим']).tanlangan).toBe('Акмал');
  });
});

describe('savolYasa: «tushunmadim» o\'rniga bitta qisqa savol', () => {
  it('yo\'nalish noma\'lum — kirimmi/chiqimmi (ishoraga qarab tartib)', () => {
    const s = savolYasa(x('Akmaldan 2 tonna armatura'))!;
    expect(s.kod).toBe('yonalish');
    expect(s.variantlar.map((v) => v.tanlov.amal)).toEqual(['prixod', 'chiqim']);
    expect(savolYasa(x('5 ta lampa 3-blokka'))!.variantlar[0].tanlov.amal).toBe('chiqim');
  });
  it('miqdor yo\'q — qancha; nom yo\'q — takliflar bilan', () => {
    expect(savolYasa(x('sement keldi'))).toMatchObject({ kod: 'miqdor' });
    expect(savolYasa(x('10 qop keldi'), { materiallar: ['Sement M400', 'Armatura 12'] })).toMatchObject({ kod: 'nomi', variantlar: [{ yorliq: 'Sement M400' }, { yorliq: 'Armatura 12' }] });
  });
  it('yetkazuvchi noaniq — takliflar; to\'liq va aniq — savol yo\'q; bo\'sh — misol', () => {
    const q = x('Akmaldan 10 qop sement keldi');
    expect(savolYasa(q, { kontragent: { holat: 'noaniq', tanlangan: null, nomzodlar: ['Akmal Savdo', 'Akmal Trans'] } })).toMatchObject({ kod: 'kontragent', variantlar: [{ tanlov: { kontragent: 'Akmal Savdo' } }, { tanlov: { kontragent: 'Akmal Trans' } }] });
    expect(savolYasa(q)).toBeNull();
    expect(savolYasa(null)?.savol).toMatch(/Masalan/);
  });
});
