import { describe, expect, it } from 'vitest';
import { FaoliyatIzi, IZ_SIGHIMI, sovushMs, taklifSababi, tugmaYorligi, yolNaqshi } from './agent-faoliyat';

describe('yolNaqshi', () => {
  it('ID, UUID va qidiruv qatori maskalanadi', () => {
    expect(yolNaqshi('/admin/obyekt/123/akt/45?q=maxfiy')).toBe('/admin/obyekt/:id/akt/:id');
    expect(yolNaqshi('/admin/hujjat/3f2504e0-4f89-11d3-9a0c-0305e82c3301/x#a')).toBe('/admin/hujjat/:id/x');
    expect(yolNaqshi('/admin/f2-import')).toBe('/admin/f2-import');
  });
});

describe('tugmaYorligi', () => {
  const tugma = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.querySelector('span,button') as Element; };
  it('data-agent-action ustun; aria-label; qisqa raqamsiz matn; aks holda umumiy', () => {
    expect(tugmaYorligi(tugma('<button data-agent-action="f2_saqlash" aria-label="x"><span>ichki</span></button>'))).toBe('f2_saqlash');
    expect(tugmaYorligi(tugma('<button aria-label="Saqlash"><span>q</span></button>'))).toBe('Saqlash');
    expect(tugmaYorligi(tugma('<button>Yuborish</button>'))).toBe('Yuborish');
    expect(tugmaYorligi(tugma('<button>Navoiy Ozerka #12 obyekti</button>'))).toBe('tugma');
    expect(tugmaYorligi(null)).toBe('tugma');
  });
});

describe('FaoliyatIzi', () => {
  it('sig‘im chegaralanadi, bo‘sh nom yozilmaydi, yuklash soniyada nisbiy vaqt beradi', () => {
    let t = 1_000_000;
    const iz = new FaoliyatIzi(() => t);
    iz.yoz('sahifa', '   '); expect(iz.hodisalar).toHaveLength(0);
    for (let i = 0; i < IZ_SIGHIMI + 10; i += 1) { iz.yoz('bosish', 'tugma ' + i); t += 1000; }
    expect(iz.hodisalar).toHaveLength(IZ_SIGHIMI);
    const y = iz.yuklash();
    expect(y[y.length - 1].t).toBe(1);
    expect(y[0].t).toBe(IZ_SIGHIMI);
  });
});

describe('taklifSababi (modelni arzon filtr bilan chaqirish)', () => {
  const h = (hozir: number, ...q: Array<[number, 'sahifa' | 'bosish' | 'xato' | 'saqlash']>) => q.map(([s, tur]) => ({ vaqt: hozir - s * 1000, tur, nom: 'x' }));
  const now = 10_000_000;
  it('oddiy ish — taklif yo‘q', () => expect(taklifSababi(h(now, [30, 'sahifa'], [20, 'bosish'], [5, 'bosish']), now)).toBeNull());
  it('90 s da 3 xato', () => expect(taklifSababi(h(now, [60, 'xato'], [40, 'xato'], [10, 'xato']), now)).toBe('xato_takrori'));
  it('2 xato + 2 saqlash urinishi', () => expect(taklifSababi(h(now, [50, 'saqlash'], [40, 'xato'], [30, 'saqlash'], [20, 'xato']), now)).toBe('xato_takrori'));
  it('60 s da 6 sahifa almashishi — adashish', () => expect(taklifSababi(h(now, [50, 'sahifa'], [45, 'sahifa'], [40, 'sahifa'], [30, 'sahifa'], [20, 'sahifa'], [10, 'sahifa']), now)).toBe('adashish'));
  it('xatodan keyin 2+ daqiqa jim — qotib qolish', () => expect(taklifSababi(h(now, [300, 'bosish'], [200, 'xato'], [150, 'bosish']), now)).toBe('qotib_qolish'));
  it('xatosiz jimlik — taklif yo‘q', () => expect(taklifSababi(h(now, [300, 'bosish'], [200, 'bosish']), now)).toBeNull());
});

describe('sovushMs', () => {
  it('har rad ikki baravar, 2 soatdan oshmaydi', () => {
    expect(sovushMs(0)).toBe(5 * 60_000); expect(sovushMs(1)).toBe(10 * 60_000); expect(sovushMs(10)).toBe(2 * 60 * 60_000);
  });
});
