import { describe, expect, it, vi } from 'vitest';
import { jarvisKalitmi, xotiraBuyrugi, xotiraKalit, xotiraTekshir } from '../xotira';
import { kimMendan } from '../kim';
import { vositaTop } from './reestr';
import { vositaIshla } from './ishla';
import type { VositaApi, VositaKont } from './tur';

const KIM = kimMendan({ foydalanuvchi: { login: 's', ism: 'S' }, context_kompaniyalar: [{ kompaniya_id: 5, nom: 'Sinov', effective_role: 'boss', permissions: [] }], azoliklar: [] }, 5);
const ROYXAT = [
  { daraja: 'foydalanuvchi' as const, kalit: 'smeta.jarvis.a1', mazmun: 'Doim QQS bilan ko‘raman' },
  { daraja: 'kompaniya' as const, kalit: 'smeta.jarvis.b2', mazmun: 'Hujjatlar rus tilida' },
  { daraja: 'tizim' as const, kalit: 'smeta.x', mazmun: 'Narx doim QQS siz' },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (o: Partial<VositaApi> = {}): any => ({ xotiraOl: vi.fn(async () => ROYXAT), xotiraYoz: vi.fn(async () => ({ ok: true })), friksiya: vi.fn(), ...o });
const kont = (a: VositaApi): VositaKont => ({ kompaniyaId: 5, kim: KIM, obyekt: null, obyektlar: [], sahifalar: [], api: a, opId: () => 'op' });

describe('xotira qoidalari', () => {
  it('pul, parol, shaxsiy raqam, e-pochta, telefon rad etiladi; oddiy afzallik o‘tadi', () => {
    for (const s of ['shartnoma summasi 50 mln', 'narxi 12 000 000 so\'m', 'parol: qwerty123', 'api key sk-abc123456', 'ali@example.com', '+998 90 123 45 67', 'INN 123456789', 'karta 8600123412341234'])
      expect(xotiraTekshir(s).ok, s).toBe(false);
    expect(xotiraTekshir('Men doim QQS bilan ko‘raman')).toEqual({ ok: true, mazmun: 'Men doim QQS bilan ko‘raman' });
    expect(xotiraTekshir('ab').ok).toBe(false); expect(xotiraTekshir('a'.repeat(500)).ok).toBe(false);
  });
  it('kalit barqaror va RPC regulyar ifodasiga mos', () => {
    const k = xotiraKalit('Doim QQS bilan'); expect(k).toBe(xotiraKalit('  doim   qqs bilan ')); expect(k).toMatch(/^smeta\.[a-z0-9_.-]{1,74}$/); expect(jarvisKalitmi(k)).toBe(true);
    expect(xotiraKalit('boshqa')).not.toBe(k);
  });
  it('buyruqlarni ajratish (lotin, kirill, ru)', () => {
    expect(xotiraBuyrugi('eslab qol: men doim QQS bilan ko‘raman')).toEqual({ tur: 'yoz', mazmun: 'men doim QQS bilan ko‘raman', daraja: 'foydalanuvchi' });
    expect(xotiraBuyrugi('eslab qol: kompaniya: hujjatlar rus tilida')).toEqual({ tur: 'yoz', mazmun: 'hujjatlar rus tilida', daraja: 'kompaniya' });
    expect(xotiraBuyrugi('запомни: я смотрю с НДС')).toMatchObject({ tur: 'yoz', daraja: 'foydalanuvchi' });
    expect(xotiraBuyrugi('unut 2')).toEqual({ tur: 'unut', belgi: '2' }); expect(xotiraBuyrugi('забудь')).toEqual({ tur: 'unut', belgi: '' });
    expect(xotiraBuyrugi('Jarvis men haqimda nimani biladi?')).toEqual({ tur: 'korsat' });
    expect(xotiraBuyrugi('xotirani ko‘rsat')).toEqual({ tur: 'korsat' });
    for (const s of ['xarajat yoz 5 mln', 'F2 ni tasdiqla', 'mindmapni och', 'men kimman']) expect(xotiraBuyrugi(s)).toBeNull();
  });
  it('vositaTop xotira buyruqlarini tutadi, boshqalarni emas', () => {
    expect(vositaTop('eslab qol: doim QQS bilan')?.id).toBe('xotira_yoz'); expect(vositaTop('unut 1')?.id).toBe('xotira_unut'); expect(vositaTop('men haqimda nimani bilasan')?.id).toBe('xotira_korsat');
  });
});

describe('xotira vositalari', () => {
  it('ko‘rsat: shaxsiy+kompaniya raqamlangan, tizim alohida va faqat o‘qish', async () => {
    const r = await vositaIshla('xotira_korsat', 'men haqimda nimani bilasan', kont(api())); const m = (r as { matn: string }).matn;
    expect(m).toContain('1. Doim QQS bilan'); expect(m).toContain('2. Hujjatlar rus tilida'); expect(m).toContain('Narx doim QQS siz'); expect(m).toContain('unut 2');
  });
  it('yoz: taklif (tasdiqsiz yozilmaydi), tasdiqlansa mavjud xotira RPC (kalit smeta.jarvis.*), kompaniya darajasi', async () => {
    const a = api(); const r = await vositaIshla('xotira_yoz', 'eslab qol: kompaniya: hujjatlar rus tilida', kont(a));
    if (r.tur !== 'taklif') throw new Error('taklif'); expect(a.xotiraYoz).not.toHaveBeenCalled();
    await r.bajar(); expect(a.xotiraYoz).toHaveBeenCalledWith('kompaniya', expect.stringMatching(/^smeta\.jarvis\./), 'hujjatlar rus tilida');
  });
  it('yoz: pul summasi xotiraga yozilmaydi', async () => {
    const a = api(); const r = await vositaIshla('xotira_yoz', 'eslab qol: shartnoma 50 mln', kont(a));
    expect(r.tur).toBe('javob'); expect(a.xotiraYoz).not.toHaveBeenCalled();
  });
  it('unut: raqam bo‘yicha — taklif, bajarilsa mazmun "-"; raqamsiz — variantlar; tizim yozuvi unutilmaydi', async () => {
    const a = api(); const r = await vositaIshla('xotira_unut', 'unut 2', kont(a));
    if (r.tur !== 'taklif') throw new Error('taklif'); await r.bajar(); expect(a.xotiraYoz).toHaveBeenCalledWith('kompaniya', 'smeta.jarvis.b2', '-');
    const s = await vositaIshla('xotira_unut', 'unut', kont(api())); expect(s.tur).toBe('savol');
    if (s.tur === 'savol') { const t = await vositaIshla('xotira_unut', '1', kont(api()), s.davom); expect(t.tur).toBe('taklif'); }
    expect((await vositaIshla('xotira_unut', 'unut 3', kont(api()))).tur).toBe('savol');   // 3-raqam yo'q (tizim yozuvi ro'yxatda emas)
  });
});
