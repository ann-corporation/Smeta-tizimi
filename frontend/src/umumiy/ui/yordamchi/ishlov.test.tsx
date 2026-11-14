// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NAV_SAHIFALAR } from '../../../lib/nav/navReestr';
import { niyatAniqla } from '../../../lib/yordamchi/niyat';
import { yordamchiIshla, type IshlovDeps, type IshlovTaklif } from './ishlov';
import { YordamchiTaklif } from './YordamchiTaklif';

vi.mock('../../../i18n/til', () => ({ t: (s: string, p?: Record<string, string | number>) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => String(p[k])) : s), tilOl: () => 'uz' }));

const sahifalar = NAV_SAHIFALAR.map((s) => ({ yol: s.yol, nom: s.nom }));
const obyektlar = [{ id: 12, nom: 'Yevropa 1' }];
const kont = { sahifalar, obyektlar, joriyObyekt: { id: 12, nom: 'Yevropa 1' } };

function motorQur() {
  const oqi = vi.fn(() => 'NATIJA');
  const bajar = vi.fn(async () => ['✓ yozildi']);
  const vositalar = { sahifa: 'buyruq' as const, kontekst: () => '', oqi, tekshir: () => null, nomi: () => 'Fakt hajmi · beton · +5', pul: (a: { tur: string }) => a.tur === 'narx_tuzat', bajar };
  return { oqi, bajar, motor: { holat: 'tayyor' as const, obyektId: 12, xato: '', vositalar, qoshimcha: () => null } };
}
const deps = (m: ReturnType<typeof motorQur>['motor'], extra: Partial<IshlovDeps> = {}): IshlovDeps => ({ kompaniyaId: 17, sahifalar, motor: m, ...extra });

afterEach(cleanup);

describe('niyat -> vosita xaritasi', () => {
  it('«mindmapni ochib ber» -> navigatsiya /admin/mindmap, model chaqirilmaydi', async () => {
    const { motor } = motorQur(); const agent = vi.fn();
    const r = await yordamchiIshla(niyatAniqla('mindmapni ochib ber', kont), 'mindmapni ochib ber', deps(motor, { agent }));
    expect(r).toMatchObject({ tur: 'javob', ochish: '/admin/mindmap' });
    expect(agent).not.toHaveBeenCalled();
  });
  it('«narxsiz qatorlarni ko‘rsat» -> o‘qish vositasi `narxsiz`, bepul (agent yo‘q)', async () => {
    const { motor, oqi } = motorQur(); const agent = vi.fn();
    const r = await yordamchiIshla(niyatAniqla('narxsiz qatorlarni ko‘rsat', kont), 'narxsiz qatorlarni ko‘rsat', deps(motor, { agent }));
    expect(oqi).toHaveBeenCalledWith({ vosita: 'narxsiz', arg: null });
    expect(r).toMatchObject({ tur: 'javob' });
    expect(agent).not.toHaveBeenCalled();
  });
  it('yozuv niyati -> faqat TAKLIF qaytadi, bajar chaqirilmaydi', async () => {
    const { motor, bajar } = motorQur();
    const agent = vi.fn(async () => ({ ok: true as const, javob: 'Taklif', savollar: [], model: 'm', amallar: [{ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '', ogoh: null }] }));
    const r = await yordamchiIshla(niyatAniqla('beton +5 kirit', kont), 'beton +5 kirit', deps(motor, { agent }));
    expect(r.tur).toBe('taklif');
    expect(agent).toHaveBeenCalledTimes(1);
    expect(bajar).not.toHaveBeenCalled();
  });
  it('ruxsatsiz bo‘lim ochilmaydi', async () => {
    const { motor } = motorQur();
    const faqat = sahifalar.filter((s) => s.yol === '/admin/fakt');
    const r = await yordamchiIshla(niyatAniqla('mindmapni och', { ...kont, sahifalar: faqat }), 'mindmapni och', deps(motor, { sahifalar: faqat }));
    expect(r).toMatchObject({ tur: 'javob' });
    expect((r as { ochish?: string }).ochish).toBeUndefined();
  });
  it('noma’lum -> rad emas: yaqin sahifalar bilan o‘tkaziladi', async () => {
    const { motor } = motorQur();
    const r = await yordamchiIshla(niyatAniqla('menga kofe olib kel', kont), 'menga kofe olib kel', deps(motor));
    expect(r.tur).toBe('otkaz');
    if (r.tur === 'otkaz') expect(r.havolalar.length).toBeGreaterThan(0);
  });
});

describe('tasdiq kartasi', () => {
  const taklif = (amal: string): IshlovTaklif => {
    const m = motorQur();
    return { amallar: [{ tur: amal, qator: 2, qiymat: '5', izoh: '', ogoh: null }], vositalar: m.motor.vositalar, qoshimcha: () => null };
  };
  it('«Bajarish» bosilmaguncha hech narsa yozilmaydi; bosilgach bir marta', async () => {
    const tk = taklif('fakt_hajm'); const tugadi = vi.fn();
    render(<YordamchiTaklif taklif={tk} onTugadi={tugadi} />);
    expect((tk.vositalar.bajar as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
    await waitFor(() => expect(tk.vositalar.bajar).toHaveBeenCalledTimes(1));
    expect(tugadi).toHaveBeenCalledWith(['✓ yozildi']);
  });
  it('pul amali: «Bajarish» yozmaydi, ikkinchi «Tasdiqlayman» kerak', async () => {
    const tk = taklif('narx_tuzat');
    render(<YordamchiTaklif taklif={tk} onTugadi={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
    await screen.findByTestId('ai-pul-tasdiq');
    expect(tk.vositalar.bajar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ai-pul-tasdiq'));
    await waitFor(() => expect(tk.vositalar.bajar).toHaveBeenCalledTimes(1));
  });
  it('«Bekor qilish» yozmaydi', () => {
    const tk = taklif('fakt_hajm');
    render(<YordamchiTaklif taklif={tk} onTugadi={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    expect(tk.vositalar.bajar).not.toHaveBeenCalled();
  });
});

describe('hujjat qoralamalari — taklif kartasi, yozuvsiz', () => {
  it('«beton АОСР tayyorla» -> taklif; yozish faqat Bajarish dan keyin', async () => {
    const { motor } = motorQur();
    const aosrYoz = vi.fn(async () => ({ ok: true, id: 9 })); const aosrBog = vi.fn(async () => ({ ok: true }));
    const hujjat = {
      kompaniyaId: 17, opId: () => 'op', aosrYoz, aosrBog, faktSanalar: async () => ({ links: [], aktlar: [] }), imzochilar: async () => null, aosrReestr: async () => ({ ok: true, qatorlar: [] }),
      aosrCoverage: async () => ({ ok: true, qatorlar: [{ qator_id: 2, obyekt_id: 12, nom: 'Бетон', kod: 'К1', birlik: 'м3', kat: 'bl', fakt_hajm: 1, yashirin: true, akt_bor: false }] }),
      qatorMeta: async () => [{ id: 1, ota_id: null, tartib: 1, tur: 'rz', nom: 'Fundament' }, { id: 2, ota_id: 1, tartib: 1, tur: 'bl', nom: 'Бетон' }],
    } as never;
    const r = await yordamchiIshla(niyatAniqla('Yevropa 1 beton АОСР tayyorla', kont), 'x', deps(motor, { hujjat }));
    expect(r.tur).toBe('taklif');
    expect(aosrYoz).not.toHaveBeenCalled();
    if (r.tur !== 'taklif') return;
    expect(r.taklif.vositalar.pul(r.taklif.amallar[0])).toBe(false);
    await r.taklif.vositalar.bajar(r.taklif.amallar);
    expect(aosrYoz).toHaveBeenCalledTimes(1);
  });
  it('sahifa amali tasdiq bilan -> avval karta (Studio «serverga saqlash»)', async () => {
    const { motor } = motorQur(); const bajar = vi.fn();
    const n = niyatAniqla('serverga saqla', { ...kont, sahifaAmallar: [{ id: 'studio.save', nom: 'Serverga saqlash', tasdiq: true }] });
    const r = await yordamchiIshla(n, 'serverga saqla', deps(motor, { sahifaAmalBajar: bajar }));
    expect(r.tur).toBe('taklif'); expect(bajar).not.toHaveBeenCalled();
  });
});
