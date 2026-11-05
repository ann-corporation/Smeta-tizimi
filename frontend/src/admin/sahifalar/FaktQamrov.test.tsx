import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JurnalHolat, JurnalIsh } from '../../lib/fakt-jurnal';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), id: 0 }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => `op-${++m.id}`, sbT2AktBekor: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/ui/SummaJuft', () => ({ SummaJuft: () => <span>summa</span> }));

import { FaktQamrov } from './FaktQamrov';
import { urinishOchir, yozilganOchir } from '../../lib/fakt-qamrov-urinish';

const ish = (id: number): JurnalIsh => ({ id, tur: 'bl', kod: null, nom: `Ish ${id}`, birlik: 'm3', smeta: 100, fakt: 0, qoldiq: 100, f2Mumkin: 0, ulush: 0,
  holat: 'yangi', norma: null, qoshimcha: false, zamena: false, otaId: 1, otaVersiya: 1, kat: null, almashtiradi: null, aslNom: null, almashtirilgan: null,
  bajarilmaydi: null, resurslar: [], avtomatik: [] });

/** Sintetik server: operation_id bo'yicha replay (t2_akt_yarat kabi); `rad` — shu chaqiruv tartib raqamlari aniq rad etiladi. */
function server(rad: Set<number>) {
  const qabul = new Map<string, number>(); const fakt = new Map<number, number>(); let n = 0;
  m.yoz.mockImplementation(async (r: { operationId: string; qatorlar: { qator_id: number; hajm: number }[] }) => {
    n++;
    if (rad.has(n)) return { ok: false, code: 'SYNTHETIC_REJECTED', error: 'Rad etildi' };
    const bor = qabul.get(r.operationId); if (bor) return { ok: true, takror: true, akt_id: bor };
    const akt = qabul.size + 1; qabul.set(r.operationId, akt);
    for (const q of r.qatorlar) fakt.set(q.qator_id, (fakt.get(q.qator_id) ?? 0) + q.hajm);
    return { ok: true, akt_id: akt };
  });
  return fakt;
}
const save = () => fireEvent.click(screen.getByRole('button', { name: /^Faktga yozish/ }));

beforeEach(() => { m.id = 0; m.yoz.mockReset(); m.toast.mockReset(); urinishOchir(1, 8); yozilganOchir(1, 8); });
afterEach(cleanup);

describe('FaktQamrov — JQA-09', () => {
  it('qisman tasdiqlangan urinish tashlansa — tasdiqlangan qism qayta yozilmaydi; yangi urinish yangilangan holatdan; jami 100, 200 emas', async () => {
    const ishlar = Array.from({ length: 1501 }, (_, i) => ish(i + 10));
    const fakt = server(new Set([2]));
    const onYop = vi.fn(); const yangila = vi.fn();
    function Parent() {
      const [holat, setHolat] = useState<Map<number, JurnalHolat>>(new Map());
      const [ochiq, setOchiq] = useState(true);
      const refresh = () => { yangila(); setHolat(new Map(ishlar.map((q) => [q.id, { qator_id: q.id, smeta_hajm: 100, fakt_hajm: fakt.get(q.id) ?? 0 }]))); };
      return ochiq ? <FaktQamrov sarlavha="Ko‘l" ishlar={ishlar} holatMap={holat} obyektId={8} kompaniyaId={1} sana="2026-10-25"
        onYop={() => { onYop(); setOchiq(false); }} onBajarildi={refresh} aktBekor={vi.fn(async () => ({ ok: true }))} /> : null;
    }
    render(<Parent />);
    save();
    await waitFor(() => expect(screen.getByTestId('urinish-tashla')).toBeTruthy());
    expect(fakt.get(10)).toBe(100);
    expect(fakt.get(1510)).toBeUndefined();
    fireEvent.click(screen.getByTestId('urinish-tashla'));
    // Tasdiqlangan akt ro'yxati va bekor qilish qoladi.
    expect(screen.getByTestId('qamrov-yozilgan').textContent).toMatch(/№1/);
    expect(screen.getByTestId('yozilgan-bekor')).toBeTruthy();
    // Yangi reja yangilangan holatdan: faqat qolgan 1 qator.
    expect(screen.getByTestId('qamrov-jami').textContent).toMatch(/^1 qator yoziladi/);
    save();
    await waitFor(() => expect(onYop).toHaveBeenCalled());
    expect(fakt.get(10)).toBe(100);
    expect(fakt.get(1510)).toBe(100);
  });

  it('jadval yozuvni hali ko‘rsatmasa (yangilanmagan) — yangi urinish yopiq; «Jadvalni yangilash» dan keyin ochiladi', async () => {
    const ishlar = [ish(10)];
    const fakt = server(new Set());
    let holat = new Map<number, JurnalHolat>();
    const props = () => ({ sarlavha: 'Ko‘l', ishlar, holatMap: holat, obyektId: 8, kompaniyaId: 1, sana: '2026-10-25', onYop: vi.fn(),
      onBajarildi: vi.fn(), aktBekor: vi.fn(async () => ({ ok: true })) });
    const v = render(<FaktQamrov {...props()} />);
    save();
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    v.unmount();
    // Qayta ochildi, ota hali eski holat bilan (fakt ko'rinmaydi) — ikkinchi marta yozilmaydi.
    render(<FaktQamrov {...props()} />);
    expect(screen.getByTestId('jadval-yangila')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Faktga yozish/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    holat = new Map([[10, { qator_id: 10, smeta_hajm: 100, fakt_hajm: fakt.get(10) ?? 0 }]]);
    render(<FaktQamrov {...props()} />);
    expect(screen.queryByTestId('jadval-yangila')).toBeNull();
    expect(screen.getByTestId('qamrov-jami').textContent).toMatch(/^0 qator yoziladi/);
    expect(fakt.get(10)).toBe(100);
  });
});
