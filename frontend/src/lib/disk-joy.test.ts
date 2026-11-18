import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diskJoy } from './disk-joy';
import { JOY_NOMI, hujjatJoyManba, kalitQism, kompaniyaTuri } from './disk-hujjat';

const MIG = join(process.cwd(), '..', 'supabase', 'migrations');
const sql = (s: string) => readFileSync(join(MIG, `20270113700000_t2_disk_joylar_a5_v1${s}.sql`), 'utf8');

describe('Disk A5: hujjat joylari - yagona kalit/nom yo‘li', () => {
  it('obyekt darajasi: tur o‘zi, kalit <tur>:<obyekt>:<oy>[:<qism>], nom «Tur — Obyekt — Qism — Oy»', () => {
    const d = diskJoy({ tur: 'pereraschet', kompaniyaId: 17, obyektId: 80, obyekt: 'Karting', oy: '2026-11-30', qism: 'smeta-Bolim 3', qismNom: 'Bolim 3', faylNomi: 'a.xlsx' });
    expect(d).toMatchObject({ turi: 'pereraschet', obyektId: 80, davr: '2026-11', faylNomi: 'a.xlsx' });
    expect(d.manba).toMatchObject({ turi: 'pereraschet', id: 80, kalit: 'pereraschet:80:2026-11:smeta-bolim-3', nom: 'Pereraschet — Karting — Bolim 3 — 2026-11' });
  });
  it('obyektsiz: tur avtomatik kompaniya_<tur>, kalit k<kompaniya_id>; obyekt nomi nomga kirmaydi', () => {
    const d = diskJoy({ tur: 'bux_hisobot', kompaniyaId: 17, oy: '2026-11-30', qism: 'balans', qismNom: 'Balans', faylNomi: 'b.xlsx' });
    expect(d.turi).toBe('kompaniya_bux_hisobot'); expect(d.obyektId).toBeNull();
    expect(d.manba).toMatchObject({ turi: 'kompaniya_bux_hisobot', id: null, kalit: 'kompaniya_bux_hisobot:k17:2026-11:balans', nom: 'Buxgalteriya hisoboti — Balans — 2026-11' });
  });
  it('bir obyekt/oydagi turli hujjatlar - turli kalit (alohida fayl); bir xil hujjat - bir xil kalit (qayta yasalsa yangi versiya)', () => {
    const k = (qism: string) => diskJoy({ tur: 'naryad', kompaniyaId: 17, obyektId: 80, qism, faylNomi: 'n.xlsx' }).manba.kalit;
    expect(k('12')).toBe(k('12')); expect(k('12')).not.toBe(k('13'));
    expect(diskJoy({ tur: 'naryad', kompaniyaId: 17, obyektId: 81, qism: '12', faylNomi: 'n.xlsx' }).manba.kalit).not.toBe(k('12'));
  });
  it('obyektsiz hujjat boshqa kompaniyaning kalitiga to‘qnashmaydi; oysiz - «-»', () => {
    const a = hujjatJoyManba({ tur: 'qarzdorlik', kompaniyaId: 1 }).kalit, b = hujjatJoyManba({ tur: 'qarzdorlik', kompaniyaId: 2 }).kalit;
    expect(a).toBe('kompaniya_qarzdorlik:k1:-'); expect(b).not.toBe(a);
  });
  it('yaroqsiz obyekt id (0, bo‘sh) kompaniya darajasiga tushadi; manba turi SQL cheklovi (a-z0-9_, <=40) ga mos', () => {
    for (const o of [0, '', null, undefined]) expect(diskJoy({ tur: 'oferta', kompaniyaId: 5, obyektId: o as number, faylNomi: 'o.xlsx' }).turi).toBe('kompaniya_oferta');
    for (const t of Object.keys(JOY_NOMI)) expect(kompaniyaTuri(t)).toMatch(/^[a-z0-9_]{2,40}$/);
  });
  it('kalitQism: qism slug (belgilar tozalanadi, uzunlik cheklanadi)', () => {
    expect(kalitQism('naryad', { obyektId: 1, kompaniyaId: 2 }, null, ' №12/А ')).toBe('naryad:1:-:12-а');
    expect(kalitQism('x', { kompaniyaId: 2 }, '2026-01', 'a'.repeat(200)).length).toBeLessThan(80);
  });
  it('migratsiya: kompaniya_* turi Kompaniya hujjatlari papkasiga; barcha JOY_NOMI turlari SQL da nomlangan; rollback A1 nusxasi', () => {
    const m = sql('');
    expect(m).toContain("like 'kompaniya\\_%'"); expect(m).toContain("'Kompaniya hujjatlari'"); expect(m).toContain("'biriktirilmagan'");
    for (const t of Object.keys(JOY_NOMI)) expect(m, t).toContain(`'${t}'`);
    expect(sql('.rollback')).toContain("'biriktirilmagan'"); expect(sql('.rollback')).not.toContain('Kompaniya hujjatlari');
    expect(sql('.acceptance')).toContain('ACC1');
  });
});