import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { bosqichIndeksi, daraxtSanoq, muammolarRoyxati, qaytaYuklashMatni, versiyaNomi } from './xulosa';
import { MuammolarRoyxati, NatijaEkrani, VaraqTanlagich, YuklashQadamlari } from './Bosqichlar';

const bosh = { lrvTanlanmagan: false, narxsiz: 0, resursJami: 0, vedomostChiqarildi: 0, tekisVaraqlar: [], tushunilmadiVaraq: 0 };

describe('smeta yuklash ustasi — xulosa', () => {
  it('daraxt sanog‘i bo‘lim/ish/resurs', () => {
    const tree = [{ type: 'rz', children: [{ type: 'bl', children: [{ type: 'rs' }, { type: 'mat' }, { type: 'ob' }] }, { type: 'bl', children: [] }] }];
    expect(daraxtSanoq(tree)).toEqual({ bolim: 1, ish: 2, resurs: 3 });
  });

  it('muammo yo‘q bo‘lsa ro‘yxat bo‘sh; narxsiz va tekis varaq tafsilot bilan chiqadi', () => {
    expect(muammolarRoyxati(bosh)).toEqual([]);
    const m = muammolarRoyxati({ ...bosh, narxsiz: 3, resursJami: 10, tekisVaraqlar: [{ manba: 'Varaq1', sabab: 'ierarxiya yo‘q' }] });
    expect(m.map((x) => x.kalit)).toEqual(['narxsiz', 'tekis']);
    expect(m[0].matn).toContain('3');
    expect(m[1].tafsilot?.[0]).toContain('Varaq1');
  });

  it('versiya nomi: yorliq yoki sana, fayl nomi aralashmaydi', () => {
    expect(versiyaNomi('  Ekspertiza 1  ')).toBe('Ekspertiza 1');
    expect(versiyaNomi('', new Date(2026, 10, 5))).toContain('2026-11-05');
  });

  it('qayta yuklash matni haqiqatni aytadi: ustiga yozilmaydi, versiya bo‘ladi', () => {
    const s = qaytaYuklashMatni(30);
    expect(s).toContain('30');
    expect(s).toContain('yangi versiya');
    expect(s).not.toContain('yangi smeta yaratadi');
  });

  it('bosqich indeksi: fayl 0, tekshiruv 1, ko‘rib chiqish 2, import 3, natija 4', () => {
    expect(bosqichIndeksi({ natija: true, band: false, kitob: true, ustunlar: true })).toBe(4);
    expect(bosqichIndeksi({ natija: false, band: false, kitob: true, ustunlar: true })).toBe(1);
    expect(bosqichIndeksi({ natija: false, band: false, kitob: true, ustunlar: true, tahlil: true })).toBe(2);
    expect(bosqichIndeksi({ natija: false, band: true, kitob: true, ustunlar: true, tahlil: true })).toBe(3);
    expect(bosqichIndeksi({ natija: false, band: false, kitob: true, ustunlar: false })).toBe(1);
    expect(bosqichIndeksi({ natija: false, band: false, kitob: false, ustunlar: false })).toBe(0);
  });
});

describe('smeta yuklash ustasi — komponentlar', () => {
  it('5 bosqich ko‘rsatiladi', () => {
    render(<YuklashQadamlari joriy={1} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('muammolar ro‘yxatida «tafsilot» ochiladigan qism bor', () => {
    render(<MuammolarRoyxati muammolar={[{ kalit: 'a', ton: 'ogoh', matn: 'Matn', tafsilot: ['Bir', 'Ikki'] }]} />);
    expect(screen.getByText('tafsilot')).toBeTruthy();
  });

  it('varaq tanlagichi tur o‘zgarishini xabar qiladi', () => {
    const tanla = vi.fn();
    render(<VaraqTanlagich varaqlar={[{ nom: 'A', teg: 'lrv', taxmin: 'Ish va hajm' }, { nom: 'B', teg: 'res', taxmin: 'Narxlar' }]} onTanla={tanla} />);
    fireEvent.change(screen.getByLabelText(/B — varaq turi/), { target: { value: 'etibor_bermaslik' } });
    expect(tanla).toHaveBeenCalledWith('B', 'etibor_bermaslik');
  });

  it('natija ekrani keyingi qadam tugmalarini chaqiradi', () => {
    const smeta = vi.fn(); const fakt = vi.fn();
    render(<NatijaEkrani qatorSoni={12} sanoq={{ bolim: 1, ish: 2, resurs: 9 }} muammolar={[]} onSmeta={smeta} onFakt={fakt} />);
    fireEvent.click(screen.getByText('Smetani ochish'));
    fireEvent.click(screen.getByText('Faktga o‘tish'));
    expect(smeta).toHaveBeenCalled(); expect(fakt).toHaveBeenCalled();
  });
});
