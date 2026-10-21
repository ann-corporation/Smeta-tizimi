import { describe, expect, it } from 'vitest';
import { aktsizFayllar, bosqich, filtrla, manbaAniqla, reestrQur, tartibla, yigindi, type ReestrAkt, type ReestrObyekt } from './reestr';

const akt = (o: Partial<ReestrAkt>): ReestrAkt => ({ id: 1, obyekt_id: 10, oy: '2026-07-01', raqam: null, holat: 'tasdiqlangan', lifecycle_status: 'approved',
  hujjat_jami: 100, farq: 0, qator_soni: 5, narxsiz_qator: 0, manba: 'import', ...o });
const obyekt = (o: Partial<ReestrObyekt>): ReestrObyekt => ({ id: 10, nom: 'Amfiteatr', loyiha_id: 7, jami: 1000, narxsiz: 0, ...o });

describe('F2 reestr', () => {
  it('bosqich: lifecycle birinchi, eski holat zaxira', () => {
    expect(bosqich({ holat: 'qoralama', lifecycle_status: 'approved' })).toBe('tasdiqlangan');
    expect(bosqich({ holat: 'qoralama', lifecycle_status: 'rejected' })).toBe('rad');
    expect(bosqich({ holat: 'bekor', lifecycle_status: 'cancelled' })).toBe('bekor');
    expect(bosqich({ holat: 'qoralama', lifecycle_status: 'submitted' })).toBe('jarayonda');
    expect(bosqich({ holat: 'tasdiqlangan', lifecycle_status: null })).toBe('tasdiqlangan');
  });
  it('NULL ≠ 0: summasi noma’lum akt jamiga qo‘shilmaydi, alohida sanaladi; 0 esa haqiqiy 0', () => {
    expect(yigindi([{ hujjat_jami: 100 }, { hujjat_jami: null }, { hujjat_jami: 0 }])).toEqual({ malum: 100, nomalum: 1, soni: 3 });
  });
  it('manba: import ishi yoki f2_v3 — import; belgisiz qator — tizimda yasalgan; fayl id son bo‘lsa olinadi', () => {
    expect(manbaAniqla({ import_job_id: '31', hujjat_id: '328' })).toEqual({ manba: 'import', import_job_id: 31, hujjat_id: 328 });
    expect(manbaAniqla({ manba: 'f2_v3' })).toEqual({ manba: 'import', import_job_id: null, hujjat_id: null });
    expect(manbaAniqla({ manba: null })).toEqual({ manba: 'tizim', import_job_id: null, hujjat_id: null });
    expect(manbaAniqla(null).manba).toBe('tizim');
    // raw_snapshot ichida qiymatlar son bo'lib keladi (production akt 293 → job 31, hujjat 328).
    expect(manbaAniqla({ import_job_id: 31, hujjat_id: 328, manba: 'f2_v3' })).toEqual({ manba: 'import', import_job_id: 31, hujjat_id: 328 });
  });
  it('obyekt qatori: bosqichlar, import/tizim tasdiqlangan summasi, ogohlar', () => {
    const { qatorlar, jami } = reestrQur({
      obyektlar: [obyekt({}), obyekt({ id: 11, nom: 'Karting', loyiha_id: null, jami: null })],
      aktlar: [akt({ id: 1, hujjat_jami: 300 }), akt({ id: 2, oy: '2026-07-01', hujjat_jami: 900, manba: 'tizim' }),
        akt({ id: 3, oy: '2026-08-01', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: null }),
        akt({ id: 4, holat: 'bekor', lifecycle_status: 'cancelled', hujjat_jami: 50 })],
      shartnomalar: new Map([[10, [{ id: 9, raqam: '9', nom: 'Amfiteatr', jami_nds_bilan: 600, summa_bez_nds: null }]]]),
      loyihalar: new Map([[7, 'Navoiy bog‘']]),
    });
    const a = qatorlar[0];
    expect(a.loyiha).toBe('Navoiy bog‘');
    expect(a.boyicha.tasdiqlangan).toEqual({ malum: 1200, nomalum: 0, soni: 2 });
    expect(a.boyicha.jarayonda).toEqual({ malum: 0, nomalum: 1, soni: 1 });
    expect(a.boyicha.bekor.soni).toBe(1);
    expect([a.tasdiqImport.malum, a.tasdiqTizim.malum]).toEqual([300, 900]);
    expect(a.oxirgiOy).toBe('2026-08-01');
    expect(a.ogohlar.map(o => o.tur)).toEqual(['shartnomadan_oshgan', 'oy_takror', 'summa_nomalum']);
    expect(a.ogohlar[0].qiymat).toBe(2);   // 1200 / 600
    expect(qatorlar[1].ogohlar).toEqual([]); // F2 si yo'q obyektda "shartnomasiz" ogohlantirish yo'q
    expect(jami.boyicha.tasdiqlangan.malum).toBe(1200);
    expect(jami.smeta).toEqual({ malum: 1000, nomalum: 1, soni: 2 });
  });
  it('shartnomasiz obyekt ochiq ko‘rsatiladi (taxmin bilan bog‘lanmaydi)', () => {
    const { qatorlar, jami } = reestrQur({ obyektlar: [obyekt({})], aktlar: [akt({})], shartnomalar: new Map(), loyihalar: new Map() });
    expect(qatorlar[0].ogohlar[0].tur).toBe('shartnomasiz');
    expect(jami.shartnomasiz).toBe(1);
  });
  it('akt yozilmagan import fayllari ajratiladi', () => {
    expect(aktsizFayllar([{ id: '328' }, { id: '400' }], [{ hujjat_id: 328 }, { hujjat_id: null }]).map(f => f.id)).toEqual(['400']);
  });
  it('filtr va tartib: muammolilar oldin, F2 sizlar oxirida', () => {
    const { qatorlar } = reestrQur({ obyektlar: [obyekt({ id: 1, nom: 'B' }), obyekt({ id: 2, nom: 'A' }), obyekt({ id: 3, nom: 'C' })],
      aktlar: [akt({ id: 1, obyekt_id: 1 }), akt({ id: 2, obyekt_id: 2, hujjat_jami: null })], shartnomalar: new Map([[1, [{ id: 1, raqam: '1', nom: null, jami_nds_bilan: null, summa_bez_nds: null }]], [2, [{ id: 2, raqam: '2', nom: null, jami_nds_bilan: null, summa_bez_nds: null }]]]), loyihalar: new Map() });
    expect(tartibla(qatorlar).map(q => q.obyekt.nom)).toEqual(['A', 'B', 'C']);
    expect(filtrla(qatorlar, { bosqich: 'f2siz', matn: '', faqatMuammo: false }).map(q => q.obyekt.nom)).toEqual(['C']);
    expect(filtrla(qatorlar, { bosqich: 'hammasi', matn: '', faqatMuammo: true }).map(q => q.obyekt.nom)).toEqual(['A']);
    expect(filtrla(qatorlar, { bosqich: 'hammasi', matn: 'b', faqatMuammo: false }).map(q => q.obyekt.nom)).toEqual(['B']);
  });
});
