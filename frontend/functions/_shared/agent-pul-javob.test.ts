import { describe, expect, it } from 'vitest';
import { obyektTanla, pulJavobi, pulJavobMatni, pulSorovi } from './agent-pul-javob';

const OB = [{ id: 1, nom: 'Test Teatr' }, { id: 2, nom: 'Test Teatr 2-etaj' }, { id: 3, nom: 'Boshqa Bino' }];
const NK = { ok: true, nk_manba: 'smeta_podvali', cats: { chel: 100, mash: 0, mat: 200, ob: 0 }, nakrutka: { pryamye: 1000, itogo4: 1200, nds: 144, vsego: 1344 } };

describe('pulSorovi: ustama/QQS bilan smeta qiymati sinonimlari', () => {
  it.each([
    'nakrutkalari va QQS bilan smeta qiymati qancha shu obyektni', 'ustama bilan smeta qancha', 'накладные расходы смета сколько',
    'НДС bilan smeta summasi', 'NDS bilan qiymati qancha', 'qqs bilan jami qancha', 'nakrutka bilan summa',
  ])('ha: %s', (q) => expect(pulSorovi(q)).toBe(true));
  it.each(['salom', 'QQS nima', 'obyekt haqida malumot ber', 'bugungi ishlarim'])('yo‘q: %s', (q) => expect(pulSorovi(q)).toBe(false));
});

describe('obyektTanla', () => {
  it('nom savolda (qo‘shimchali), eng aniq nom yutadi', () => {
    expect(obyektTanla('test teatrda smeta', [], OB, null)).toEqual({ tur: 'bor', obyekt: OB[0] });
    expect(obyektTanla('test teatr 2-etaj qancha', [], OB, null)).toEqual({ tur: 'bor', obyekt: OB[1] });
    expect(obyektTanla('boshqa binoda nakrutka', [], OB, null)).toEqual({ tur: 'bor', obyekt: OB[2] });
  });
  it('«shu obyekt» — tarixdan (oxirgi aniq obyekt)', () => {
    const tarix = [{ rol: 'user', matn: 'boshqa bino haqida malumot ber' }, { rol: 'assistant', matn: 'Smeta: ...' }];
    expect(obyektTanla('shu obyektni nakrutka bilan qancha', tarix, OB, null)).toEqual({ tur: 'bor', obyekt: OB[2] });
  });
  it('ochiq obyekt (sahifa) tarixdan ustun; hech narsa yo‘q — yoq', () => {
    expect(obyektTanla('bu obyekt', [{ rol: 'user', matn: 'boshqa bino' }], OB, 1)).toEqual({ tur: 'bor', obyekt: OB[0] });
    expect(obyektTanla('bu obyekt', [], OB, null)).toEqual({ tur: 'yoq' });
  });
});

describe('pulJavobMatni', () => {
  it('QQS bilan asosiy, keyin ustamali QQS siz, keyin ustamasiz', () => {
    const t = pulJavobMatni('Test Teatr', NK);
    expect(t.indexOf('QQS bilan')).toBeLessThan(t.indexOf('Ustamali')); expect(t.indexOf('Ustamali')).toBeLessThan(t.indexOf('Ustamasiz'));
    expect(t).not.toMatch(/Diqqat/);
  });
  it('podval yo‘q — aniq aytiladi', () => expect(pulJavobMatni('X', { ...NK, nk_manba: 'sukut' })).toMatch(/smeta podvali .* topilmadi/));
  it('smeta podvali yo‘q bo‘lsa standart ustama va QQS summasi chiqmaydi', () => {
    const text = pulJavobMatni('X', { ...NK, nk_manba: 'sukut' });
    expect(text).toContain('Ma’lumot yo‘q');
    expect(text.replace(/\s/g, '')).not.toMatch(/1344|1200/);
  });
  it('manfiy smeta tuzatishlarining ishorasi saqlanadi', () => {
    const text = pulJavobMatni('X', { ...NK, cats: { mat: -100 }, nakrutka: { pryamye: -100, itogo4: -125, vsego: -140 } });
    expect(text).toMatch(/-140/);
    expect(text).toMatch(/-125/);
    expect(text).toMatch(/-100/);
  });
  it('narxsiz smeta va hisob xatosi — sababi bilan, «bilmayman» emas', () => {
    expect(pulJavobMatni('X', { ...NK, cats: {}, nakrutka: { pryamye: 0, itogo4: 0, vsego: 0 } })).toMatch(/narxsiz/);
    expect(pulJavobMatni('X', { ok: false })).toMatch(/hisoblab bo‘lmadi/);
  });
});

describe('pulJavobi (oqim)', () => {
  const rpc = (nk = NK) => async (nom: string) => nom === 't2_agent_fakt_v1' ? { ok: true, data: { fakt: { obyektlar: OB } } } : { ok: true, data: nk };
  const o = { actor: 1, kid: 1, tarix: [], obyektId: null as number | null };
  it('model emas savol — null; smeta_pul ruxsati yo‘q — null', async () => {
    expect(await pulJavobi(rpc(), { ...o, savol: 'salom', ruxsat: ['smeta_pul'] })).toBeNull();
    expect(await pulJavobi(rpc(), { ...o, savol: 'boshqa bino nakrutka bilan smeta qancha', ruxsat: ['obyektlar'] })).toBeNull();
  });
  it('tarix orqali «shu obyekt»', async () => {
    const j = await pulJavobi(rpc(), { ...o, savol: 'nakrutkalari va QQS bilan smeta qiymati qancha shu obyektni', tarix: [{ rol: 'user', matn: 'boshqa bino obyektim haqida malumot ber' }], ruxsat: ['smeta_pul'] });
    expect(j).toMatch(/Boshqa Bino/); expect(j).toMatch(/QQS bilan/);
  });
  it('obyekt noma‘lum — so‘raydi', async () => {
    expect(await pulJavobi(rpc(), { ...o, savol: 'nakrutka bilan smeta qancha', ruxsat: ['smeta_pul'] })).toMatch(/Qaysi obyekt/);
  });
});
