// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ arxivla: vi.fn(), toast: vi.fn() }));
vi.mock('../api/t2-hujjat-arxiv', () => ({ hujjatArxivla: m.arxivla }));
vi.mock('../umumiy/ui/Toast', () => ({ toast: m.toast }));

import { DISK_SAQLANMADI, diskHolatiniKorsat, diskkaSaqla } from './disk-saqla';
import { hujjatTokenBilan } from './token-hujjat';
import { obyektHujjatManba } from './disk-hujjat';

afterEach(() => { m.arxivla.mockReset(); m.toast.mockReset(); });
const bytes = new Uint8Array([1, 2, 3]);
const deps = (ok: boolean) => ({
  tokenBilan: vi.fn(async (_p: unknown, ish: () => Promise<boolean>) => { if (ok) await ish(); return ok ? { ok: true as const, sarflandi: 1, bepulTakror: false } : { ok: false as const, xabar: 'token yetmadi' }; }),
  mazmunXeshi: vi.fn(async () => 'x'.repeat(32)),
}) as never;
const manba = obyektHujjatManba({ tur: 'slichitelniy', obyektId: 80, obyekt: 'Karting', oy: null });

describe('Disk A2: brauzerda yasalgan hujjat token yechilgandan KEYIN Diskka saqlanadi', () => {
  it('muvaffaqiyat: hujjatArxivla manba (kalit/nom) bilan chaqiriladi, obyekt id obyekt maydonidan', async () => {
    m.arxivla.mockResolvedValue({ ok: true, versiya: 1, takror: false });
    const r = await hujjatTokenBilan({ kompaniyaId: 17, bytes, hujjat: 'SLICHITELNIY', sabab: 's', obyekt: 80, yacheykalar: 3, disk: { turi: 'slichitelniy', faylNomi: 'a.xlsx', manba } }, () => undefined, deps(true));
    expect(r.ok).toBe(true);
    await vi.waitFor(() => expect(m.arxivla).toHaveBeenCalledTimes(1));
    expect(m.arxivla.mock.calls[0][0]).toMatchObject({ kompaniyaId: 17, obyektId: 80, turi: 'slichitelniy', faylNomi: 'a.xlsx', manba: { kalit: 'slichitelniy:80:-', nom: 'Slichitelniy — Karting' } });
    expect(m.toast).not.toHaveBeenCalledWith(DISK_SAQLANMADI, 'warn');
  });
  it('token yechilmasa (xato) - Diskka hech narsa yozilmaydi', async () => {
    const r = await hujjatTokenBilan({ kompaniyaId: 17, bytes, hujjat: 'SLICHITELNIY', sabab: 's', obyekt: 80, yacheykalar: 3, disk: { turi: 'slichitelniy', faylNomi: 'a.xlsx', manba } }, () => undefined, deps(false));
    expect(r.ok).toBe(false); expect(m.arxivla).not.toHaveBeenCalled();
  });
  it('disk berilmasa - avvalgi xulq (yozuv yo‘q)', async () => {
    await hujjatTokenBilan({ kompaniyaId: 17, bytes, hujjat: 'X', sabab: 's', yacheykalar: 3 }, () => undefined, deps(true));
    expect(m.arxivla).not.toHaveBeenCalled();
  });
  it('saqlash xatosi hujjatni buzmaydi, lekin jim emas: foydalanuvchiga ogohlantirish', async () => {
    m.arxivla.mockResolvedValue({ ok: false, xato: 'KVOTA_TUGADI' });
    expect(await diskkaSaqla({ kompaniyaId: 17, turi: 'slichitelniy', faylNomi: 'a', bytes, manba })).toBe(false);
    expect(m.toast).toHaveBeenCalledWith(DISK_SAQLANMADI, 'warn');
    m.toast.mockReset(); m.arxivla.mockRejectedValue(new Error('tarmoq'));
    expect(await diskkaSaqla({ kompaniyaId: 17, turi: 'slichitelniy', faylNomi: 'a', bytes, manba })).toBe(false);
    expect(m.toast).toHaveBeenCalledWith(DISK_SAQLANMADI, 'warn');
  });
  it('server sarlavhasi X-Disk-Holat: faqat xato:<kod> ogohlantiradi', () => {
    diskHolatiniKorsat('ok'); diskHolatiniKorsat('otkazildi'); diskHolatiniKorsat(null);
    expect(m.toast).not.toHaveBeenCalled();
    diskHolatiniKorsat('xato:R2_XATO');
    expect(m.toast).toHaveBeenCalledWith(DISK_SAQLANMADI, 'warn');
  });
});

describe('Disk A2: qayta urinish navbati migratsiyasi (A2 yetim) - statik invariantlar', () => {
  const MIG = join(process.cwd(), '..', 'supabase', 'migrations');
  const s = (q: string) => readFileSync(join(MIG, `20270113300000_t2_disk_yetim_v1${q}.sql`), 'utf8');
  it('faqat service_role, A1 ning yagona yozuvchisi orqali, idempotent filtr (versiyaga ulanmagan stored hujjat)', () => {
    const sql = s('');
    expect(sql).toContain('_t2_disk_tizim_yoz_ich_v1(0, r.kompaniya_id, r.id');
    expect(sql).toContain("canonical_storage_status = 'stored'");
    expect(sql).toContain('not exists (select 1 from public.t2_hm_versiya v where v.registry_id = d.id)');
    expect(sql).toMatch(/revoke all on function public\.t2_disk_yetim_ishla_v1\(integer, integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.t2_disk_yetim_ishla_v1\(integer, integer\) to service_role/);
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });
  it('rollback va acceptance bor; acceptance navbat, idempotentlik, kutish oynasi va ruxsatni tekshiradi', () => {
    expect(s('.rollback')).toContain('drop function if exists public.t2_disk_yetim_ishla_v1');
    const a = s('.acceptance');
    for (const k of ['ACC2', 'ACC3', 'ACC4', 'ACC5']) expect(a).toContain(k);
  });
  it('cron endpoint navbatni ishga tushiradi va xatoni jurnalga yozadi', () => {
    const c = readFileSync(join(process.cwd(), 'functions', 'api', 'hujjat-maydoni-tozala.ts'), 'utf8');
    expect(c).toContain("'t2_disk_yetim_ishla_v1'"); expect(c).toContain('navbat_xato');
  });
});