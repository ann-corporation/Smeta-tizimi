/**
 * narx-protokol-hujjat.ts — «ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН» (egasi 2026-10-03).
 *
 * Smetadagi arzon narx o'rniga katalog/hujjat narxi taklif qilinadi; buyurtmachi imzolagach — imzolangan nusxa
 * yuklanadi va kuchga kirish oyidan F2 shu narx bilan to'ldiriladi. Hujjat: smeta narxi, kelishilgan narx,
 * og'ish (tirik formula), asos (manba rekviziti). Ikki tomon imzosi + muhr.
 */
import {
  RANG_TARTIB, RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob,
  type ImzoNomlar, type QatorRangi, type RasmiyUstun,
} from './hujjat-yozuvchi';

export type ProtokolQator = {
  kat: string | null; kod: string | null; nom: string | null; birlik: string | null;
  eski_narx: number | null; yangi_narx: number; izoh: string | null;
};
export type ProtokolOpsiya = { obyektNomi: string; raqam: string; sana: string; imzo?: ImzoNomlar };

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Код', kenglik: 12, tur: 'kod' },
  { sarlavha: 'Наименование ресурса', kenglik: 42, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'Цена в смете', kenglik: 14, tur: 'narx' },
  { sarlavha: 'Согласованная цена', kenglik: 14, tur: 'narx' },
  { sarlavha: 'Отклонение, %', kenglik: 11, tur: 'foiz' },
  { sarlavha: 'Обоснование (документ, поставщик / период)', kenglik: 40, tur: 'matn' },
];

const KAT_TARTIB = ['ЧЕЛ', 'МАШ', 'МАТ', 'М/К', 'КАБ', 'БЕЗ СКЛАД', 'ОБ'];
const KAT_NOMI: Record<string, string> = {
  ЧЕЛ: 'ТРУДОВЫЕ РЕСУРСЫ (ЧЕЛ.-ЧАС)', МАШ: 'МАШИНЫ И МЕХАНИЗМЫ (МАШ.-ЧАС)', МАТ: 'МАТЕРИАЛЫ',
  'М/К': 'МЕТАЛЛОКОНСТРУКЦИИ', КАБ: 'КАБЕЛИ И ПРОВОДА', 'БЕЗ СКЛАД': 'МАТЕРИАЛЫ БЕЗ СКЛАДСКОГО ХРАНЕНИЯ', ОБ: 'ОБОРУДОВАНИЕ',
};
const katKalit = (k: string | null) => { const x = (k ?? '').trim().toUpperCase(); return x === 'БЕЗСКЛАД' ? 'БЕЗ СКЛАД' : x; };
const sanaMatn = (s: string) => s.slice(0, 10).split('-').reverse().join('.');

/** Protokol nomzodi: smeta narxidan QIMMAT manba narxi (egasi: "arzon smeta narxi o'rniga katalog narxi taklif qilinadi"). */
export type ProtokolNomzod = {
  qator_id: number; kat: string | null; kod: string | null; nom: string | null; birlik: string | null;
  smeta_narx: number | null; yangi_narx: number; manba_qator_id: number | null; izoh: string; dalil: boolean;
};
type NomzodManba = {
  qator_id: number; kat: string | null; kod: string | null; nom: string | null; birlik: string | null;
  smeta_narx: number | null; manba_narx: number | null; manba_qator_id?: number | null; izoh: string;
};

/**
 * Bog'langan dalil (operator tanlovi) — ustun; dalili yo'q resursda — tizim tavsiyasi.
 * Faqat manba narxi smeta narxidan katta bo'lganlar; allaqachon faol protokolda turganlar chiqarilmaydi.
 */
export function protokolNomzodlari(dalillar: readonly NomzodManba[], tavsiyalar: readonly NomzodManba[], band: ReadonlySet<number>): ProtokolNomzod[] {
  const m = new Map<number, ProtokolNomzod>();
  const qosh = (x: NomzodManba, dalil: boolean) => {
    if (band.has(x.qator_id) || m.has(x.qator_id)) return;
    const yangi = x.manba_narx == null ? NaN : Number(x.manba_narx);
    const eski = x.smeta_narx == null ? null : Number(x.smeta_narx);
    if (!Number.isFinite(yangi) || yangi <= 0 || eski == null || !(yangi > eski + 1e-9)) return;
    m.set(x.qator_id, { qator_id: x.qator_id, kat: x.kat, kod: x.kod, nom: x.nom, birlik: x.birlik, smeta_narx: eski, yangi_narx: yangi, manba_qator_id: x.manba_qator_id ?? null, izoh: x.izoh, dalil });
  };
  for (const d of dalillar) qosh(d, true);
  for (const t of tavsiyalar) qosh(t, false);
  return [...m.values()].sort((a, b) => (a.kat ?? '').localeCompare(b.kat ?? '') || (a.nom ?? '').localeCompare(b.nom ?? '', 'ru') || a.qator_id - b.qator_id);
}

export function narxProtokolXlsx(qatorlar: readonly ProtokolQator[], o: ProtokolOpsiya): { bytes: Uint8Array; faylNomi: string; soni: number } {
  const v = new RasmiyVaraq({
    nom: 'Протокол цен',
    sarlavha: `ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН № ${o.raqam}`,
    ostSarlavha: [`от ${sanaMatn(o.sana)}`, 'на ресурсы, применяемые при расчетах за выполненные работы (форма № 2)'],
    titul: [['Объект:', o.obyektNomi], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  /* Bir xil resurs (kat | kod | nom | birlik | smeta narxi | yangi narx) — bitta pozitsiya. */
  const bandlar = new Map<string, ProtokolQator & { kat: string }>();
  for (const q of qatorlar) {
    const kat = katKalit(q.kat);
    const k = [kat, (q.kod ?? '').trim(), (q.nom ?? '').trim().toUpperCase(), (q.birlik ?? '').trim().toUpperCase(), q.eski_narx ?? '', q.yangi_narx].join('|');
    if (!bandlar.has(k)) bandlar.set(k, { ...q, kat });
  }
  const hammasi = [...bandlar.values()];
  const katlar = [...KAT_TARTIB, ...new Set(hammasi.map((b) => b.kat).filter((k) => k && !KAT_TARTIB.includes(k)))];
  let no = 0;
  for (const kat of [...katlar, '']) {
    const guruh = hammasi.filter((b) => b.kat === kat).sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'ru') || (a.kod ?? '').localeCompare(b.kod ?? ''));
    if (!guruh.length) continue;
    v.bolim(KAT_NOMI[kat] ?? (kat || 'ПРОЧИЕ РЕСУРСЫ'));
    for (const b of guruh) {
      const eski = b.eski_narx == null ? null : Number(b.eski_narx);
      const yangi = Number(b.yangi_narx);
      v.qator('oddiy', (n) => [
        ++no, b.kod, b.nom, b.birlik, eski, yangi,
        { f: `IF(OR(E${n}="",E${n}=0),"",ROUND((F${n}-E${n})/E${n}*100,2))`, v: eski ? Math.round(((yangi - eski) / eski) * 10000) / 100 : '' },
        b.izoh,
      ], { rang: (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null });
    }
  }
  v.bosh();
  v.izoh(`Всего позиций: ${hammasi.length}. Отклонение = (согласованная цена − цена в смете) / цена в смете × 100.`);
  v.izoh('Протокол вступает в силу после подписания обеими сторонами. Копии документов-оснований цен прилагаются.');
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'narx_protokol' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: `ПРОТОКОЛ_ЦЕН_${o.raqam}`, davr: o.sana.slice(0, 10) }), soni: hammasi.length };
}
