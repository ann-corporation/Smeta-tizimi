import { describe, expect, it } from 'vitest';
import type { MindmapTugun, TugunTur } from '../api/t2-mindmap';
import { NODE_W, TUGUN_BALANDLIGI, kartaAvtoJoylash, type XY } from './karta-joylash';
import { tomonKartasiniQur } from './karta-tomon';
import type { Aloqa, GrantQatori } from '../api/t2-tomon';

const tugun = (id: string, tur: TugunTur): MindmapTugun => ({ id, tur, nom: id, meta: { versiya: 1 }, x: null, y: null } as MindmapTugun);
const rollar = ['zakazchik', 'texnadzor', 'loyihachi', 'laboratoriya', 'taminotchi', 'subpudratchi', 'pudratchi'];
const aloqa = (id: number, rol: string): Aloqa => ({ id, holat: 'faol', turi: 'shartnoma', nom: null, men_taklif_qildim: true, men_rol: 'pudratchi', qarshi_rol: rol, qarshi_kompaniya_id: 100 + id, qarshi_nom: 'SINOV ' + rol + ' (test)', qarshi_inn: null, kod_kutilmoqda: false, kod_muddati: null, taklif_vaqti: '', javob_vaqti: null, yopish_sababi: null, izoh: null, berilgan_grant_soni: 1, olingan_grant_soni: 0, kelgan_ochiq_taqdim: 0, yuborilgan_ochiq_taqdim: 0 });
const grant = (id: number): GrantQatori => ({ id, resurs: 'f2', amallar: ['korish'], obyekt_id: 5, doira_nom: null, yaratildi: '' });
const kesishadi = (a: XY & { t: string }, b: XY & { t: string }) => Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < (TUGUN_BALANDLIGI(a.t) + TUGUN_BALANDLIGI(b.t)) / 2;

describe('Karta: bitta obyekt, 8 tomon (SINOV namunasi) — tugunlar ustma-ust tushmaydi', () => {
  const aloqalar = rollar.map((r, i) => aloqa(i + 1, r));
  const k = tomonKartasiniQur('kompaniya:1', aloqalar, new Map(aloqalar.map((a) => [a.id, [grant(a.id * 10)]])));
  const asos = [tugun('kompaniya:1', 'kompaniya'), tugun('loyiha:7', 'loyiha'), tugun('shartnoma:3', 'shartnoma'), tugun('obyekt:5', 'obyekt'), tugun('foydalanuvchi:2', 'foydalanuvchi')];
  const hammasi = [...asos, ...k.tugunlar];
  const joylar = (mavjud: Record<string, XY> = {}) => kartaAvtoJoylash(hammasi, mavjud);
  const tekshir = (j: Record<string, XY>) => {
    const r = hammasi.map((x) => ({ ...j[x.id], t: x.tur, id: x.id }));
    for (let i = 0; i < r.length; i++) for (let m = i + 1; m < r.length; m++) expect(kesishadi(r[i], r[m]), r[i].id + ' ↔ ' + r[m].id).toBe(false);
  };

  it('sakkiz tomon tugun va har biridan obyektga grant chizig‘i', () => {
    expect(k.tugunlar).toHaveLength(7);
    expect(k.bogichlar.filter((b) => b.tur === 'tomon_grant' && b.maqsad === 'obyekt:5')).toHaveLength(7);
    expect(k.bogichlar.filter((b) => b.tur === 'tomon_aloqa')).toHaveLength(7);
  });
  it('toza avto-joylashtirish: ustma-ust tushish yo‘q', () => { tekshir(joylar()); });
  it('qisman saqlangan joylar (ayrim tomonlar surilgan): yangilari ularning ustiga tushmaydi', () => {
    const j0 = joylar();
    const qisman = { [k.tugunlar[0].id]: j0[k.tugunlar[0].id], [k.tugunlar[1].id]: j0[k.tugunlar[1].id] };
    const j = kartaAvtoJoylash(hammasi, qisman);
    tekshir(j);
  });
  it('tomon va odam tugunlari server tugunlaridan alohida ustunlarda', () => {
    const j = joylar();
    expect(j['tomon:1'].x).toBeGreaterThan(j['obyekt:5'].x);
  });
});

describe('Karta: oqim belgilari faqat son > 0 bo‘lganda', () => {
  it('subpudrat akti va ochiq buyurtma — chiziqda; 0/NULL — hech narsa', () => {
    const a = aloqa(1, 'subpudratchi'), y = aloqa(2, 'taminotchi');
    const bos = tomonKartasiniQur('kompaniya:1', [a, y], new Map([[1, [grant(11)]], [2, []]]));
    expect(bos.oqim.size).toBe(0);
    const k = tomonKartasiniQur('kompaniya:1', [a, y], new Map([[1, [grant(11)]], [2, []]]), {
      subAktlar: [{ aloqa_id: 1, obyekt_id: 5, holat: 'yuborilgan' }, { aloqa_id: 1, obyekt_id: 5, holat: 'qabul' }] as never,
      buyurtmalar: [{ ijrochi_kompaniya_id: 102, obyekt_id: 5, holat: 'yuborildi' }, { ijrochi_kompaniya_id: 102, obyekt_id: 5, holat: 'bekor' }] as never,
    });
    expect(k.oqim.get('tomon:1>obyekt:5')?.matn).toMatch(/1 subpudrat akti/);
    expect(k.oqim.get('tomon:2>obyekt:5')?.matn).toMatch(/1 ochiq buyurtma/);
    expect(k.bogichlar.some((b) => b.tur === 'tomon_buyurtma' && b.manba === 'tomon:2')).toBe(true);
  });
});