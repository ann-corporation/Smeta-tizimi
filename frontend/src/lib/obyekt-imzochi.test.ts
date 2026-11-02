import { describe, expect, it } from 'vitest';
import { imzochiMatni, obyektImzoNomlari, shartnomaImzoNomlari } from './obyekt-imzochi';
import type { ImzochiYozuv, ObyektImzochi } from '../api/obyekt-imzochi';

const yz = (o: Partial<ImzochiYozuv>): ImzochiYozuv => ({ daraja: 'obyekt', razdel_id: null, tashkilot: null, lavozim: null, fio: null, manba: 'ozi', tomon_kompaniya_id: 1, yangilangan_at: null, ...o });
const rol = (r: ObyektImzochi['rol'], effektiv: ImzochiYozuv | null): ObyektImzochi => ({ rol: r, effektiv, qatlamlar: { loyiha: null, obyekt: null, razdel: null }, yozish: { loyiha: false, obyekt: false, razdel: false } });

describe('obyekt imzochilari resolveri', () => {
  it('imzochiMatni: bo‘shlar tashlanadi, hammasi bo‘sh — null', () => {
    expect(imzochiMatni({ tashkilot: 'ABC MChJ', lavozim: ' ', fio: 'Aliyev A.' })).toBe('ABC MChJ, Aliyev A.');
    expect(imzochiMatni({ tashkilot: ' ', lavozim: null, fio: '' })).toBeNull();
    expect(imzochiMatni(null)).toBeNull();
  });

  it('ustunlik: obyekt/meros yozuvi > shartnoma tashkiloti > bo‘sh', () => {
    const n = obyektImzoNomlari({
      imzochilar: [rol('zakazchik', yz({ daraja: 'loyiha', tashkilot: 'Buyurtma MChJ', fio: 'Valiyev V.' })), rol('texnadzor', null)],
      shartnoma: { zakazchik: 'Shartnomadagi zakazchik', pudratchi: 'Shartnomadagi pudratchi', texnadzor: 'Nazorat MChJ' },
    });
    expect(n.zakazchik).toBe('Buyurtma MChJ, Valiyev V.');
    expect(n.pudratchi).toBe('Shartnomadagi pudratchi');
    expect(n.texnadzor).toBe('Nazorat MChJ');
    expect(n.subpudratchi).toBeUndefined();
  });

  it('tuzuvchi/tekshiruvchi faqat kompaniya sukutidan; kompaniyadagi eski tomon nomlari e‘tiborga olinmaydi', () => {
    const n = obyektImzoNomlari({ kompaniya: { zakazchik: 'ESKI', tuzuvchi: 'PTO Karimov', tekshiruvchi: ' ' } });
    expect(n).toEqual({ tuzuvchi: 'PTO Karimov' });
  });

  it('shartnomaImzoNomlari: liniya yo‘q — bo‘sh', () => {
    expect(shartnomaImzoNomlari(null, 1)).toEqual({});
    const l = { loyihalar: [], rollar: [], turlar: [], obyektlar: [{ id: 5, nom: 'O', loyiha_id: null, asosiy_shartnoma_id: 9 }],
      shartnomalar: [{ id: 9, loyiha_id: null, raqam: '1', nom: null, turi: null, asosiy: true, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null, izoh: null, versiya: 1, obyektlar: [5],
        tomonlar: [{ rol: 'Buyurtmachi', nom: 'Z MChJ', inn: null }, { rol: 'Pudratchi', nom: 'P MChJ', inn: null }] }] };
    expect(shartnomaImzoNomlari(l, 5)).toMatchObject({ zakazchik: 'Z MChJ', pudratchi: 'P MChJ' });
  });
});
