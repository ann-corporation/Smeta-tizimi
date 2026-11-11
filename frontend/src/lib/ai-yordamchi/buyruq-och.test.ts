import { describe, expect, it, vi } from 'vitest';
import { buyruqAmalTekshir, buyruqKontekst, buyruqMalumotQur, buyruqVositalar, type BuyruqYoz } from './buyruq-vositalar';
import { sahifaJavobiniTekshir } from './protokol';

const m = buyruqMalumotQur([], [], { sahifalar: [{ yol: '/admin/mindmap', nom: 'Mindmap (xarita)' }, { yol: '/admin/fakt', nom: 'Fakt kiritish' }] });

describe('«och» amali (yagona yordamchi navigatsiyasi)', () => {
  it('model «och» amalini qaytara oladi (sxemada bor)', () => {
    const r = sahifaJavobiniTekshir({ javob: 'x', savollar: [], oqish: [], amallar: [{ tur: 'och', qator: null, qiymat: '/admin/mindmap', izoh: '' }] }, 'buyruq');
    expect(r.amallar).toHaveLength(1);
  });
  it('faqat foydalanuvchiga ochiq sahifa yaroqli', () => {
    expect(buyruqAmalTekshir(m, { tur: 'och', qator: null, qiymat: '/admin/mindmap', izoh: '' })).toBeNull();
    expect(buyruqAmalTekshir(m, { tur: 'och', qator: null, qiymat: '/admin/boshqaruv', izoh: '' })).not.toBeNull();
  });
  it('kontekstda sahifalar ro‘yxati modelga beriladi', () => {
    expect(buyruqKontekst(m)).toContain('/admin/mindmap | Mindmap (xarita)');
  });
  it('bajarish sahifani ochadi, hech narsa yozmaydi', async () => {
    const och = vi.fn(); const faktYoz = vi.fn(); const narxProtokol = vi.fn();
    const yoz: BuyruqYoz = { faktYoz, narxProtokol, korsat: vi.fn(), och, yangiOperationId: () => 'op' };
    const v = buyruqVositalar(() => m, 5, yoz);
    expect(v.pul({ tur: 'och', qator: null, qiymat: '/admin/fakt', izoh: '' })).toBe(false);
    await v.bajar([{ tur: 'och', qator: null, qiymat: '/admin/fakt', izoh: '' }]);
    expect(och).toHaveBeenCalledWith('/admin/fakt');
    expect(faktYoz).not.toHaveBeenCalled(); expect(narxProtokol).not.toHaveBeenCalled();
  });
});
