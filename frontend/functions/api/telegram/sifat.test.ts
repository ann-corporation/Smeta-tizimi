// @vitest-environment node
/* Bot suhbat sifati (egasining haqiqiy chatidagi nuqsonlar): til izchilligi, /start bir marta, kutilgan niyat, kontekst bo'yicha yo'naltirish
 * (fakt ≠ ombor), xom token matnda yo'q, sinov obyektlari yashirin. SINTETIK; Telegram va shlyuzlar soxta; haqiqiy ma'lumot yo'q. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limitTozala } from '../../_shared/telegram-bot';
import { holatTozalaTest, niyatAniqla, sinovniSuz } from '../../_shared/telegram-holat';

const net = vi.hoisted(() => ({ amal: vi.fn() }));
vi.mock('../../_shared/telegram-amal', () => ({ botChaqiruv: net.amal, botChaqiruvFayl: vi.fn() }));
import { updateIshla } from './webhook';

const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32), TELEGRAM_BOT_TOKEN: '123456789:AAFakeSinovTokenFakeSinovToken_abc', TELEGRAM_SAYT_URL: 'https://qurai.uz' };
const TG = 5550001, UID = 7;
let tilHisob: string | null = null; let ulangan = true; let kodHolati: Record<string, unknown> = { ok: true, ism: 'Sinov' };
let tg: { metod: string; yuk: any }[] = []; let rpc: { nom: string; yuk: any }[] = []; let uid = 5000; let obyektlar: { id: number; nom: string; kompaniya_id: number }[] = [];
const TOK = btoa(JSON.stringify({ a: UID, k: 8, s: 3 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.imzo';
const msg = (text: string, til = 'uz', extra: Record<string, unknown> = {}) => ({ update_id: ++uid, message: { text, chat: { id: TG, type: 'private' }, from: { id: TG, language_code: til }, ...extra } });
const cbq = (data: string, til = 'uz', message: Record<string, unknown> = {}) => ({ update_id: ++uid, callback_query: { id: 'c', from: { id: TG, language_code: til }, data, message: { message_id: 9, chat: { id: TG, type: 'private' }, ...message } } });
const matnlar = () => tg.filter((x) => x.metod === 'sendMessage').map((x) => String(x.yuk.text));
const apiChaqiruvlar = (api: string) => net.amal.mock.calls.filter((c) => c[2].api === api).map((c) => c[2].json);

beforeEach(() => {
  tilHisob = null; ulangan = true; kodHolati = { ok: true, ism: 'Sinov' }; tg = []; rpc = []; limitTozala(); holatTozalaTest(); net.amal.mockReset();
  obyektlar = [{ id: 240, nom: 'Sinov Bog‘ obyekti', kompaniya_id: 17 }, { id: 79, nom: 'SINOV test bino', kompaniya_id: 17 }, { id: 80, nom: 'Real maktab', kompaniya_id: 17 }, { id: 81, nom: 'Real bino', kompaniya_id: 17 }];
  net.amal.mockImplementation(async (_e: unknown, _u: number, c: { api: string; json?: any }) => {
    if (c.api === 'sb' && c.json.jadval === 't2_obyekt') return { status: 200, body: { ok: true, qatorlar: obyektlar.filter((o) => !c.json.filtr.includes('id=eq.') || c.json.filtr.includes(`id=eq.${o.id}`)) } };
    if (c.api === 'sb' && c.json.jadval === 't2_qator') return { status: 200, body: { ok: true, qatorlar: [{ id: 501, ota_id: null, kod: 'K1', nom: 'Trotuar styajka', birlik: 'm3' }] } };
    if (c.api === 'smeta-ai') return { status: 200, body: { ok: true, niyatlar: [{ tavsif: 'trotuarga styajka', birlik: 'm3', hajm: '10' }] } };
    if (c.api === 'ai-savol') return { status: 200, body: { ok: true, javob: 'Jarvis javobi' } };
    if (c.api === 'ombor-buyruq') {
      if (c.json.amal === 'kontekst') return { status: 200, body: { ok: true, omborlar: [{ id: 3, kompaniya_id: 8, nomi: 'Sinov ombor', yozish: true }] } };
      return { status: 200, body: { ok: true, holat: 'tasdiq_kerak', token: TOK, preview: { tur: 'prixod', nomi: 'sement', miqdor: 10, birligi: 'tonna', sana: '2026-11-19' } } };
    }
    if (c.api === 'hujjat-yukla') return { status: 200, body: { ok: true, document_id: 55 } };
    if (c.api === 'foto-dalil') return { status: 200, body: { ok: true, id: 66 } };
    return { status: 404, body: null };
  });
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    if (url.host === 'api.telegram.org') {
      if (url.pathname.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      const metod = url.pathname.split('/').at(-1)!;
      const yuk = JSON.parse(String(init?.body ?? '{}')); tg.push({ metod, yuk });
      return Response.json(metod === 'getFile' ? { ok: true, result: { file_path: 'photos/a.jpg', file_size: 3 } } : { ok: true, result: true });
    }
    const nom = url.pathname.split('/').at(-1)!; const yuk = init?.body ? JSON.parse(String(init.body)) : {}; rpc.push({ nom, yuk });
    if (nom === 't2_telegram_update_qabul_v1') return Response.json({ ok: true, yangi: true, limit: false });
    if (nom === 't2_telegram_aniqla_v1') return Response.json({ ok: true, ulangan, foydalanuvchi_id: ulangan ? UID : null });
    if (nom === 't2_telegram_ulash_v1') return Response.json(kodHolati);
    if (nom === 't2_profil_ol_v1') return tilHisob === null ? Response.json({ message: 'yo‘q' }, { status: 404 }) : Response.json({ ok: true, profil: { til: tilHisob } });
    if (nom === 't2_profil_yangila_v1') { tilHisob = yuk.p_til; return Response.json({ ok: true, profil: { til: yuk.p_til } }); }
    if (nom === 't2_men_v1') return Response.json({ ok: true, foydalanuvchi: { ism: 'Sinov' }, azoliklar: [{ kompaniya_id: 17, nom: 'Sinov MChJ', rol: 'pto', faol: true, is_director: true, kod: 'SINOV' }] });
    if (nom === 't2_kompaniya_taklif_yubor_v1') return Response.json({ ok: true, profil: { ism: 'Sinov Odam', username: 'sinov_odam' } });
    return Response.json({ message: 'yo‘q' }, { status: 404 });
  }));
});

describe('1) TIL: hisob tilidan, bir chatda izchil', () => {
  it('Telegram language_code almashsa ham javob tili o‘zgarmaydi (hisob tili ru)', async () => {
    tilHisob = 'ru';
    for (const kod of ['uz', 'en', 'ru', 'uz']) await updateIshla(ENV, msg('/men', kod));
    await updateIshla(ENV, msg('/yordam', 'en'));
    const t = matnlar();
    expect(t.slice(0, 4).every((x) => x.startsWith('Вы:'))).toBe(true);
    expect(t[4]).toContain('Команды:');
    expect(t.join('\n')).not.toMatch(/Siz:|Buyruqlar:/);
  });
  it('hisob tili belgilanmagan — o‘zbek lotin (Telegram ru/en bo‘lsa ham)', async () => {
    for (const kod of ['ru', 'en']) await updateIshla(ENV, msg('/men', kod));
    expect(matnlar().every((x) => x.startsWith('Siz:'))).toBe(true);
  });
  it('/til ru hisob tilini o‘zgartiradi (profil RPC), keyingi xabarlar ruscha; tugma bilan ham', async () => {
    await updateIshla(ENV, msg('/til'));
    expect(JSON.stringify(tg.at(-1)!.yuk.reply_markup)).toContain('tl:ru');
    expect(await updateIshla(ENV, cbq('tl:ru'))).toBe('cb:til');
    expect(rpc.find((r) => r.nom === 't2_profil_yangila_v1')!.yuk).toMatchObject({ p_actor_id: UID, p_til: 'ru' });
    tg = []; await updateIshla(ENV, msg('/men'));
    expect(matnlar()[0]).toMatch(/^Вы:/);
    expect(await updateIshla(ENV, msg('/til en'))).toBe('til');
    expect(matnlar().at(-1)).toContain('Language changed');
  });
});

describe('2) /start: bitta aniq javob', () => {
  it('eskirgan/ishlatilgan havola + allaqachon ulangan foydalanuvchi — xato emas, bitta salom (menyu)', async () => {
    kodHolati = { ok: false, code: 'KOD_ISHLATILGAN' };
    expect(await updateIshla(ENV, msg('/start ' + 'A'.repeat(32)))).toBe('salom');
    expect(matnlar()).toHaveLength(1);
    expect(matnlar()[0]).not.toContain('allaqachon ishlatilgan');
    expect(tg.find((x) => x.metod === 'sendMessage')!.yuk.reply_markup.is_persistent).toBe(true);
  });
  it('ulanmagan foydalanuvchiga eskirgan havola — bitta tushunarli xato', async () => {
    ulangan = false; kodHolati = { ok: false, code: 'KOD_ISHLATILGAN' };
    expect(await updateIshla(ENV, msg('/start ' + 'A'.repeat(32)))).toBe('ulash_rad:KOD_ISHLATILGAN');
    expect(matnlar()).toHaveLength(1);
  });
  it('muvaffaqiyatli ulash — bitta xabar; darhol kelgan /start takrorlanmaydi', async () => {
    expect(await updateIshla(ENV, msg('/start ' + 'B'.repeat(32)))).toBe('ulandi');
    expect(matnlar()).toHaveLength(1);
    expect(await updateIshla(ENV, msg('/start'))).toBe('salom_takror');
    expect(matnlar()).toHaveLength(1);
  });
});

describe('3) kutilgan niyat: keyingi oddiy xabar amalni yakunlaydi', () => {
  const rasm = { photo: [{ file_id: 'AgACAgIAAxkBAAIB_sinov_1', width: 90, height: 90 }, { file_id: 'AgACAgIAAxkBAAIB_sinov_2', width: 800, height: 800 }] };
  it('rasm obyektsiz → «qaysi obyekt?»; «240» yozilsa rasm shu obyektga saqlanadi (qayta yuborish shart emas)', async () => {
    expect(await updateIshla(ENV, msg('', 'uz', rasm))).toBe('foto');
    expect(matnlar()[0]).toContain('Raqamini yozing');
    expect(net.amal.mock.calls.some((c) => c[2].api === 'hujjat-yukla')).toBe(false);
    expect(await updateIshla(ENV, msg('240'))).toBe('foto_kutilgan');
    expect(net.amal.mock.calls.find((c) => c[2].api === 'foto-dalil')![2].json).toMatchObject({ obyekt_id: 240 });
    expect(matnlar().at(-1)).toContain('dalil sifatida saqlandi');
  });
  it('/taklif → «kimni?»; «@user» → «qaysi rolda?»; «prorab» → taklif yuboriladi', async () => {
    await updateIshla(ENV, msg('/taklif'));
    expect(matnlar()[0]).toContain('Kimni taklif');
    expect(await updateIshla(ENV, msg('@sinov_odam'))).toBe('taklif_kutilgan');
    expect(matnlar()[1]).toContain('Qaysi rolda');
    expect(rpc.some((r) => r.nom === 't2_kompaniya_taklif_yubor_v1')).toBe(false);
    await updateIshla(ENV, msg('prorab'));
    expect(rpc.find((r) => r.nom === 't2_kompaniya_taklif_yubor_v1')!.yuk).toMatchObject({ p_qiymat: '@sinov_odam', p_rol: 'prorab' });
    expect(matnlar()[2]).toContain('Taklif yuborildi');
  });
  it('/fakt (obyektsiz) → «qaysi obyekt?», «240» → matn so‘raladi, keyin fakt qoralamasi (obyekt 240)', async () => {
    await updateIshla(ENV, msg('/fakt'));
    expect(matnlar()[0]).toContain('Raqamini yozing');
    expect(matnlar()[0]).toContain('#80 Real maktab'); expect(matnlar()[0]).not.toMatch(/#240|#79/);   // sinov obyektlar yo'q
    expect(await updateIshla(ENV, msg('240'))).toBe('fakt_obyekt_tanlandi');
    expect(await updateIshla(ENV, msg('trotuarga 10 m3 styajka'))).toBe('fakt_kutilgan');
    expect(apiChaqiruvlar('smeta-ai')[0]).toMatchObject({ amal: 'f2_niyat', kompaniya_id: 17 });
    expect(matnlar().at(-1)).toContain('Fakt QORALAMASI');
  });
  it('kutilgan niyat bo‘lmasa oddiy matn Jarvis ga ketadi — «hozircha bot shu buyruqlarni» ro‘yxati chiqmaydi', async () => {
    expect(await updateIshla(ENV, msg('2-lot bo‘yicha beton narxi qancha?'))).toBe('jarvis_matn');
    expect(apiChaqiruvlar('ai-savol')[0]).toMatchObject({ savol: '2-lot bo‘yicha beton narxi qancha?' });
    expect(matnlar()).toEqual(['Jarvis javobi']);
  });
});

describe('4) yo‘naltirish: fakt ≠ ombor; xom token matnda yo‘q', () => {
  const MATN = 'Yo‘l 2.5km uchun trotuarga 10m3 styajka qilindi';
  it('/fakt dan keyin shu gap — FAKT qoralamasi (ombor kirimi emas)', async () => {
    await updateIshla(ENV, msg('/fakt'));
    await updateIshla(ENV, msg('80'));
    tg = [];
    await updateIshla(ENV, msg(MATN));
    expect(apiChaqiruvlar('ombor-buyruq')).toEqual([]);
    expect(matnlar().at(-1)).toContain('Fakt QORALAMASI');
    expect(matnlar().at(-1)).not.toMatch(/KIRIM|prixod/i);
  });
  it('/fakt siz ham: bajarilgan ish + hajm — fakt; yagona real obyekt standart bo‘ladi, sinov emas', async () => {
    obyektlar = obyektlar.slice(0, 3);   // 2 sinov + 1 real
    await updateIshla(ENV, msg(MATN));
    expect(apiChaqiruvlar('ombor-buyruq')).toEqual([]);
    expect(apiChaqiruvlar('smeta-ai')).toHaveLength(1);
    expect(matnlar().at(-1)).toContain('Fakt QORALAMASI');
    expect(matnlar().at(-1)).toContain('Real maktab');
  });
  it('ombor niyati («keldi») — ombor kartasi; tasdiq tokeni matnda emas, ko‘rinmas entity da; tugma shu tokenni o‘qiydi', async () => {
    expect(await updateIshla(ENV, msg('sement 10 tonna keldi'))).toBe('ombor_matn');
    const m = tg.find((x) => x.metod === 'sendMessage')!.yuk;
    expect(m.text).toContain('KIRIM');
    expect(m.text).not.toMatch(/#OB|#OS|eyJ/);
    expect(JSON.stringify(m.entities)).toContain('#ob=' + TOK);
    net.amal.mockClear();
    await updateIshla(ENV, cbq('ob:y', 'uz', { text: m.text, entities: m.entities }));
    expect(net.amal.mock.calls.find((c) => c[2].api === 'ombor-buyruq')![2].json).toMatchObject({ amal: 'tasdiq', token: TOK });
  });
  it('niyat aniqlagich: savol — Jarvis; hajmsiz gap — Jarvis; ombor so‘zlari — ombor', () => {
    expect(niyatAniqla(MATN)).toBe('fakt');
    expect(niyatAniqla('sement 10 tonna keldi')).toBe('ombor');
    expect(niyatAniqla('mixdan 20 kg berdim')).toBe('ombor');
    expect(niyatAniqla('qoldiq qancha?')).toBe('jarvis');
    expect(niyatAniqla('Obyektlar bo‘yicha beton narxlari')).toBe('jarvis');
  });
});

describe('5) sinov obyektlari haqiqiy ro‘yxatda yo‘q', () => {
  it('/obyektlar va menyu «Obyektlar» — SINOV… chiqmaydi; faqat sinovlar qolsa — ko‘rinadi', async () => {
    await updateIshla(ENV, msg('/obyektlar'));
    expect(matnlar()[0]).toContain('#80 Real maktab'); expect(matnlar()[0]).toContain('#81 Real bino'); expect(matnlar()[0]).not.toMatch(/#240|#79|Sinov|SINOV/);
    tg = [];
    await updateIshla(ENV, msg('Obyektlar'));
    const tugmalar = JSON.stringify(tg.find((x) => x.metod === 'sendMessage')!.yuk.reply_markup);
    expect(tugmalar).toContain('g:k:80'); expect(tugmalar).not.toMatch(/g:k:240|g:k:79/);
    obyektlar = obyektlar.slice(0, 2); tg = [];
    await updateIshla(ENV, msg('/obyektlar'));
    expect(matnlar()[0]).toContain('#240');
  });
  it('sinovniSuz: tartib saqlanadi, haqiqiy yo‘q bo‘lsa — o‘zgarishsiz', () => {
    expect(sinovniSuz([{ nom: 'SINOV a' }, { nom: 'Bino' }, { nom: 'Test b' }, { nom: 'Maktab' }]).map((x) => x.nom)).toEqual(['Bino', 'Maktab']);
    expect(sinovniSuz([{ nom: 'SINOV a' }]).map((x) => x.nom)).toEqual(['SINOV a']);
  });
});
