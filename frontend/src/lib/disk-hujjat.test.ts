import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aktRaqami, f2Manba, forma3Manba, kalitF2, kalitF3, kalitOylik, kalitVaqtinchaF2, kalitVaqtinchaF3, obyektHujjatManba } from './disk-hujjat';
import vektorlar from './disk-kalit-vektor.json';

const MIG = join(process.cwd(), '..', 'supabase', 'migrations');
const A1 = '20270113200000_t2_disk_daraxt_a1_v1';
const sql = (s: string) => readFileSync(join(MIG, `${A1}${s}.sql`), 'utf8');

const TS: Record<string, string> = {
  f2: kalitF2(5), f3: kalitF3(9), nakopitelniy: kalitOylik('nakopitelniy', 80, '2026-08'), 'slichitelniy oysiz': kalitOylik('slichitelniy', 80, null),
  'vaqtincha f2': kalitVaqtinchaF2(80, '36', '2026-05'), 'vaqtincha f3': kalitVaqtinchaF3(5, '2026-08'),
};

describe('Disk kalit formati: SQL va TS bir xil (A2 bilan nomuvofiqlik yo‘q)', () => {
  it('TS funksiyalari umumiy vektorlarga teng', () => {
    for (const v of vektorlar) expect(TS[v.nom], v.nom).toBe(v.kalit);
  });
  it('acceptance (SQL) AYNAN shu vektorlarni tekshiradi - format SQL da o‘zgarsa bu test yiqiladi', () => {
    const acc = sql('.acceptance');
    for (const v of vektorlar) expect(acc, v.nom).toContain(v.sql);
  });
  it('migratsiya kalit formati: f2:<akt_id>, f3:<forma3_id>, tmp: shakllari va ulash qoidasi mavjud', () => {
    const m = sql('');
    expect(m).toContain("'f2:' || p_manba_id");
    expect(m).toContain("'f3:' || p_manba_id");
    expect(m).toContain("'tmp:f2:'");
    expect(m).toContain("'tmp:f3:'");
    expect(m).toContain('v_tmp := public._t2_disk_vaqtincha_kalit_v1(');
    expect(m).toContain('update public.t2_hm_fayl set hujjat_kalit = v_kalit');
  });
  it('akt raqami fayl nomidan (SQL `_t2_disk_raqam_v1` bilan bir xil)', () => {
    expect(aktRaqami('Yevropa_oshxonasi_№1_АКТ_Ф-2_№36_2026-05.xlsx')).toBe('36');
    expect(aktRaqami('SINOV_obyekt_—_test_АКТ_Ф-2_2026-11.xlsx')).toBeNull();
    expect(sql('.acceptance')).toContain("public._t2_disk_raqam_v1('SINOV_F-2_2026-11.xlsx') is not null");
  });
  it('manba yordamchilari: kalit = yagona format, nom aniq', () => {
    expect(f2Manba({ aktId: 41, raqam: '5', obyekt: 'Fast Food 1-qavat', oy: '2026-11-01' })).toMatchObject({ turi: 'f2', id: 41, kalit: 'f2:41', nom: 'F-2 №5 — Fast Food 1-qavat — 2026-11' });
    expect(forma3Manba({ forma3Id: 9, shartnomaId: 5, raqam: 2, shartnomaRaqam: '15-A', davr: '2026-08-31' })).toMatchObject({ turi: 'forma3', id: 9, kalit: 'f3:9', shartnomaId: 5, nom: 'F-3 №2 — shartnoma №15-A — 2026-08' });
    expect(obyektHujjatManba({ tur: 'nakopitelniy', obyektId: 80, obyekt: 'Karting', oy: '2026-08' }).kalit).toBe('nakopitelniy:80:2026-08');
  });
});
