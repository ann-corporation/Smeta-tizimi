import { describe, expect, it } from 'vitest';
import { faylSanasi, fotoGuruhla, hisobotQatorlari, olchamHisobla, oyOraligi, type FotoElement } from './foto-dalil';
import { hisobotKalit, hisobotTanla, HISOBOT_MAX_FOTO } from './foto-hisobot';

const f = (id: number, sana: string, rid: number | null, nom: string | null, extra: Partial<FotoElement> = {}): FotoElement => ({
  id, document_id: id + 100, manba_turi: 'qator', manba_id: 5, razdel_id: rid, razdel_nom: nom, sana, lat: null, lng: null, izoh: null, ai_izoh: null,
  ai_taklif: null, ai_tasdiq: false, actor_id: 1, yaratildi: sana + 'T00:00:00Z', original_filename: 'a.jpg', size_bytes: 1, mime_type: 'image/jpeg', manba_nom: 'Beton', ...extra,
});

describe('foto-dalil', () => {
  it('olchamHisobla: 1600 dan oshganni kichraytiradi, kichikni kattalashtirmaydi', () => {
    expect(olchamHisobla(4000, 3000)).toEqual({ w: 1600, h: 1200, ozgardi: true });
    expect(olchamHisobla(1200, 800)).toEqual({ w: 1200, h: 800, ozgardi: false });
    expect(olchamHisobla(0, 10).ozgardi).toBe(false);
  });
  it('faylSanasi: kelajak va noto‘g‘ri sana bugunga tushadi', () => {
    const hozir = new Date(2026, 10, 12, 10);
    expect(faylSanasi(new Date(2026, 10, 3).getTime(), hozir)).toBe('2026-11-03');
    expect(faylSanasi(new Date(2030, 0, 1).getTime(), hozir)).toBe('2026-11-12');
    expect(faylSanasi(0, hozir)).toBe('2026-11-12');
  });
  it('fotoGuruhla: sana kamayish, razdel nom bo‘yicha, razdelsiz oxirida', () => {
    const l = [f(1, '2026-11-01', 7, 'Poydevor'), f(2, '2026-11-03', null, null), f(3, '2026-11-03', 7, 'Poydevor')];
    expect(fotoGuruhla(l, 'sana').map((g) => g.kalit)).toEqual(['2026-11-03', '2026-11-01']);
    const r = fotoGuruhla(l, 'razdel');
    expect(r.map((g) => g.sarlavha)).toEqual(['Poydevor', 'Razdelsiz']);
    expect(r[0].fotolar).toHaveLength(2);
  });
  it('oyOraligi', () => {
    expect(oyOraligi('2026-02')).toEqual(['2026-02-01', '2026-02-28']);
    expect(oyOraligi('2026-13')).toBeNull();
  });
  it('hisobotQatorlari: davr filtri va tartib; AI izohi foydalanuvchi izohi bo‘lmasa', () => {
    const l = [f(2, '2026-11-05', 1, 'B', { ai_izoh: 'beton' }), f(1, '2026-10-30', 1, 'B'), f(3, '2026-11-02', 1, 'A', { izoh: 'qo‘lda' })];
    const q = hisobotQatorlari(l, '2026-11-01', '2026-11-30');
    expect(q.map((x) => x.fotoId)).toEqual([3, 2]);
    expect(q[1].izoh).toBe('beton'); expect(q[0].izoh).toBe('qo‘lda');
  });
  it('hisobotKalit: tartibga bog‘liq emas (qayta yuklash bepul), davr/foto o‘zgarsa boshqa', () => {
    const o = { obyektId: 5, dan: '2026-11-01', gacha: '2026-11-30' };
    const a = [f(1, '2026-11-02', 1, 'A'), f(2, '2026-11-03', 1, 'A')];
    const kalit = (l: FotoElement[], x = o) => new TextDecoder().decode(hisobotKalit(l, x));
    expect(kalit(a)).toBe(kalit([...a].reverse()));
    expect(kalit(a)).not.toBe(kalit([...a, f(3, '2026-11-04', 1, 'A')]));
    expect(kalit(a)).not.toBe(kalit(a, { ...o, gacha: '2026-11-15' }));
  });
  it('hisobotTanla: limitdan oshganini sanaydi', () => {
    const l = Array.from({ length: HISOBOT_MAX_FOTO + 5 }, (_, i) => f(i + 1, '2026-11-01', 1, 'A'));
    const r = hisobotTanla(l, null, null);
    expect(r.qatorlar).toHaveLength(HISOBOT_MAX_FOTO); expect(r.ortiqcha).toBe(5);
  });
});
