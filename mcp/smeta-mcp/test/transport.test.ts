/** transport_tekshir: t2_qator_transport_audit_v1 ni chaqiradi (faqat o'qish). Ma'lumotlar SUN'IY. */
import { describe, expect, it } from 'vitest';
import { TOOLLAR } from '../src/server';
import { toolChaqir } from '../src/tool';
import { transportTekshir } from '../src/tools/transport';
import { mockMuhit } from './mock';

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
