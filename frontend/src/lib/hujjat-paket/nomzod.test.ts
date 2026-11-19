import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';
import {
  daraxtQur, filtrServerga, hujjatniAlmashtir, katakBahosi, nomzodSuz, paketReja, papkaYoli, qoidaBilanAjrat, sukutTanlov, tanlovniTozala, tarkibMatni, tokenBahosi,
  tugunTop, tugunUchligi, tugunniAlmashtir, zipYollari, YOL_MAKS, type Nomzod,
} from './nomzod';
import { paketExcel, paketYigish, paketZipi, varaqNomi, type Yetkazuvchi } from './yigish';

let sanoq = 0;
const N = (o: Partial<Nomzod>): Nomzod => ({
  kalit: `k${++sanoq}`, tur: 'f2', sarlavha: `F-2 №${sanoq}`, holat: 'tasdiqlangan', loyiha_id: 1, loyiha_nom: 'Loyiha A', shartnoma_id: 7, shartnoma_raqam: '12',
  obyekt_id: 10, obyekt_nom: 'Obyekt 1', oy: '2031-03', akt_id: sanoq, forma3_id: null, taxminiy: false, takror: false, qator_soni: 100,
  fayl_id: null, versiya: null, bayt: null, yasash: true, ...o,
});

const TOPLAM: Nomzod[] = [
  N({ kalit: 'f2:1', holat: 'tasdiqlangan', fayl_id: 5, versiya: 2, bayt: 1000, yasash: false }),
  N({ kalit: 'f2:2', holat: 'qoralama', obyekt_id: 11, obyekt_nom: 'Obyekt 2', qator_soni: 40 }),
  N({ kalit: 'f2:3', holat: 'qoralama', taxminiy: true }),
  N({ kalit: 'f2:4', holat: 'qoralama', takror: true }),
  N({ kalit: 'nakopitelniy:10:2031-03', tur: 'nakopitelniy', holat: 'joriy', akt_id: null, qator_soni: null }),
  N({ kalit: 'f3:9', tur: 'forma3', holat: 'tasdiqlangan', obyekt_id: null, obyekt_nom: null, akt_id: null, forma3_id: 9, qator_soni: null, fayl_id: 8, versiya: 1, bayt: 500, yasash: false }),
  N({ kalit: 'aosr:10:2031-04', tur: 'aosr', holat: 'joriy', oy: '2031-04', akt_id: null, qator_soni: null }),
  N({ kalit: 'f2:20', loyiha_id: 2, loyiha_nom: 'Loyiha B', shartnoma_id: null, shartnoma_raqam: null, obyekt_id: 30, obyekt_nom: 'Obyekt X', oy: '2031-05', holat: 'tasdiqlangan' }),
];

describe('qoida: taxminiy va takror paketga kirmaydi', () => {
  it('qoidaBilanAjrat', () => {
    const { yaroqli, rad } = qoidaBilanAjrat(TOPLAM);
    expect(rad.map((r) => `${r.nomzod.kalit}:${r.sabab}`)).toEqual(['f2:3:taxminiy', 'f2:4:takror']);
    expect(yaroqli).toHaveLength(TOPLAM.length - 2);
  });
  it('tanlangan taxminiy/takror ham rejaga kirmaydi (rad ro\'yxatida)', () => {
    const r = paketReja(TOPLAM, new Set(['f2:1', 'f2:3', 'f2:4']));
    expect(r.hujjatlar.map((n) => n.kalit)).toEqual(['f2:1']);
    expect(r.rad).toHaveLength(2);
  });
});

describe('filtr', () => {
  it('loyiha, shartnoma, obyekt (ko\'p tanlov), oy oralig\'i, tur, holat', () => {
    expect(nomzodSuz(TOPLAM, { loyihaIds: [2] }).map((n) => n.kalit)).toEqual(['f2:20']);
    expect(nomzodSuz(TOPLAM, { obyektIds: [11, 30] }).map((n) => n.kalit)).toEqual(['f2:2', 'f2:20']);
    expect(nomzodSuz(TOPLAM, { shartnomaIds: [7], turlar: ['f2'], holatlar: ['qoralama'] }).map((n) => n.kalit)).toEqual(['f2:2', 'f2:3', 'f2:4']);
    expect(nomzodSuz(TOPLAM, { oyDan: '2031-04', oyGacha: '2031-04' }).map((n) => n.kalit)).toEqual(['aosr:10:2031-04']);
  });
  it('«joriy» (oylik hujjat) holat filtridan o\'tadi; oysiz hujjat oy filtridan o\'tadi', () => {
    const r = nomzodSuz([N({ kalit: 'sl', tur: 'slichitelniy', holat: 'joriy', oy: null })], { holatlar: ['tasdiqlangan'], oyDan: '2031-01' });
    expect(r).toHaveLength(1);
  });
  it('filtrServerga: snake_case, noto\'g\'ri oy tashlanadi', () => {
    expect(filtrServerga({ loyihaIds: [1], obyektIds: [2, 3], oyDan: '2031-01', oyGacha: 'xato', turlar: ['f2'], holatlar: ['qoralama'] }))
      .toEqual({ loyiha_ids: [1], obyekt_ids: [2, 3], oy_dan: '2031-01', turlar: ['f2'], holatlar: ['qoralama'] });
    expect(filtrServerga({})).toEqual({});
  });
});

describe('daraxt va uch holatli tanlov', () => {
  const yaroqli = qoidaBilanAjrat(TOPLAM).yaroqli;
  const d = daraxtQur(yaroqli);
  it('Loyiha > Shartnoma > Obyekt > Oy > Tur ierarxiyasi, nom bo\'yicha tartib', () => {
    expect(d.map((t) => t.nom)).toEqual(['Loyiha A', 'Loyiha B']);
    const sh = d[0].bolalar.map((t) => t.nom);
    expect(sh).toContain('Shartnoma №12');
    expect(d[1].bolalar[0].nom).toBe('Shartnomasiz');
    const ob1 = d[0].bolalar.find((t) => t.nom === 'Shartnoma №12')!.bolalar.find((t) => t.nom === 'Obyekt 1')!;
    const oy = ob1.bolalar.find((t) => t.nom === '2031-03')!;
    expect(oy.bolalar.map((t) => t.nom)).toEqual(['F-2', 'Nakopitelniy']); // tur tartibi
  });
  it('har tugunning barg kalitlari yig\'indisi; ildiz barglari = hamma hujjat', () => {
    expect(d.flatMap((t) => t.barg).sort()).toEqual(yaroqli.map((n) => n.kalit).sort());
  });
  it('tugunUchligi: yoq / qisman / hammasi', () => {
    const t = d[0];
    expect(tugunUchligi(t, new Set())).toBe('yoq');
    expect(tugunUchligi(t, new Set([t.barg[0]]))).toBe('qisman');
    expect(tugunUchligi(t, new Set(t.barg))).toBe('hammasi');
  });
  it('tugunniAlmashtir: yoq/qisman -> hammasi; hammasi -> yoq; boshqa tugunlarga tegmaydi', () => {
    const t = d[0]; const b = d[1];
    let s = tugunniAlmashtir(b, new Set());
    expect(tugunUchligi(b, s)).toBe('hammasi');
    s = tugunniAlmashtir(t, new Set([...s, t.barg[0]]));
    expect(tugunUchligi(t, s)).toBe('hammasi');
    expect(tugunUchligi(b, s)).toBe('hammasi');
    s = tugunniAlmashtir(t, s);
    expect(tugunUchligi(t, s)).toBe('yoq');
    expect(tugunUchligi(b, s)).toBe('hammasi');
  });
  it('hujjat bo\'yicha belgi va olib tashlash; tugunTop; tanlovniTozala; sukutTanlov', () => {
    const s = hujjatniAlmashtir('f2:1', new Set());
    expect([...s]).toEqual(['f2:1']);
    expect(hujjatniAlmashtir('f2:1', s).size).toBe(0);
    expect(tugunTop(d, d[0].bolalar[0].id)?.nom).toBe(d[0].bolalar[0].nom);
    expect(tugunTop(d, 'yoq')).toBeNull();
    expect([...tanlovniTozala(new Set(['f2:1', 'eskirgan']), TOPLAM)]).toEqual(['f2:1']);
    expect([...sukutTanlov(TOPLAM)].sort()).toEqual(['f2:1', 'f3:9']);
  });
});

describe('reja: Diskdan (bepul) / yasash / token bahosi', () => {
  const hammasi = new Set(TOPLAM.map((n) => n.kalit));
  const r = paketReja(TOPLAM, hammasi);
  it('Diskdagi versiyalar bepul; yasaladigan turlar yasashga; AOSR (yasab bo\'lmaydi) olinmaydi', () => {
    expect(r.diskdan.map((n) => n.kalit).sort()).toEqual(['f2:1', 'f3:9']);
    expect(r.yasash.map((n) => n.kalit).sort()).toEqual(['f2:2', 'f2:20', 'nakopitelniy:10:2031-03']);
    expect(r.olinmaydi.map((n) => n.kalit)).toEqual(['aosr:10:2031-04']);
    expect(r.bayt).toBe(1500);
  });
  it('katak bahosi: F-2 qator x 5; boshqa tur standart; token faqat yasaladigan hujjatlar uchun', () => {
    expect(katakBahosi({ tur: 'f2', qator_soni: 40 })).toBe(200);
    expect(katakBahosi({ tur: 'nakopitelniy', qator_soni: null })).toBe(1200);
    expect(r.katak).toBe(200 + 500 + 1200);
    const t = tokenBahosi(r, (k) => Math.ceil(k / 100));
    expect(t).toEqual({ token: 2 + 5 + 12, yasashSoni: 3, katak: 1900 });
    // faqat Diskdagi tanlansa - 0 token (narx hisoblagichi chaqirilmaydi)
    const d = paketReja(TOPLAM, new Set(['f2:1', 'f3:9']));
    expect(tokenBahosi(d, () => { throw new Error('chaqirilmasin'); }).token).toBe(0);
    expect(tokenBahosi(r, null).token).toBeNull();
    expect(tokenBahosi(r, () => null).token).toBeNull();
  });
});

describe('ZIP yo\'llari', () => {
  it('papka: Loyiha/Shartnoma/Obyekt/Oy/Tur', () => {
    expect(papkaYoli(TOPLAM[0])).toBe('Loyiha A/Shartnoma №12/Obyekt 1/2031-03/F-2');
    expect(papkaYoli(N({ loyiha_nom: null, shartnoma_raqam: null, obyekt_nom: null, oy: null, tur: 'm29' }))).toBe('Loyihasiz/Shartnomasiz/Obyektsiz/Oysiz/M-29');
  });
  it('xavfli belgilar tozalanadi, takror yo\'l _2, uzun yo\'l YOL_MAKS dan oshmaydi', () => {
    const a = N({ obyekt_nom: 'A/B:C*?' });
    const y = zipYollari([{ n: a, faylNomi: 'x.xlsx' }, { n: a, faylNomi: 'x.xlsx' }, { n: N({ obyekt_nom: 'U'.repeat(200) }), faylNomi: 'n'.repeat(300) + '.xlsx' }]);
    expect(y[0].yol).toBe('Loyiha A/Shartnoma №12/A_B_C_/2031-03/F-2/x.xlsx');
    expect(y[1].yol).toBe('Loyiha A/Shartnoma №12/A_B_C_/2031-03/F-2/x_2.xlsx');
    expect(y[2].yol.length).toBeLessThanOrEqual(YOL_MAKS + 60);
    expect(y[2].yol.endsWith('.xlsx')).toBe(true);
  });
  it('tarkib matni: yo\'l, manba, rad sabablari, xatolar', () => {
    const m = tarkibMatni({ sarlavha: 'PAKET', qatorlar: [{ yol: 'a/b.xlsx', n: TOPLAM[0], manba: 'disk' }], rad: [{ nomzod: TOPLAM[2], sabab: 'taxminiy' }], xatolar: ['xato 1'], olinmaydi: [TOPLAM[6]] });
    expect(m).toContain('a/b.xlsx  [Diskdan v2; tasdiqlangan]');
    expect(m).toContain('taxminiy qoralama');
    expect(m).toContain('xato 1');
    expect(m).toContain('Olinmadi');
  });
});

async function kichikXlsx(nom: string, qiymat: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(nom);
  ws.getCell('A1').value = qiymat; ws.mergeCells('A1:C1'); ws.getColumn(1).width = 33; ws.getCell('A2').value = { formula: 'SUM(1,2)', result: 3 };
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

describe('yig\'ish, ZIP va Excel', () => {
  const diskdagi = TOPLAM[0]; const yasaladigan = TOPLAM[1]; const buzuq = TOPLAM[4];
  const reja = { diskdan: [diskdagi], yasash: [yasaladigan, buzuq] };
  const d: Yetkazuvchi = {
    diskdan: async () => ({ bytes: await kichikXlsx('F2', 'disk'), faylNomi: 'F-2 №1.xlsx' }),
    yasa: async (n) => { if (n.kalit === buzuq.kalit) throw new Error('hujjat yasalmadi'); return { bytes: await kichikXlsx('F2', 'yasaldi'), faylNomi: 'F-2 №2.xlsx' }; },
  };
  it('xato butun paketni to\'xtatmaydi; jarayon hisoblagichi; Disk avval', async () => {
    const jarayon: number[] = [];
    const y = await paketYigish(reja, d, { tayyor: (b) => jarayon.push(b) });
    expect(y.fayllar.map((f) => `${f.n.kalit}:${f.manba}`)).toEqual(['f2:1:disk', 'f2:2:yasaldi']);
    expect(y.xatolar).toHaveLength(1);
    expect(y.xatolar[0]).toContain('hujjat yasalmadi');
    expect(jarayon.sort()).toEqual([1, 2, 3]);
  });
  it('ZIP: papkalar ierarxiyasi + Tarkib txt', async () => {
    const y = await paketYigish(reja, d);
    const z = paketZipi(y, { sarlavha: 'PAKET' });
    const m = unzipSync(z.bytes);
    const nomlar = Object.keys(m);
    expect(nomlar).toContain('Loyiha A/Shartnoma №12/Obyekt 1/2031-03/F-2/F-2 №1.xlsx');
    expect(nomlar).toContain('Loyiha A/Shartnoma №12/Obyekt 2/2031-03/F-2/F-2 №2.xlsx');
    const tarkib = nomlar.find((x) => x.endsWith('.txt'))!;
    expect(strFromU8(m[tarkib])).toContain('Diskdan v2');
    expect(strFromU8(m[tarkib])).toContain('hujjat yasalmadi');
    // bir xil kirish = bir xil baytlar (barqaror ZIP)
    expect(Buffer.from(paketZipi(y, { sarlavha: 'PAKET' }).bytes).equals(Buffer.from(z.bytes))).toBe(true);
  });
  it('Excel: Tarkib varag\'i + har hujjat varag\'i; birlashgan katak, kenglik va formula ko\'chadi', async () => {
    const y = await paketYigish({ diskdan: [diskdagi], yasash: [yasaladigan] }, d);
    const { bytes, otkazilgan } = await paketExcel(y, { sarlavha: 'PAKET' });
    expect(otkazilgan).toEqual([]);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Tarkib', 'F-2 Obyekt 1 2031-03', 'F-2 Obyekt 2 2031-03']);
    const w = wb.getWorksheet('F-2 Obyekt 2 2031-03')!;
    expect(w.getCell('A1').value).toBe('yasaldi');
    expect(w.getColumn(1).width).toBe(33);
    expect(w.model.merges).toEqual(['A1:C1']);
    expect((w.getCell('A2').value as { formula: string }).formula).toBe('SUM(1,2)');
    expect(wb.getWorksheet('Tarkib')!.getCell('A3').value).toBe('F-2 №' + (TOPLAM[0].akt_id));
  });
  it('xlsx bo\'lmagan fayl Excelga qo\'shilmaydi, ro\'yxatga yoziladi; varaq nomi 31 belgi va takrorsiz', async () => {
    const y = { fayllar: [{ n: TOPLAM[0], bytes: new Uint8Array([1, 2]), faylNomi: 'x.pdf', manba: 'disk' as const }], xatolar: [] };
    expect((await paketExcel(y, { sarlavha: 'P' })).otkazilgan).toEqual(['x.pdf: Excel emas']);
    const band = new Set<string>();
    const a = varaqNomi('A'.repeat(50), band); const b = varaqNomi('A'.repeat(50), band);
    expect(a.length).toBe(31); expect(b.length).toBe(31); expect(a).not.toBe(b);
    expect(varaqNomi('a/b*c?[d]:e', new Set())).toBe('a b c d e');
  });
});
