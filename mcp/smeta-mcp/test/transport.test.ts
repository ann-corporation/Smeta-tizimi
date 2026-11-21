/** transport_tekshir: t2_qator_transport_audit_v1 ni chaqiradi (faqat o'qish). Ma'lumotlar SUN'IY. */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TOOLLAR } from '../src/server';
import { toolChaqir } from '../src/tool';
import { transportBelgila, transportTekshir, transportYoy } from '../src/tools/transport';
import { ishSorovlari, mockMuhit } from './mock';

const javob = (audit: unknown) => (sql: string) => (sql.includes('t2_qator_transport_audit_v1') ? [{ r: audit }] : []);

describe('transport_tekshir', () => {
  it('ro\'yxatda, faqat o\'qish', () => {
    expect(TOOLLAR.some((t) => t.nom === 'transport_tekshir')).toBe(true);
    expect(transportTekshir.yozadi).toBe(false);
  });

  it('toza obyekt: toza=true, aktor va obyekt RPC ga uzatiladi', async () => {
    const { mu, h } = mockMuhit(javob({ ok: true, obyekt_id: 5, xulosa: { material_soni: 3, foiz: 2, tkm: 1, narx_ichida: 0, tkm_qator_soni: 1, xato_soni: 0 }, materiallar: [{ qator_id: 9, usul: 'tkm' }], xatolar: [] }));
    const j = await toolChaqir(transportTekshir, mu, { obyekt_id: 5 });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.natija ?? r).toMatchObject({ obyekt_id: 5, toza: true, xulosa: { tkm: 1, xato_soni: 0 } });
    const rpc = h.sorovlar.find((s) => s.sql.includes('t2_qator_transport_audit_v1'))!;
    expect(rpc.params).toEqual([7, 5]);
    expect(h.sorovlar.every((s) => !/\b(insert|update|delete)\b/i.test(s.sql))).toBe(true);
  });

  it('xatolar: ikki marta transport topilsa toza=false va xatolar qaytadi', async () => {
    const xatolar = [{ kod: 'TKM_VA_FOIZ', qator_id: 11, xabar: 'ikki marta' }, { kod: 'IKKITA_TRANSPORT', qator_id: 12, xabar: 'ikkita' }];
    const { mu } = mockMuhit(javob({ ok: true, obyekt_id: 5, xulosa: { xato_soni: 2 }, materiallar: [], xatolar }));
    const r = JSON.parse((await toolChaqir(transportTekshir, mu, { obyekt_id: 5 })).content[0].text);
    const n = r.natija ?? r;
    expect(n.toza).toBe(false);
    expect(n.xatolar.map((x: { kod: string }) => x.kod)).toEqual(['TKM_VA_FOIZ', 'IKKITA_TRANSPORT']);
  });

  it('server rad etsa (obyekt yo\'q / a\'zo emas) — xato', async () => {
    const { mu } = mockMuhit(javob({ ok: false, code: 'OBYEKT_YOQ' }));
    expect((await toolChaqir(transportTekshir, mu, { obyekt_id: 5 })).isError).toBe(true);
  });

  it('aktor yo\'q — xato (RPC chaqirilmaydi)', async () => {
    const { mu, h } = mockMuhit(javob({ ok: true }), { aktorId: null });
    expect((await toolChaqir(transportTekshir, mu, { obyekt_id: 5 })).isError).toBe(true);
    expect(h.sorovlar.some((s) => s.sql.includes('t2_qator_transport_audit_v1'))).toBe(false);
  });
});

describe('transport_belgila', () => {
  const ok = { ok: true, obyekt_id: 5, usul: 'tkm', qator_soni: 2, ozgardi: 2, tkm_qatori_yoq_soni: 2, tkm_qatori_yoq: [11, 12] };
  const au = { ok: true, xulosa: { tkm: 2, xato_soni: 2 }, xatolar: [{ kod: 'TKM_TRANSPORT_YOQ', qator_id: 11, xabar: 'x' }] };
  const javobB = (b: unknown) => (sql: string) => (sql.includes('t2_qator_transport_belgila_v1') ? [{ r: b }] : sql.includes('t2_qator_transport_audit_v1') ? [{ r: au }] : []);

  it('yozadi, dry_run STANDART true: RPC + audit chaqiriladi, ROLLBACK, snapshot olinmaydi', async () => {
    expect(TOOLLAR.some((t) => t.nom === 'transport_belgila')).toBe(true);
    expect(transportBelgila.yozadi).toBe(true);
    const { mu, h } = mockMuhit(javobB(ok));
    const j = await toolChaqir(transportBelgila, mu, { obyekt_id: 5, qator_idlar: [11, 12], usul: 'tkm' });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text); const n = r.natija ?? r;
    expect(n.dry_run).toBe(true);
    expect(n.belgilash).toMatchObject({ ok: true, ozgardi: 2 });
    expect(n.audit.xulosa.xato_soni).toBe(2);
    const sorovlar = ishSorovlari(h.sorovlar);
    const rpc = sorovlar.find((s) => s.sql.includes('t2_qator_transport_belgila_v1'))!;
    expect(rpc.params).toEqual([7, 5, [11, 12], 'tkm']);
    expect(h.sorovlar.some((s) => /^ROLLBACK/.test(s.sql))).toBe(true);
    expect(h.sorovlar.some((s) => /^COMMIT/.test(s.sql))).toBe(false);
    expect(sorovlar.some((s) => /snapshot/i.test(s.sql))).toBe(false);
  });

  it('server rad etsa (yaroqsiz qator) — xato, kod ko\'rinadi', async () => {
    const { mu } = mockMuhit(javobB({ ok: false, code: 'QATOR_YARAMAYDI', error: 'material emas', qator_idlar: [9] }));
    const j = await toolChaqir(transportBelgila, mu, { obyekt_id: 5, qator_idlar: [9], usul: 'foiz' });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toContain('QATOR_YARAMAYDI');
  });

  it('noto\'g\'ri usul — kirish tekshiruvidan o\'tmaydi', () => {
    expect(() => z.object(transportBelgila.kirish).parse({ obyekt_id: 5, qator_idlar: [1], usul: 'xx' })).toThrow();
  });
});
describe('transport_yoy', () => {
  const guruh = { material: 'ГПС', miqdor: 150, zichlik: 1.5, km: 10, hisob_tkm: 2250, kodlar: ['12303'] };
  const grj = { material: 'ГПС', holat: 'tayyor', topilgan_soni: 2, miqdor_tizim: 150, tkm_tizim: 2250, farq_som: 0 };
  const au = { ok: true, xulosa: { xato_soni: 0 }, xatolar: [] };
  const javobY = (r: (yoz: boolean) => unknown) => (sql: string, p: unknown[]) =>
    sql.includes('t2_qator_transport_yoy_v1') ? [{ r: r(p[6] === true) }] : sql.includes('t2_qator_transport_audit_v1') ? [{ r: au }] : [];

  it('ro\'yxatda; dry_run standart: preview + ROLLBACK ichida yozish yo\'li sinaladi, COMMIT yo\'q', async () => {
    expect(TOOLLAR.some((t) => t.nom === 'transport_yoy')).toBe(true);
    const { mu, h } = mockMuhit(javobY((yoz) => ({ ok: true, bloklangan: false, yozildi: yoz, yaratildi: yoz ? 2 : 0, guruhlar: [grj] })));
    const j = await toolChaqir(transportYoy, mu, { obyekt_id: 5, rz_id: 9, tkm_narx: 1000, qatorlar: [guruh] });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text); const n = r.natija ?? r;
    expect(n.dry_run).toBe(true);
    expect(n.guruhlar[0]).toMatchObject({ holat: 'tayyor', topilgan_soni: 2 });
    expect(n.yaratildi).toBe(2);
    const rpc = h.sorovlar.filter((s) => s.sql.includes('t2_qator_transport_yoy_v1'));
    expect(rpc.map((s) => s.params[6])).toEqual([false, true]);
    expect(h.sorovlar.some((s) => /^ROLLBACK/.test(s.sql))).toBe(true);
    expect(h.sorovlar.some((s) => /^COMMIT/.test(s.sql))).toBe(false);
  });

  it('bloklangan guruh (farq > 0.5%): yozish yo\'li chaqirilmaydi, ogohlantirish chiqadi; majburiy:true — o\'tadi', async () => {
    const blok = (yoz: boolean) => ({ ok: !yoz, code: yoz ? 'TASDIQ_KERAK' : undefined, bloklangan: true, yozildi: false, guruhlar: [{ ...grj, holat: 'chetlanish', farq_som: 250000 }] });
    const a = mockMuhit(javobY(blok));
    const r1 = JSON.parse((await toolChaqir(transportYoy, a.mu, { obyekt_id: 5, rz_id: 9, tkm_narx: 1000, qatorlar: [guruh] })).content[0].text); const n1 = r1.natija ?? r1;
    expect(n1.bloklangan).toBe(true);
    expect(n1.ogohlantirish).toContain('Bloklangan');
    expect(a.h.sorovlar.filter((s) => s.sql.includes('t2_qator_transport_yoy_v1')).map((s) => s.params[6])).toEqual([false]);
    const b = mockMuhit(javobY((yoz) => ({ ok: true, bloklangan: true, yozildi: yoz, yaratildi: yoz ? 2 : 0, guruhlar: [{ ...grj, holat: 'chetlanish' }] })));
    const r2 = JSON.parse((await toolChaqir(transportYoy, b.mu, { obyekt_id: 5, rz_id: 9, tkm_narx: 1000, qatorlar: [guruh], majburiy: true })).content[0].text); const n2 = r2.natija ?? r2;
    expect(n2.yaratildi).toBe(2);
    expect(b.h.sorovlar.filter((s) => s.sql.includes('t2_qator_transport_yoy_v1')).map((s) => s.params[6])).toEqual([false, true]);
  });

  it('server rad etsa (RZ_YOQ) — xato', async () => {
    const { mu } = mockMuhit(javobY(() => ({ ok: false, code: 'RZ_YOQ', error: 'rz yo\'q' })));
    expect((await toolChaqir(transportYoy, mu, { obyekt_id: 5, rz_id: 9, tkm_narx: 1000, qatorlar: [guruh] })).isError).toBe(true);
  });
});