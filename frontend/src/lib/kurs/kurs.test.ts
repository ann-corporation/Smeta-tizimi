import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MEMBERSHIP_ROLES, PERMISSIONS } from '../company-authorization/effective-authorization';
import { SAHIFALAR } from '../reestr/sahifa';
import { niyatAniqla } from '../yordamchi/niyat';
import { menyuQur, menyuYollari } from '../nav/navFiltr';
import { DARSLAR } from './darslar';
import { korsatkichAjrat } from './model';
import { korsatkichElementi } from './element';
import { bajarilganlar, darsBajarildi, joriyOl, joriyniSaqla, xotiraTozala } from './progress';
import { kursTavsiya } from './tavsiya';
import { darsSavoli, koRsatHavolasi } from './tutor';
import { keyingiDars, kursYoli, qolganDaqiqa, sahifaDarslari, sahifaYoli } from './yol';
import { yurishYangila, type YurishHolat } from './yurish';
import lugat from '../../i18n/lugat/qism/kurs.json';

/* ---------- Manba skaneri: ko‘rsatkich (data-kurs / data-testid) manbada bormi ---------- */
function manbaFayllari(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') manbaFayllari(p, out); }
    else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}
const MANBA = manbaFayllari(join(process.cwd(), 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');

const ids = (ro: readonly string[]) => ro.map((r) => DARSLAR.find((d) => d.id === r));
const yolID = (k: Parameters<typeof kursYoli>[0]) => kursYoli(k).darslar.map((d) => d.id);

describe('kurs qo‘riqchisi: darslar reestrlarga mos (UI o‘zgarsa shu yerda yiqiladi)', () => {
  it('dars id lari yagona, qadamlar 1..7, oldin va talab to‘g‘ri', () => {
    expect(new Set(DARSLAR.map((d) => d.id)).size).toBe(DARSLAR.length);
    for (const d of DARSLAR) {
      expect(d.qadamlar.length, `${d.id}: qadamlar 1..7`).toBeGreaterThanOrEqual(1);
      expect(d.qadamlar.length, `${d.id}: qadamlar ≤ 7`).toBeLessThanOrEqual(7);
      for (const o of d.oldin) expect(DARSLAR.some((x) => x.id === o), `${d.id}: oldin ${o}`).toBe(true);
      for (const c of d.talab) expect((PERMISSIONS as readonly string[]).includes(c), `${d.id}: talab ${c} — noma’lum capability`).toBe(true);
      for (const r of d.rollar) expect(r === '*' || (MEMBERSHIP_ROLES as readonly string[]).includes(r), `${d.id}: rol ${r}`).toBe(true);
    }
  });

  it('har qadam sahifasi reestrda bor; «menyu:» ko‘rsatkichi reestr kaliti', () => {
    for (const d of DARSLAR) for (const [i, s] of d.qadamlar.entries()) {
      expect(sahifaYoli(s.sahifa), `${d.id} qadam ${i + 1}: sahifa «${s.sahifa}» reestrda yo‘q — darsni yangilang`).toBeTruthy();
      if (s.korsatkich) {
        const a = korsatkichAjrat(s.korsatkich);
        expect(a, `${d.id} qadam ${i + 1}: ko‘rsatkich «${s.korsatkich}» noto‘g‘ri`).not.toBeNull();
        if (a?.tur === 'menyu') expect(sahifaYoli(a.id), `${d.id} qadam ${i + 1}: menyu:${a.id} reestrda yo‘q`).toBeTruthy();
      }
    }
  });

  it('har «kurs:» va «testid:» ko‘rsatkichi manbada mavjud', () => {
    for (const d of DARSLAR) for (const [i, s] of d.qadamlar.entries()) {
      const a = s.korsatkich ? korsatkichAjrat(s.korsatkich) : null;
      if (a?.tur === 'kurs') expect(MANBA.includes(`data-kurs="${a.id}"`), `${d.id} qadam ${i + 1}: data-kurs="${a.id}" manbada yo‘q`).toBe(true);
      if (a?.tur === 'testid') expect(MANBA.includes(`data-testid="${a.id}"`), `${d.id} qadam ${i + 1}: data-testid="${a.id}" manbada yo‘q`).toBe(true);
    }
  });

  it('ru/en: «Birinchi kun», PTO va usta darslari to‘liq tarjimalangan', () => {
    const L = lugat as Record<string, { ru?: string; en?: string }>;
    const kerak = (s: string, joy: string) => { expect(L[s]?.ru && L[s]?.en, `${joy}: tarjima yo‘q — «${s}» (i18n/lugat/qism/kurs.json)`).toBeTruthy(); };
    for (const d of DARSLAR.filter((x) => ['birinchi', 'pto', 'usta'].includes(x.guruh))) {
      [d.nom, d.maqsad, d.nega, ...d.xatolar].forEach((s) => kerak(s, d.id));
      d.qadamlar.forEach((s) => { kerak(s.matn, d.id); if (s.natija) kerak(s.natija, d.id); });
    }
  });
});

describe('individual yo‘l (rol + ruxsat)', () => {
  it('PTO: smetadan F2 gacha zanjir, buxgalteriya va usta darslari YO‘Q', () => {
    const y = yolID({ rol: 'pto' });
    expect(y).toEqual(expect.arrayContaining(['birinchi-kun', 'pto-obyekt', 'pto-smeta-yuklash', 'pto-narx', 'pto-nakrutka', 'pto-fakt', 'pto-f2', 'pto-forma3', 'pto-yuborish']));
    expect(y.filter((id) => id.startsWith('buxgalter-') || id.startsWith('usta-') || id.startsWith('direktor-'))).toEqual([]);
    expect(y.indexOf('pto-smeta-yuklash')).toBeLessThan(y.indexOf('pto-f2'));
    expect(y.indexOf('pto-fakt')).toBeLessThan(y.indexOf('pto-f2'));
    expect(y.indexOf('pto-f2')).toBeLessThan(y.indexOf('pto-forma3'));
  });

  it('usta: faqat telefon darslari (birinchi kun + 3 usta darsi)', () => {
    const y = kursYoli({ rol: 'usta' });
    const idlar = y.darslar.map((d) => d.id);
    expect(idlar.filter((id) => id !== 'birinchi-kun').sort()).toEqual(['usta-bajardim', 'usta-bugun', 'usta-foto']);
    expect(y.darslar.filter((d) => d.id !== 'birinchi-kun').every((d) => d.telefon)).toBe(true);
    expect(idlar.some((id) => id.startsWith('pto-') || id.startsWith('buxgalter-'))).toBe(false);
  });

  it('buxgalter: pul zanjiri bor, F2/smeta darslari yo‘q', () => {
    const y = yolID({ rol: 'bugalter' });
    expect(y).toEqual(expect.arrayContaining(['buxgalter-tolov', 'buxgalter-bank', 'buxgalter-davr', 'buxgalter-hisobot']));
    expect(y.filter((id) => id.startsWith('pto-'))).toEqual([]);
  });

  it('direktor, buyurtmachi, texnadzor, yetkazuvchi o‘z darslarini oladi', () => {
    expect(yolID({ rol: 'boss' })).toEqual(expect.arrayContaining(['direktor-pult', 'direktor-foyda', 'direktor-solishtiruv']));
    expect(yolID({ rol: 'buyurtmachi' })).toEqual(expect.arrayContaining(['buyurtmachi-kabinet', 'buyurtmachi-qabul']));
    expect(yolID({ rol: 'inspektor' })).toContain('texnadzor-tekshiruv');
    expect(yolID({ rol: 'taminotchi' })).toEqual(expect.arrayContaining(['yetkazuvchi-bugun', 'yetkazuvchi-taklif']));
  });

  it('prorab: nazorat darslari; subpudratchi darsi faqat tomon=subpudratchi bo‘lsa', () => {
    expect(yolID({ rol: 'prorab' })).toEqual(expect.arrayContaining(['prorab-fakt', 'prorab-naryad', 'prorab-material']));
    expect(yolID({ rol: 'prorab' }).some((id) => id.startsWith('subpudratchi-'))).toBe(false);
    expect(yolID({ rol: 'prorab', tomon: 'subpudratchi' })).toEqual(expect.arrayContaining(['subpudratchi-bugun', 'subpudratchi-akt']));
  });

  it('ruxsat berilmagan bo‘lsa dars chiqmaydi (menyuda yo‘q sahifa)', () => {
    // narx.write yo‘q PTO: narxlash darsi yo‘q
    const perms = ['company.read', 'object.read', 'smeta.read', 'fakt.write', 'f2.prepare', 'f2.read', 'object.write', 'project.read'];
    const y = yolID({ rol: 'pto', permissions: perms });
    expect(y).not.toContain('pto-narx');
    expect(y).toContain('pto-fakt');
    expect(yolID({ rol: '' })).toEqual([]);
  });

  it('har dars yo‘lidagi hamma sahifa foydalanuvchi menyusida (yo‘l = menyu bilan izchil)', () => {
    for (const rol of ['pto', 'usta', 'bugalter', 'boss', 'prorab', 'buyurtmachi', 'inspektor', 'taminotchi']) {
      const yol = new Set(menyuYollari(menyuQur({ superadmin: false, rol })));
      for (const d of kursYoli({ rol }).darslar) for (const s of d.qadamlar) expect(yol.has(sahifaYoli(s.sahifa)!), `${rol}/${d.id}: ${s.sahifa} menyuda yo‘q`).toBe(true);
    }
  });

  it('tartib: oldingi dars avval; keyingi dars va qolgan daqiqa progressga bog‘liq', () => {
    const y = kursYoli({ rol: 'pto' });
    expect(keyingiDars(y, new Set())?.id).toBe('birinchi-kun');
    expect(keyingiDars(y, new Set(['birinchi-kun']))?.id).toBe('pto-obyekt');
    const hammasi = new Set(y.darslar.map((d) => d.id));
    expect(keyingiDars(y, hammasi)).toBeNull();
    expect(qolganDaqiqa(y, hammasi)).toBe(0);
    expect(qolganDaqiqa(y, new Set())).toBe(y.jamiDaqiqa);
  });

  it('sahifa bo‘yicha: F2 tayyorlash sahifasida PTO ga F2 darsi ko‘rinadi', () => {
    const y = kursYoli({ rol: 'pto' });
    expect(sahifaDarslari(y, '/admin/f2-tayyorlash').map((d) => d.id)).toContain('pto-f2');
    expect(sahifaDarslari(kursYoli({ rol: 'usta' }), '/admin/f2-tayyorlash')).toEqual([]);
  });

  it('reestrda «kurs» sahifasi hamma uchun ochiq', () => {
    expect(SAHIFALAR.find((s) => s.kalit === 'kurs')?.ruxsat).toEqual([]);
    for (const rol of ['usta', 'pto', 'buyurtmachi']) expect(menyuYollari(menyuQur({ superadmin: false, rol }))).toContain('/admin/kurs');
  });
});

describe('yo‘l-yo‘riq holat mashinasi', () => {
  const N = 5;
  it('boshla → keyingi → … → tugadi', () => {
    let h: YurishHolat = yurishYangila(null, { tur: 'boshla', dars: 'pto-f2' }, N).holat;
    expect(h).toEqual({ dars: 'pto-f2', qadam: 0, otkazilgan: [] });
    for (let i = 1; i < N; i++) { const r = yurishYangila(h, { tur: 'keyingi' }, N); h = r.holat; expect(h?.qadam).toBe(i); expect(r.tugadi).toBe(false); }
    const oxir = yurishYangila(h, { tur: 'keyingi' }, N);
    expect(oxir).toEqual({ holat: null, tugadi: true, chiqdi: false });
  });
  it('oldingi 0 dan pastga tushmaydi; o‘tkazish qadamni belgilaydi', () => {
    let h = yurishYangila(null, { tur: 'boshla', dars: 'x' }, N).holat;
    expect(yurishYangila(h, { tur: 'oldingi' }, N).holat?.qadam).toBe(0);
    h = yurishYangila(h, { tur: 'otkaz' }, N).holat;
    expect(h).toEqual({ dars: 'x', qadam: 1, otkazilgan: [0] });
  });
  it('chiqish → holat null; davom (qadamdan boshlash) tiklanadi', () => {
    const h = yurishYangila(null, { tur: 'boshla', dars: 'x', qadam: 3 }, N).holat;
    expect(h?.qadam).toBe(3);
    expect(yurishYangila(h, { tur: 'chiqish' }, N)).toEqual({ holat: null, tugadi: false, chiqdi: true });
    expect(yurishYangila(null, { tur: 'boshla', dars: 'x', qadam: 99 }, N).holat?.qadam).toBe(N - 1);
  });
  it('holatsiz amallar zararsiz', () => {
    for (const a of [{ tur: 'keyingi' }, { tur: 'oldingi' }, { tur: 'otkaz' }, { tur: 'chiqish' }] as const) expect(yurishYangila(null, a, N)).toEqual({ holat: null, tugadi: false, chiqdi: false });
  });
});

describe('progress (foydalanuvchi bo‘yicha ajratilgan, bir necha bayt)', () => {
  beforeEach(() => { xotiraTozala(); try { localStorage.clear(); } catch { /* */ } });

  it('A ning progressi B ga ta’sir qilmaydi', () => {
    darsBajarildi('A', 'pto-f2');
    joriyniSaqla('A', 'pto-fakt', 2);
    expect([...bajarilganlar('A')]).toEqual(['pto-f2']);
    expect([...bajarilganlar('B')]).toEqual([]);
    expect(joriyOl('B')).toBeNull();
    expect(joriyOl('A')).toEqual({ dars: 'pto-fakt', qadam: 2 });
  });
  it('tugagan dars «yarim qolgan» belgisini olib tashlaydi; saqlash kichik', () => {
    joriyniSaqla('A', 'pto-f2', 3);
    darsBajarildi('A', 'pto-f2');
    expect(joriyOl('A')).toBeNull();
    for (const d of DARSLAR) darsBajarildi('A', d.id);
    expect((localStorage.getItem('fz-kurs:A') ?? '').length).toBeLessThan(2000);
  });
  it('buzilgan xotira bo‘lsa ham ishlaydi', () => {
    localStorage.setItem('fz-kurs:Z', '{not json');
    expect([...bajarilganlar('Z')]).toEqual([]);
  });
});

describe('Jarvis repetitori', () => {
  const pto = kursYoli({ rol: 'pto' }).darslar;
  it('«F-2 ni qanday tayyorlayman?» → F2 darsi + «Ko‘rsat» havolasi', () => {
    const j = darsSavoli('F-2 ni qanday tayyorlayman?', { yol: pto });
    expect(j?.dars?.id).toBe('pto-f2');
    expect(j?.dars?.qadamlar.length).toBeGreaterThan(2);
    expect(koRsatHavolasi('pto-f2')).toBe('/admin/kurs?boshla=pto-f2');
  });
  it('fakt va smeta yuklash savollari', () => {
    expect(darsSavoli('faktni qanday kiritaman', { yol: pto })?.dars?.id).toBe('pto-fakt');
    expect(darsSavoli('smetani qanday yuklayman', { yol: pto })?.dars?.id).toBe('pto-smeta-yuklash');
    expect(darsSavoli('как загрузить смету', { yol: pto })).toBeNull(); // ruscha so‘zlar dars kalitlarida yo‘q: oqim AI ga o‘tadi
  });
  it('PTO ga buxgalter darsi aytilmaydi', () => {
    const j = darsSavoli('bank ko‘chirmasini qanday yuklayman', { yol: pto });
    expect(j?.dars?.id).not.toBe('buxgalter-bank');
    expect(darsSavoli('bank kochirmasini qanday yuklayman', { yol: kursYoli({ rol: 'bugalter' }).darslar })?.dars?.id).toBe('buxgalter-bank');
  });
  it('savol so‘zi yo‘q bo‘lsa (navigatsiya) — repetitor aralashmaydi', () => {
    expect(darsSavoli('F2 tayyorlashni och', { yol: pto })).toBeNull();
    expect(darsSavoli('narxsiz qatorlar', { yol: pto })).toBeNull();
  });
  it('faqat «kurs» desa — navigatsiya hal qiladi (repetitor aralashmaydi)', () => {
    expect(darsSavoli('kursni ko‘rsat', { yol: pto })).toBeNull();
  });
  it('niyatAniqla orqali ham ishlaydi (ochiq sahifalar bo‘yicha)', () => {
    const sahifalar = SAHIFALAR.filter((s) => s.kalit.startsWith('f2') || s.kalit === 'fakt' || s.kalit === 'obyektlar' || s.kalit === 'holat' || s.kalit === 'smeta-narxlash' || s.kalit === 'nakrutka' || s.kalit === 'kurs' || s.kalit === 'ish-joylarim' || s.kalit === 'nakopitelniy' || s.kalit === 'taqdimlar' || s.kalit === 'murojaatlar')
      .map((s) => ({ yol: s.yol, nom: s.nom, sinonimlar: [...s.sinonimlar] }));
    const n = niyatAniqla('F2 ni qanday tayyorlayman?', { sahifalar: sahifalar as never, obyektlar: [] });
    expect(n.tur).toBe('dars');
    if (n.tur === 'dars') expect(n.dars?.id).toBe('pto-f2');
  });
});

describe('ko‘rsatkich -> element (yoritish)', () => {
  it('menyu / kurs / testid ko‘rsatkichlari DOM dan topiladi; yo‘q bo‘lsa null (yo‘l-yo‘riq yiqilmaydi)', () => {
    document.body.innerHTML = `<a href="${sahifaYoli('f2-tayyorlash')}">F2</a><div data-kurs="jarvis"></div><div data-testid="usta-bugun"></div>`;
    expect(korsatkichElementi('menyu:f2-tayyorlash')?.tagName).toBe('A');
    expect(korsatkichElementi('kurs:jarvis')?.getAttribute('data-kurs')).toBe('jarvis');
    expect(korsatkichElementi('testid:usta-bugun')).not.toBeNull();
    expect(korsatkichElementi('kurs:yoq-element')).toBeNull();
    expect(korsatkichElementi(undefined)).toBeNull();
    expect(korsatkichElementi('noto-gri')).toBeNull();
    document.body.innerHTML = '';
  });
});

describe('kursTavsiya (usage-learning tikuvi)', () => {
  const y = kursYoli({ rol: 'pto' }).darslar;
  it('ishqalanishsiz — tartib o‘zgarmaydi', () => {
    expect(kursTavsiya([], y).map((d) => d.id)).toEqual(y.map((d) => d.id));
  });
  it('ishqalanishli dars oldinga suriladi, lekin oldingi darslari (bajarilmagan) undan avval', () => {
    const t = kursTavsiya({ 'f2-tayyorlash': 5 }, y).map((d) => d.id);
    expect(t.indexOf('pto-f2')).toBeLessThan(t.indexOf('pto-nakrutka'));
    expect(t.indexOf('pto-fakt')).toBeLessThan(t.indexOf('pto-f2'));
    expect(t.indexOf('pto-narx')).toBeLessThan(t.indexOf('pto-f2'));
    expect(new Set(t).size).toBe(y.length);
  });
  it('og‘irlik bo‘yicha tartib; bajarilganlar oxirga', () => {
    const t = kursTavsiya({ 'fakt-kiritish': 2, narxlash: 9 }, y, new Set(['birinchi-kun', 'pto-obyekt', 'pto-smeta-yuklash'])).map((d) => d.id);
    expect(t.indexOf('pto-narx')).toBeLessThan(t.indexOf('pto-fakt'));
    expect(t.slice(-3).sort()).toEqual(['birinchi-kun', 'pto-obyekt', 'pto-smeta-yuklash']);
  });
  it('ro‘yxat ko‘rinishidagi kalitlar ham qabul qilinadi', () => {
    const a = kursTavsiya(['f2-tayyorlash', 'f2-tayyorlash'], y).map((d) => d.id);
    const b = kursTavsiya({ 'f2-tayyorlash': 2 }, y).map((d) => d.id);
    expect(a).toEqual(b);
  });
  it('ids yordamchisi ishlaydi (qo‘riqchi)', () => { expect(ids(['pto-f2'])[0]?.id).toBe('pto-f2'); });
});
