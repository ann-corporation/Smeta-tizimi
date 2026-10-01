/**
 * Tender oferta PAKETI — bir tenderda bir nechta obyekt/hujjat (RES fayllari).
 *
 * Qoidalar:
 *   - paketdagi barcha fayllar BIRGA narxlanadi: ayni material (nom + birlik)
 *     hamma obyektda bir xil taklif narxini oladi (panelda bir marta);
 *   - har bir obyekt (fayl) o'z asl faylida, o'z OFERTA_JAMI svodi bilan
 *     eksport qilinadi — yig'indilar faqat o'sha faylning qatorlaridan;
 *   - paket svodi: obyektlar bo'yicha yakuniy oferta va smeta, jami SUM
 *     formulasi bilan (sayt ko'rsatgan son = Excel).
 */
import { zipSync, type Zippable } from 'fflate';
import { RasmiyVaraq, imzoTomonlari, rasmiyKitob, type RasmiyUstun } from './hujjat-yozuvchi';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { ofertaYigish, type OfertaHisoblash, type OfertaPodval, type OfertaQator, type OfertaQatorNatija, type OfertaTransportSiyosati } from './tender-oferta';
import { ofertaTanlanganQatorlari, type OfertaSheetTahlili } from './tender-oferta-parser';

export type OfertaPaketFayl = {
  /** Paket ichida yagona qisqa kalit (sourceId prefiksi). */
  id: string;
  /** Obyekt nomi (sukut: fayl nomi kengaytmasiz) — svod va varaq yorlig'ida. */
  nom: string;
  faylNomi: string;
  tahlillar: OfertaSheetTahlili[];
  tanlanganVaraqlar: string[];
};

const AJRAT = '|';
const VARAQ_AJRAT = ' › ';

const prefiksla = (id: string, sid: string) => `${id}${AJRAT}${sid}`;

/** Paketning barcha tanlangan qatorlari — sourceId fayl bilan prefikslangan,
 * bir nechta fayl bo'lsa varaq nomi oldiga obyekt nomi qo'shiladi. */
export function paketQatorlari(fayllar: readonly OfertaPaketFayl[]): OfertaQator[] {
  const kop = fayllar.length > 1;
  return fayllar.flatMap((f) => ofertaTanlanganQatorlari(f.tahlillar, f.tanlanganVaraqlar).map((q) => ({
    ...q,
    sourceId: prefiksla(f.id, q.sourceId),
    sourceSheet: kop ? `${f.nom}${VARAQ_AJRAT}${q.sourceSheet}` : q.sourceSheet,
    ...(q.jamiBolalari ? { jamiBolalari: q.jamiBolalari.map((b) => prefiksla(f.id, b)) } : {}),
  })));
}

const ajrat = (id: string, sid: string): string | null => (sid.startsWith(`${id}${AJRAT}`) ? sid.slice(id.length + 1) : null);

function podvalAsl(id: string, p: OfertaPodval | undefined): OfertaPodval | undefined {
  if (!p) return p;
  if (p.tur === 'foiz') return { ...p, baza: ajrat(id, p.baza) ?? p.baza };
  if (p.tur === 'yigindi') return { ...p, bazalar: p.bazalar.map((b) => ajrat(id, b) ?? b) };
  return p;
}

/** Paket hisobidan bitta faylning hisobi: qatorlar asl sourceId/varaq nomiga
 * qaytariladi (eksport asl faylni patch qiladi), yig'indilar faqat shu fayldan. */
export function paketFaylHisobi(hisob: OfertaHisoblash, fayl: OfertaPaketFayl, kopFayl: boolean, nk: NakrutkaKoeffitsientlar, transport: OfertaTransportSiyosati): OfertaHisoblash {
  const bosh = `${fayl.nom}${VARAQ_AJRAT}`;
  const qatorlar: OfertaQatorNatija[] = [];
  for (const q of hisob.qatorlar) {
    const sid = ajrat(fayl.id, q.sourceId);
    if (sid == null) continue;
    qatorlar.push({
      ...q,
      sourceId: sid,
      sourceSheet: kopFayl && q.sourceSheet.startsWith(bosh) ? q.sourceSheet.slice(bosh.length) : q.sourceSheet,
      ...(q.jamiBolalari ? { jamiBolalari: q.jamiBolalari.map((b) => ajrat(fayl.id, b) ?? b) } : {}),
      ...(q.podval ? { podval: podvalAsl(fayl.id, q.podval) } : {}),
    });
  }
  return ofertaYigish(qatorlar, nk, transport);
}

// ───────────────────────── paket svodi (XLSX) ─────────────────────────

export type PaketSvodObyekt = { nom: string; faylNomi: string; hisob: OfertaHisoblash };

const SVOD_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Объект (документ)', kenglik: 44, tur: 'matn' },
  { sarlavha: 'Прямые затраты (оферта), сум', kenglik: 20, tur: 'pul' },
  { sarlavha: 'оферта подрядчика', kenglik: 20, tur: 'pul', guruh: 'ВСЕГО С НДС, сум' },
  { sarlavha: 'по смете', kenglik: 20, tur: 'pul', guruh: 'ВСЕГО С НДС, сум' },
  { sarlavha: 'Разница (оферта − смета), сум', kenglik: 20, tur: 'pul' },
  { sarlavha: 'Примечание', kenglik: 36, tur: 'matn' },
];

/** Paket svodi — rasmiy hujjat (hujjat-yozuvchi standarti, H1–H9): obyektlar
 * bo'yicha yakuniy oferta va smeta; ИТОГО — SUM formulasi (sayt = Excel);
 * birorta obyekt yakuniysi noma'lum bo'lsa ИТОГО oferta bo'sh (taxmin yo'q). */
export function paketSvodXlsx(obyektlar: readonly PaketSvodObyekt[], imzo?: { zakazchik?: string; pudratchi?: string }, sarlavha = 'СВОДНЫЙ РАСЧЕТ ОФЕРТЫ ПО ПАКЕТУ'): Uint8Array {
  const v = new RasmiyVaraq({
    nom: 'СВОД ПАКЕТА',
    sarlavha,
    ostSarlavha: [`Объектов в пакете: ${obyektlar.length}`],
    titul: [['Заказчик:', imzo?.zakazchik], ['Подрядчик:', imzo?.pudratchi]],
    ustunlar: SVOD_USTUNLAR,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;
  obyektlar.forEach((o, i) => {
    const h = o.hisob;
    v.qator('oddiy', (r) => [
      i + 1, o.nom, h.togridanJami, h.yakuniyOferta, h.manbaKaskad.vsego,
      { f: `IF(D${r}="","",D${r}-E${r})`, v: h.yakuniyOferta == null ? '' : h.yakuniyOferta - h.manbaKaskad.vsego },
      h.yakuniyOferta == null ? `итог не определен: ${h.halQilinmagan} поз. без цены или категории` : o.faylNomi,
    ]);
  });
  const oxir = bosh + obyektlar.length - 1;
  const hammasi = obyektlar.every((o) => o.hisob.yakuniyOferta != null);
  const jam = (k: (h: OfertaHisoblash) => number | null) => obyektlar.reduce((a, o) => a + (k(o.hisob) ?? 0), 0);
  v.qator('vsego', (r) => [
    null, 'ИТОГО ПО ПАКЕТУ',
    { f: `SUM(C${bosh}:C${oxir})`, v: jam((h) => h.togridanJami) },
    { f: `IF(COUNTBLANK(D${bosh}:D${oxir})>0,"",SUM(D${bosh}:D${oxir}))`, v: hammasi ? jam((h) => h.yakuniyOferta) : '' },
    { f: `SUM(E${bosh}:E${oxir})`, v: jam((h) => h.manbaKaskad.vsego) },
    { f: `IF(D${r}="","",D${r}-E${r})`, v: hammasi ? jam((h) => h.yakuniyOferta) - jam((h) => h.manbaKaskad.vsego) : '' },
    hammasi ? '' : 'итог не определен — есть позиции без цены',
  ]);
  v.diqqat(obyektlar.filter((o) => o.hisob.yakuniyOferta == null).map((o) => ({ nom: o.nom, sabab: `${o.hisob.halQilinmagan} поз. без цены или категории — итог оферты по объекту не определен` })));
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК'], imzo));
  return rasmiyKitob([v], { tur: 'oferta' }).bytes;
}

/** Paket arxivi: har bir obyektning OFERTA fayli + paket svodi. Nomlar
 * takrorlansa raqam qo'shiladi (bir fayl boshqasini yopib qo'ymasin). */
export function paketZip(fayllar: ReadonlyArray<{ nom: string; bytes: Uint8Array }>): Uint8Array {
  const z: Zippable = {};
  for (const f of fayllar) {
    let nom = f.nom;
    for (let i = 2; z[nom]; i++) nom = f.nom.replace(/(\.[^.]+)?$/, (e) => ` (${i})${e}`);
    z[nom] = [f.bytes, { level: 0 }];
  }
  return zipSync(z);
}
