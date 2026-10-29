import { describe, expect, it } from 'vitest';
import { mindmapJoyla, klaviaturaQadam } from './mindmap-korinish';
import { sintetikGraf } from './tizim-xaritasi.fixture';
import { boshlangichYigilgan, holatXaritaga, modulHolati, oldin, tizimDaraxtQur, MODUL_TARTIB } from './tizim-xaritasi';

describe('tizim xaritasi: graf → daraxt', () => {
  it('butun tizim: tizim → kompaniyalar + platforma → modullar (mavjud joylashuv bilan)', () => {
    const d = tizimDaraxtQur(sintetikGraf());
    expect(d.ildiz).toBe('tizim:0');
    const root = d.tugunlar.get('tizim:0')!;
    expect(root.tur).toBe('tizim');
    expect(root.bolalar).toEqual(['kompaniya:1', 'kompaniya:2', 'platforma:integratsiya']);
    const k1 = d.tugunlar.get('kompaniya:1')!;
    expect(k1.daraja).toBe(1);
    expect(k1.bolalar).toEqual(MODUL_TARTIB.map((m) => 'modul:1:' + m));
    expect(d.tugunlar.get('modul:1:f2')!.daraja).toBe(2);
    expect(d.tugunlar.get('modul:1:f2')!.holat).toBe('xavf');
    expect(d.tugunlar.get('modul:1:smeta')!.holat).toBe('etibor');
    expect(d.tugunlar.get('platforma:integratsiya')!.tur).toBe('platforma');
    expect(k1.holatSanoq).toEqual({ xavf: 1, etibor: 1, yaxshi: 5, nomalum: 0 });
    expect(d.tartib.length).toBe(1 + 3 + 14);
    // Mavjud mindmap joylashuvi va klaviatura shu daraxtda ishlaydi.
    const j = mindmapJoyla(d);
    expect(j.joylar.size).toBe(d.tartib.length);
    expect(klaviaturaQadam(d, j, 'kompaniya:1', j.tomon.get('kompaniya:1') === 1 ? 'ArrowRight' : 'ArrowLeft')).toBe('modul:1:smeta');
  });

  it('kompaniya filtri: ildiz — kompaniya, modullar 1-darajada', () => {
    const d = tizimDaraxtQur(sintetikGraf({ filtr: 2 }));
    expect(d.ildiz).toBe('kompaniya:2');
    const root = d.tugunlar.get('kompaniya:2')!;
    expect(root.daraja).toBe(0);
    expect(root.bolalar.length).toBe(7);
    expect(d.tugunlar.get('modul:2:ombor')!.daraja).toBe(1);
    expect(d.tugunlar.get('modul:2:ombor')!.tizim?.meta.modul).toBe('ombor');
  });

  it('yetim modul tashlanadi; bo‘sh graf yiqilmaydi', () => {
    const g = sintetikGraf();
    g.tugunlar.push({ id: 'modul:99:smeta', tur: 'modul', nom: 'smeta', meta: { kompaniya_id: 99, modul: 'smeta' } });
    expect(tizimDaraxtQur(g).tugunlar.has('modul:99:smeta')).toBe(false);
    const bosh = tizimDaraxtQur({ tugunlar: [], bogichlar: [] });
    expect(bosh.tartib).toEqual(['tizim:0']);
  });

  it('ko‘p kompaniyada muammosizlar boshida yig‘iladi, xatolilar ochiq qoladi', () => {
    const d = tizimDaraxtQur(sintetikGraf());
    expect(boshlangichYigilgan(d).size).toBe(0);
    expect([...boshlangichYigilgan(d, 1)]).toEqual(['kompaniya:2']);
  });
});

describe('tizim xaritasi: modul holati', () => {
  it('server holati ustun', () => {
    expect(modulHolati({ holat: 'diqqat', xato_24s: 5 })).toBe('diqqat');
  });
  it('holat kelmasa — sonlardan: xato > diqqat (kritik/qotgan) > ok', () => {
    expect(modulHolati({ xato_24s: 1, kritik_signal: 3 })).toBe('xato');
    expect(modulHolati({ xato_24s: 0, kritik_signal: 1 })).toBe('diqqat');
    expect(modulHolati({ xato_24s: 0, navbat_qotgan: 2 })).toBe('diqqat');
    expect(modulHolati({ xato_24s: 0, kritik_signal: 0, navbat_qotgan: 0 })).toBe('ok');
  });
  it('son ham, holat ham yo‘q — noma’lum (yolg‘on «ok» emas)', () => {
    expect(modulHolati({})).toBeNull();
    expect(modulHolati(null)).toBeNull();
    expect(holatXaritaga(null)).toBe('nomalum');
  });
  it('palitra: ok — yashil, diqqat — sariq, xato — qizil', () => {
    expect(holatXaritaga('ok')).toBe('yaxshi');
    expect(holatXaritaga('diqqat')).toBe('etibor');
    expect(holatXaritaga('xato')).toBe('xavf');
  });
  it('nisbiy vaqt', () => {
    const hozir = Date.parse('2026-10-27T10:00:00Z');
    expect(oldin('2026-10-27T09:59:30Z', hozir)).toBe('hozirgina');
    expect(oldin('2026-10-27T09:55:00Z', hozir)).toBe('5 daqiqa oldin');
    expect(oldin('2026-10-27T07:00:00Z', hozir)).toBe('3 soat oldin');
    expect(oldin(null, hozir)).toBe('—');
  });
});

describe('tizim xaritasi: buzuq server javobi sahifani yiqitmaydi (2026-10-28 prod xatosi)', () => {
  it('tugunlar orasida null bo‘lsa — qolganlari chiziladi, null tashlanadi', async () => {
    const { tizimGrafTozala } = await import('../api/t2-tizim-xaritasi');
    const g = sintetikGraf();
    const buzuq = { ...g, tugunlar: [...g.tugunlar.slice(0, 3), null, ...g.tugunlar.slice(3)] as unknown as typeof g.tugunlar,
      bogichlar: [...g.bogichlar, null, { manba: 'yoq:1', maqsad: 'yoq:2', tur: 'x' }] as unknown as typeof g.bogichlar,
      oxirgi_hodisalar: [null, ...(g.oxirgi_hodisalar ?? [])] as unknown as typeof g.oxirgi_hodisalar };
    const toza = tizimGrafTozala(buzuq);
    expect(toza.tugunlar).toHaveLength(g.tugunlar.length);
    expect(toza.bogichlar.every((b) => !!b && toza.tugunlar.some((n) => n.id === b.manba))).toBe(true);
    expect(toza.oxirgi_hodisalar.every(Boolean)).toBe(true);
    expect(() => tizimDaraxtQur(buzuq)).not.toThrow();
    expect(tizimDaraxtQur(buzuq).tugunlar.size).toBe(tizimDaraxtQur(g).tugunlar.size);
  });
});
