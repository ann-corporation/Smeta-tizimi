import { describe, expect, it } from 'vitest';
import { FAOL_FILTR, versiyaFiltri } from './versiya-oqish';

describe('versiyaFiltri — t2_qator o‘qishi sukut bo‘yicha faqat faol versiya', () => {
  it('t2_qator: obyekt bo‘yicha o‘qish — faol filtri majburiy', () => {
    expect(versiyaFiltri('t2_qator', { filtr: 'obyekt_id=eq.7&tur=in.(rs,mat,ob)' })).toEqual({ ok: true, filtr: FAOL_FILTR });
    expect(versiyaFiltri('t2_qator', {})).toEqual({ ok: true, filtr: FAOL_FILTR });
    expect(versiyaFiltri('t2_qator', { filtr: 'obyekt_id=eq.7', versiya: 'faol' })).toEqual({ ok: true, filtr: FAOL_FILTR });
  });
  it('aniq opt-in «tarix» — barcha versiyalar', () => {
    expect(versiyaFiltri('t2_qator', { filtr: 'obyekt_id=eq.7', versiya: 'tarix' })).toEqual({ ok: true, filtr: null });
  });
  it('chaqiruvchi versiya_holat ni o‘zi bergan bo‘lsa — tegilmaydi', () => {
    expect(versiyaFiltri('t2_qator', { filtr: 'obyekt_id=eq.7&versiya_holat=eq.almashtirilgan' })).toEqual({ ok: true, filtr: null });
  });
  it('id bo‘yicha aniq qidiruv (F2 qatori metama’lumoti) — barcha versiyalar; sahifalash kursori bunga kirmaydi', () => {
    expect(versiyaFiltri('t2_qator', { filtr: 'obyekt_id=eq.7&id=in.(1,2,3)' })).toEqual({ ok: true, filtr: null });
    expect(versiyaFiltri('t2_qator', { filtr: 'id=eq.5' })).toEqual({ ok: true, filtr: null });
    expect(versiyaFiltri('t2_qator', { filtr: 'obyekt_id=eq.7&id=gt.100' })).toEqual({ ok: true, filtr: FAOL_FILTR });
    expect(versiyaFiltri('t2_qator', { filtr: 'obyekt_id=eq.7&replaces_line_id=not.is.null' })).toEqual({ ok: true, filtr: FAOL_FILTR });
  });
  it('boshqa jadvallar o‘zgarmaydi (t2_qator_holat — tarix ustuni bilan, t2_daraxt — bazada faol)', () => {
    expect(versiyaFiltri('t2_qator_holat', { filtr: 'obyekt_id=eq.7' })).toEqual({ ok: true, filtr: null });
    expect(versiyaFiltri('t2_daraxt', { filtr: 'obyekt_id=eq.7' })).toEqual({ ok: true, filtr: null });
  });
  it('noto‘g‘ri versiya qiymati — ochiq xato', () => {
    expect(versiyaFiltri('t2_qator', { versiya: 'hammasi' }).ok).toBe(false);
    expect(versiyaFiltri('t2_obyekt', { versiya: 1 }).ok).toBe(false);
  });
});
