import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ kontekst: vi.fn() }));
vi.mock('./supabase', () => ({ sbT2DaraxtOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('./t2-narx', () => ({ sbT2F2TafsilotOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('./t2-nakopitelniy', () => ({ shartnomaSvodOl: vi.fn() }));
vi.mock('./f2-hujjat-kontekst', () => ({ f2HujjatKonteksti: m.kontekst }));
import { oyObyektOl } from './f2-oylik-paket';

// 5 — oylik F2 paketi: ustama/podval o'qilmasa (ctx.xato) jim standart podval bilan hisoblanmaydi, sabab bilan to'xtaydi.
describe('oyObyektOl — ctx.xato darvozasi', () => {
  it('xato bor — to‘xtaydi (sababi xabarda)', async () => {
    m.kontekst.mockResolvedValue({ imzo: {}, shartnoma: null, nakrutka: null, podval: null, xato: 'nakrutka podvali o‘qilmadi' });
    await expect(oyObyektOl(1, 2, ['2026-10'])).rejects.toThrow(/USTAMA_OQILMADI: nakrutka podvali o‘qilmadi/);
  });
  it('xato yo‘q — davom etadi', async () => {
    m.kontekst.mockResolvedValue({ imzo: {}, shartnoma: null, nakrutka: null, podval: null, xato: null });
    await expect(oyObyektOl(1, 2, ['2026-10'])).resolves.toMatchObject({ smeta: [] });
  });
});
