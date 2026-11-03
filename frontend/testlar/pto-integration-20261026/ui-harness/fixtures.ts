export type HarnessRole = 'pto' | 'bugalter' | 'superadmin';
import { ROLE_PERMISSIONS } from '../../../src/lib/company-authorization/effective-authorization';

const permissionsFor = (role: string) => [...(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? [])]
  .filter(p => role !== 'bugalter' || !/^f2\.(import|prepare|approve|cancel|correct)$/.test(p));

export function session(role: HarnessRole) {
  return {
    ok: true,
    rol: role === 'superadmin' ? 'superadmin' : role,
    platform_role: role === 'superadmin' ? 'superadmin' : 'none',
    email: `sinov-${role}@example.invalid`,
    yozaOladi: true,
    tugaydi: Date.now() + 8 * 60 * 60 * 1000,
    foydalanuvchi_id: 901,
    kompaniyalar: [],
    synthetic: true,
  };
}

export function men(role: HarnessRole) {
  const memberships = [
    { kompaniya_id: 701, nom: 'SINOV — Zarafshon Qurilish', kod: 'QA-ZQ', faol: true,
      membership_role: role === 'superadmin' ? 'boss' : role, effective_role: role === 'superadmin' ? 'boss' : role,
      is_director: role === 'superadmin', permissions: permissionsFor(role === 'superadmin' ? 'boss' : role), turi: 'tashkilot' },
    { kompaniya_id: 702, nom: 'SINOV — Bunyodkor Servis', kod: 'QA-BS', faol: true,
      membership_role: role === 'superadmin' ? 'pto' : role === 'pto' ? 'boss' : role, effective_role: role === 'superadmin' ? 'pto' : role === 'pto' ? 'boss' : role,
      is_director: role === 'pto', permissions: permissionsFor(role === 'pto' ? 'boss' : role === 'superadmin' ? 'pto' : role), turi: 'tashkilot' },
  ];
  return {
    ok: true,
    platform_role: role === 'superadmin' ? 'superadmin' : 'none',
    context_kompaniyalar: memberships,
    foydalanuvchi: { id: 901, login: `sinov-${role}`, ism: 'Sinov foydalanuvchisi', email: `sinov-${role}@example.invalid`, holat: 'faol' },
    azoliklar: memberships.map((m, i) => ({ azolik_id: 900 + i, kompaniya_id: m.kompaniya_id, nom: m.nom,
      kod: m.kod, rol: m.effective_role, is_director: m.is_director, holat: 'faol', faol: true, turi: m.turi })),
    jami: 2, onboarding_kerak: false, synthetic: true,
  };
}

const treeRows = [
  { id: 5101, obyekt_id: 801, obyekt: 'SINOV — 12-maktab korpusi', ota_id: null, daraja: 0, tartib: 1,
    tur: 'rz', kod: '01', nom: 'Umumqurilish ishlari', birlik: null, hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null },
  { id: 5102, obyekt_id: 801, obyekt: 'SINOV — 12-maktab korpusi', ota_id: 5101, daraja: 1, tartib: 2,
    tur: 'bl', kod: '01-001', nom: 'Monolit temirbeton poydevor quyish', birlik: 'm³', hajm: 100, narx: 1250000, summa: 125000000, kat: 'ISH', narx_usul: 'smeta', qoshimcha: false, zamena: false, xom_qator: 101, versiya: 1, norma: null },
  { id: 5103, obyekt_id: 801, obyekt: 'SINOV — 12-maktab korpusi', ota_id: 5102, daraja: 2, tartib: 3,
    tur: 'mat', kod: 'MAT-001', nom: 'Beton B25', birlik: 'm³', hajm: 102, narx: 780000, summa: 79560000, kat: 'МАТ', narx_usul: 'smeta', qoshimcha: false, zamena: false, xom_qator: 102, versiya: 1, norma: 1.02 },
  { id: 5104, obyekt_id: 801, obyekt: 'SINOV — 12-maktab korpusi', ota_id: 5102, daraja: 2, tartib: 4,
    tur: 'rs', kod: 'RES-001', nom: 'Beton nasosi xizmati', birlik: 'soat', hajm: 4, narx: 450000, summa: 1800000, kat: 'МАШ', narx_usul: 'smeta', qoshimcha: false, zamena: false, xom_qator: 103, versiya: 1, norma: 0.04 },
  { id: 5105, obyekt_id: 801, obyekt: 'SINOV — 12-maktab korpusi', ota_id: 5101, daraja: 1, tartib: 5,
    tur: 'bl', kod: '01-002', nom: 'Armatura karkasini montaj qilish', birlik: 't', hajm: 10, narx: 8200000, summa: 82000000, kat: 'ISH', narx_usul: 'smeta', qoshimcha: false, zamena: false, xom_qator: 104, versiya: 1, norma: null },
  { id: 5106, obyekt_id: 801, obyekt: 'SINOV — 12-maktab korpusi', ota_id: 5105, daraja: 2, tartib: 6,
    tur: 'mat', kod: 'MAT-002', nom: 'Armatura A500C', birlik: 't', hajm: 10.5, narx: 6900000, summa: 72450000, kat: 'МАТ', narx_usul: 'smeta', qoshimcha: false, zamena: false, xom_qator: 105, versiya: 1, norma: 1.05 },
];

const stateRows = [
  { qator_id: 5102, tur: 'bl', kod: '01-001', nom: 'Monolit temirbeton poydevor quyish', birlik: 'm³', kat: 'ISH', smeta_hajm: 100, smeta_summa: 125000000, fakt_hajm: 120, fakt_summa: 150000000, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 100, qoldiq_summa: 125000000, f2_mumkin_hajm: 120, f2_mumkin_summa: 150000000 },
  { qator_id: 5103, tur: 'mat', kod: 'MAT-001', nom: 'Beton B25', birlik: 'm³', kat: 'МАТ', smeta_hajm: 102, smeta_summa: 79560000, fakt_hajm: 122.4, fakt_summa: 95472000, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 102, qoldiq_summa: 79560000, f2_mumkin_hajm: 122.4, f2_mumkin_summa: 95472000 },
  { qator_id: 5104, tur: 'rs', kod: 'RES-001', nom: 'Beton nasosi xizmati', birlik: 'soat', kat: 'МАШ', smeta_hajm: 4, smeta_summa: 1800000, fakt_hajm: 0.6, fakt_summa: 270000, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 4, qoldiq_summa: 1800000, f2_mumkin_hajm: 0.6, f2_mumkin_summa: 270000 },
  { qator_id: 5105, tur: 'bl', kod: '01-002', nom: 'Armatura karkasini montaj qilish', birlik: 't', kat: 'ISH', smeta_hajm: 10, smeta_summa: 82000000, fakt_hajm: 1.8, fakt_summa: 14760000, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 10, qoldiq_summa: 82000000, f2_mumkin_hajm: 1.8, f2_mumkin_summa: 14760000 },
  { qator_id: 5106, tur: 'mat', kod: 'MAT-002', nom: 'Armatura A500C', birlik: 't', kat: 'МАТ', smeta_hajm: 10.5, smeta_summa: 72450000, fakt_hajm: 1.89, fakt_summa: 13041000, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 10.5, qoldiq_summa: 72450000, f2_mumkin_hajm: 1.89, f2_mumkin_summa: 13041000 },
];

export function sizeTreeRows(works: number): unknown[] {
  if (!Number.isInteger(works) || works < 1 || works > 2000) throw new RangeError('works must be an integer from 1 to 2000');
  const sectionId = 1_000_000;
  const rows: Record<string, unknown>[] = [{
    id: sectionId, obyekt_id: 801, obyekt: 'SINOV — Masshtab obyekti', ota_id: null, daraja: 0, tartib: 1,
    tur: 'rz', kod: 'QA-SIZE-SECTION', nom: 'SINOV — Масштаб: раздел', birlik: null, hajm: null, narx: null, summa: null,
    kat: null, narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null,
  }];
  for (let n = 1; n <= works; n++) {
    const suffix = String(n).padStart(4, '0');
    const workId = sectionId + 1 + (n - 1) * 4;
    const makeRow = (offset: number, row: Record<string, unknown>) => ({
      id: workId + offset, obyekt_id: 801, obyekt: 'SINOV — Masshtab obyekti', daraja: offset ? 2 : 1,
      tartib: 2 + (n - 1) * 4 + offset, qoshimcha: false, zamena: false, versiya: 1,
      ...row,
    });
    rows.push(makeRow(0, { ota_id: sectionId, tur: 'bl', kod: `QA-W-${suffix}`, nom: `SINOV — Масштаб: работа ${suffix}`,
      birlik: 'шт', hajm: 1, narx: 100, summa: 100, kat: 'ISH', narx_usul: 'smeta', xom_qator: 10_000_000 + workId, norma: null }));
    rows.push(makeRow(1, { ota_id: workId, tur: 'mat', kod: `QA-M1-${suffix}`, nom: `SINOV — Масштаб: материал A ${suffix}`,
      birlik: 'кг', hajm: 2, narx: 10, summa: 20, kat: 'МАТ', narx_usul: 'smeta', xom_qator: 20_000_000 + workId, norma: 2 }));
    rows.push(makeRow(2, { ota_id: workId, tur: 'mat', kod: `QA-M2-${suffix}`, nom: `SINOV — Масштаб: материал B ${suffix}`,
      birlik: 'м³', hajm: 3, narx: 20, summa: 60, kat: 'МАТ', narx_usul: 'smeta', xom_qator: 30_000_000 + workId, norma: 3 }));
    rows.push(makeRow(3, { ota_id: workId, tur: 'rs', kod: `QA-EQ-${suffix}`, nom: `SINOV — Масштаб: машина ${suffix}`,
      birlik: 'маш-ч', hajm: 1, narx: 50, summa: 50, kat: 'МАШ', narx_usul: 'smeta', xom_qator: 40_000_000 + workId, norma: 1 }));
  }
  return rows;
}

export function tableRows(table: string, filter = '', sizeWorks: number | null = null): unknown[] | null {
  if (table === 't2_loyiha_royxat') return [{ id: 601, nom: 'SINOV — Maktab qurilishi', kod: 'QA-601', kompaniya_id: 701, holat: 'faol' }];
  if (['t2_smeta_revision', 't2_document_registry', 't2_akt', 't2_akt_qator', 't2_qator_bajarilmadi'].includes(table)) return [];
  if (table === 't2_obyekt') return [{ id: 801, nom: 'SINOV — 12-maktab korpusi', kompaniya_id: 701, loyiha_id: 601, tur: 'qurilish', versiya: 1 }];
  if (table === 't2_obyekt_jami') return [{ id: 801, nom: 'SINOV — 12-maktab korpusi', tur: 'qurilish', kompaniya_id: 701,
    qator_soni: sizeWorks == null ? 6 : 1 + 4 * sizeWorks, razdel: 1, ish: sizeWorks ?? 2, resurs: sizeWorks == null ? 3 : 3 * sizeWorks,
    jami: sizeWorks == null ? 207000000 : 230 * sizeWorks, narxsiz: 0, chel: null, mash: sizeWorks == null ? 1800000 : 50 * sizeWorks, mat: sizeWorks == null ? 152010000 : 80 * sizeWorks,
    ob: null, yangilandi: '2026-10-26T00:00:00.000Z', lat: null, lng: null, versiya: 1, loyiha_id: 601 }];
  if (table === 't2_daraxt') return sizeWorks == null ? treeRows : sizeTreeRows(sizeWorks);
  if (table === 't2_qator_holat') return sizeWorks == null ? stateRows.map(row => ({ ...row, obyekt_id: 801 }))
    : sizeTreeRows(sizeWorks).filter(row => row.tur !== 'rz').map(row => ({
      obyekt_id: 801, qator_id: row.id, tur: row.tur, kod: row.kod, nom: row.nom, birlik: row.birlik, kat: row.kat,
      smeta_hajm: row.hajm, smeta_narx: row.narx, smeta_summa: row.summa,
      fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0,
      qoldiq_hajm: row.hajm, qoldiq_summa: row.summa, f2_mumkin_hajm: 0, f2_mumkin_summa: 0,
    }));
  if (table === 't2_nakrutka_podval_royxat') return [];
  return null;
}

const ZERO_KOEFFITSIENTLAR = {
  ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0,
  ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 0, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0,
  СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 0,
};

const ZERO_JADVAL = { ЧЕЛ: 0, МАШ: 0, МАТ: 0, ОБ: 0, 'М/К': 0, КАБ: 0, БЕЗСКЛАД: 0 };

const ZERO_KASKAD = {
  pryamye: 0, chel: 0, mash: 0, mat: 0, ob: 0, kab: 0, tr_mat: 0, skl_mat: 0, tr_kab: 0,
  itogo1: 0, prochie: 0, itogo2: 0, tr_ob: 0, zag_ob: 0, itogo3: 0, strax: 0, risk: 0,
  itogo4: 0, nds: 0, vsego: 0,
};

export function rpcResult(name: string, payload: Record<string, unknown>, markupMode: 'known' | 'unknown' = 'unknown') {
  if (name === 'obyekt_nakrutka_v1' && markupMode === 'known' && payload.obyekt_id === 801
    && (payload.shartnoma_id == null || Number.isInteger(payload.shartnoma_id))) {
    return { ok: true, natija: { ok: true, obyekt_id: 801, shartnoma_id: payload.shartnoma_id ?? null,
      cats: { chel: 0, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0 },
      koeffitsientlar: ZERO_KOEFFITSIENTLAR, nakrutka: ZERO_KASKAD, jadval: ZERO_JADVAL }, synthetic: true };
  }
  if (name === 'modul_holat_v1') return { ok: true, natija: { ok: true, modullar: [
    { kod: 'module.erp', nom: 'ERP', izoh: null, holat: 'on', manba: 'default', versiya: 0 },
    { kod: 'module.loyiha', nom: 'Loyiha', izoh: null, holat: 'on', manba: 'default', versiya: 0 },
    { kod: 'module.narx', nom: 'Narxlash', izoh: null, holat: 'on', manba: 'default', versiya: 0 },
  ] }, synthetic: true };
  if (name === 'price_control_v1' || name === 'bajarilmadi_royxat_v1') return { ok: true, natija: { ok: true, qatorlar: [] }, synthetic: true };
  return null;
}

export function gasRead(fn: string) {
  if (fn === 'apiF2JobHolat') return { job: null, hozir: '', log: [] };
  return null;
}

