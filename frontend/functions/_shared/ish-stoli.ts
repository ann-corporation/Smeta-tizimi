/**
 * ISH STOLI (ish-joyi + rol) — SERVER-DRIVEN ish maydoni, V1. Veb, Android, Windows va Telegram bir xil javobni chizadi.
 * SOF mantiq (Pages turlarisiz, tarmoqsiz): kirish — a'zolik/ruxsat/modul/aloqa snapshoti, chiqish — kabinetlar + tanlangan kabinet
 * uchun deklarativ bo'limlar va tezkor amallar. Hujjat: docs/architecture/ISH_JOYI_ROL_V1.md.
 *
 * Qoidalar: (1) rol kompaniya turi EMAS — munosabat; kabinet = (kompaniya, tomon). (2) Amal faqat ruxsat bor bo'lsa chiqadi
 * (server tekshirgan; bajarishda RPC o'zi qayta tekshiradi). (3) Klient noma'lum bo'lim turi/manbani o'tkazib yuboradi
 * (oldinga moslik). (4) Bu fayl hech narsa saqlamaydi: yangi jadval yo'q.
 */
export const ISH_STOLI_VERSIYA = 1;

export const TOMONLAR = ['rahbar', 'pto', 'prorab', 'omborchi', 'taminotchi', 'texnadzor', 'subpudratchi', 'buxgalter', 'ishchi'] as const;
export type Tomon = (typeof TOMONLAR)[number];
export const TOMON_NOM: Readonly<Record<Tomon, string>> = {
  rahbar: 'Pudratchi rahbari', pto: 'PTO / smetachi', prorab: 'Prorab / usta (dala)', omborchi: 'Omborchi', taminotchi: 'Ta’minotchi',
  texnadzor: 'Texnadzor / buyurtmachi', subpudratchi: 'Subpudratchi', buxgalter: 'Buxgalter', ishchi: 'Shaxsiy ish joyi',
};

/** Maqsad: klient ochadigan joy. `kod` — Android/Windows modul kodi (native ekran), `yol` — veb sahifa (WebView/brauzer). */
export type Maqsad = { tur: 'native' | 'web'; kod: string; yol?: string };
export type Amal = { id: string; nom: string; ikonka: string; maqsad: Maqsad; birlamchi?: boolean };
export type Bolim = {
  id: string;
  /** amallar (tugmalar to'ri), royxat (manba bo'yicha qatorlar), kpi (manba bo'yicha raqamlar), matn (statik izoh). */
  tur: 'amallar' | 'royxat' | 'kpi' | 'matn';
  nom: string;
  /** Klient o'zi biladigan ma'lumot oqimi (`bugun.ishlar`, `tasdiq.navbat`, `obyektlar.oxirgi`, ...). Noma'lum bo'lsa — `amal` orqali ochiladi. */
  manba?: string;
  guruh?: 'joy';
  amallar?: string[];
  /** «Hammasi» — shu bo'limning to'liq ekrani (Amal.id). */
  amal?: string;
  matn?: string;
  katta?: boolean;
};
export type Kabinet = { id: string; kompaniya_id: number | null; nom: string; tomon: Tomon; tomon_nom: string; manba: 'azolik' | 'aloqa' | 'shaxsiy'; joriy: boolean };
export type IshStoli = {
  ok: true; versiya: number; kabinetlar: Kabinet[]; joriy: string; kompaniya_id: number | null; tomon: Tomon; tomon_nom: string;
  rejim: 'dala' | 'standart';
  dala: { katta_tugma: boolean; oflayn: boolean; ovoz: boolean; foto: boolean } | null;
  amallar: Amal[]; bolimlar: Bolim[]; birlamchi_amal: string | null;
};

type AmalTarif = Amal & { ruxsat: string; modul?: string };
const N = (kod: string): Maqsad => ({ tur: 'native', kod });
const W = (kod: string, yol: string): Maqsad => ({ tur: 'web', kod, yol });

/** Amal katalogi. `ruxsat` — «a|b»: bittasi yetarli; '' — hamma (kompaniyasiz ishchi ham). Yangi amal = bitta yozuv. */
const KATALOG: readonly AmalTarif[] = [
  { id: 'fakt_yoz', nom: 'Fakt yozish', ikonka: 'fakt', ruxsat: 'fakt.write|self.work.write', maqsad: N('fakt') },
  { id: 'foto_dalil', nom: 'Foto dalil', ikonka: 'foto', ruxsat: 'fakt.write|self.work.write', maqsad: N('foto') },
  { id: 'material_sorov', nom: 'Material so‘rovi', ikonka: 'zayavka', ruxsat: 'self.work.write|procurement.write', maqsad: W('zayavka', '/admin/zayavka') },
  { id: 'ombor_kirim', nom: 'Ombor kirim', ikonka: 'ombor', ruxsat: 'warehouse.receive|warehouse.write', modul: 'module.logistika', maqsad: N('ombor') },
  { id: 'ombor_chiqim', nom: 'Ombor chiqim', ikonka: 'ombor', ruxsat: 'warehouse.write', modul: 'module.logistika', maqsad: N('ombor') },
  { id: 'tasdiqlash', nom: 'Tasdiqlash', ikonka: 'tasdiq', ruxsat: 'fakt.write|f2.approve|quality.decide', maqsad: N('tasdiq') },
  { id: 'hujjat_yarat', nom: 'Hujjat yaratish', ikonka: 'hujjat', ruxsat: 'document.write|f2.prepare', modul: 'module.hujjat', maqsad: W('hujjat', '/admin/hujjat-aylanish') },
  { id: 'jarvis', nom: 'Jarvis', ikonka: 'jarvis', ruxsat: 'company.read', maqsad: N('jarvis') },
  { id: 'bugun', nom: 'Bugungi ishlar', ikonka: 'bugun', ruxsat: 'company.read|self.work.read', maqsad: N('bugun') },
  { id: 'obyektlar', nom: 'Obyektlar', ikonka: 'obyektlar', ruxsat: 'smeta.read|object.read', maqsad: N('obyektlar') },
  { id: 'smeta', nom: 'Smeta', ikonka: 'smeta', ruxsat: 'smeta.write', maqsad: W('smeta', '/admin/smeta-studio') },
  { id: 'narx', nom: 'Narxlar', ikonka: 'narx', ruxsat: 'narx.write', maqsad: W('narx', '/admin/narxlar') },
  { id: 'f2_tayyorlash', nom: 'F-2 tayyorlash', ikonka: 'f2', ruxsat: 'f2.prepare', maqsad: W('f2', '/admin/f2-tayyorlash') },
  { id: 'f2_reestr', nom: 'F-2 reestri', ikonka: 'f2reestr', ruxsat: 'f2.read', maqsad: W('f2reestr', '/admin/f2-reestr') },
  { id: 'moliya', nom: 'Moliya', ikonka: 'moliya', ruxsat: 'financial.read|financial.write', modul: 'module.moliya', maqsad: W('moliya', '/admin/moliya') },
  { id: 'hisobot', nom: 'Rahbar paneli', ikonka: 'hisobot', ruxsat: 'control.company.read|financial.write', maqsad: N('rahbar') },
  { id: 'xarid', nom: 'Tender va xarid', ikonka: 'tender', ruxsat: 'procurement.read|supply.offer', modul: 'module.xarid', maqsad: W('tender', '/admin/tender') },
  { id: 'logistika', nom: 'Logistika', ikonka: 'logistika', ruxsat: 'logistics.read|warehouse.read|procurement.read', modul: 'module.logistika', maqsad: W('logistika', '/admin/logistika') },
  { id: 'nazorat', nom: 'Texnik nazorat', ikonka: 'nazorat', ruxsat: 'quality.inspect|quality.read', maqsad: W('nazorat', '/admin/nazorat') },
  { id: 'buyurtmachi_kabinet', nom: 'Buyurtmachi kabineti', ikonka: 'obyektlar', ruxsat: 'company.read', maqsad: W('zakazchik', '/admin/zakazchik') },
  { id: 'subpudrat_ishlari', nom: 'Subpudrat ishlarim', ikonka: 'obyektlar', ruxsat: 'company.read', maqsad: W('subpudrat', '/admin/subpudrat') },
  { id: 'taklif_qoshil', nom: 'Taklif kodi bilan qo‘shilish', ikonka: 'kompaniya', ruxsat: '', maqsad: N('onboarding') },
];
const KAT = new Map(KATALOG.map((a) => [a.id, a]));

/** Tomonga xos «o'rta»: bo'limlar. Tartib = ekrandagi tartib. Amal ID lari KATALOG ga havola (ruxsatsiz amal tushib qoladi). */
type TomonTarif = { rejim: 'dala' | 'standart'; birlamchi: string; bolimlar: readonly Bolim[] };
const MATRITSA: Readonly<Record<Tomon, TomonTarif>> = {
  rahbar: { rejim: 'standart', birlamchi: 'tasdiqlash', bolimlar: [
    { id: 'kpi', tur: 'kpi', nom: 'Bugungi holat', manba: 'moliya.xulosa', amal: 'hisobot' },
    { id: 'tasdiq', tur: 'royxat', nom: 'Tasdiqlash navbati', manba: 'tasdiq.navbat', amal: 'tasdiqlash' },
    { id: 'tez', tur: 'amallar', nom: 'Tezkor amallar', amallar: ['tasdiqlash', 'hujjat_yarat', 'jarvis', 'f2_reestr', 'moliya', 'obyektlar'] },
    { id: 'obyekt', tur: 'royxat', nom: 'Obyektlar', manba: 'obyektlar.oxirgi', amal: 'obyektlar' },
  ] },
  pto: { rejim: 'standart', birlamchi: 'f2_tayyorlash', bolimlar: [
    { id: 'tez', tur: 'amallar', nom: 'Tezkor amallar', amallar: ['f2_tayyorlash', 'fakt_yoz', 'smeta', 'narx', 'hujjat_yarat', 'jarvis'] },
    { id: 'tasdiq', tur: 'royxat', nom: 'Fakt va F-2 navbati', manba: 'tasdiq.navbat', amal: 'tasdiqlash' },
    { id: 'obyekt', tur: 'royxat', nom: 'Obyektlar', manba: 'obyektlar.oxirgi', amal: 'obyektlar' },
    { id: 'hujjat', tur: 'amallar', nom: 'Hujjatlar', amallar: ['f2_reestr', 'hujjat_yarat'] },
  ] },
  prorab: { rejim: 'dala', birlamchi: 'fakt_yoz', bolimlar: [
    { id: 'dala', tur: 'amallar', nom: 'Dalada', katta: true, amallar: ['fakt_yoz', 'foto_dalil', 'material_sorov', 'ombor_chiqim'] },
    { id: 'bugun', tur: 'royxat', nom: 'Bugungi ishlar (joy bo‘yicha)', manba: 'bugun.ishlar', guruh: 'joy', amal: 'bugun' },
    { id: 'tasdiq', tur: 'royxat', nom: 'Tasdiqlash', manba: 'tasdiq.navbat', amal: 'tasdiqlash' },
    { id: 'yana', tur: 'amallar', nom: 'Yana', amallar: ['hujjat_yarat', 'jarvis', 'obyektlar'] },
  ] },
  omborchi: { rejim: 'dala', birlamchi: 'ombor_kirim', bolimlar: [
    { id: 'dala', tur: 'amallar', nom: 'Omborda', katta: true, amallar: ['ombor_kirim', 'ombor_chiqim', 'material_sorov', 'foto_dalil'] },
    { id: 'qoldiq', tur: 'kpi', nom: 'Qoldiq', manba: 'ombor.qoldiq', amal: 'ombor_kirim' },
    { id: 'bugun', tur: 'royxat', nom: 'Bugungi topshiriqlar', manba: 'bugun.ishlar', amal: 'bugun' },
    { id: 'yana', tur: 'amallar', nom: 'Yana', amallar: ['logistika', 'jarvis'] },
  ] },
  taminotchi: { rejim: 'standart', birlamchi: 'material_sorov', bolimlar: [
    { id: 'tez', tur: 'amallar', nom: 'Tezkor amallar', amallar: ['material_sorov', 'xarid', 'logistika', 'ombor_kirim', 'jarvis'] },
    { id: 'zayavka', tur: 'royxat', nom: 'Ochiq zayavkalar', manba: 'zayavka.ochiq', amal: 'material_sorov' },
    { id: 'hujjat', tur: 'amallar', nom: 'Hujjatlar', amallar: ['hujjat_yarat'] },
  ] },
  texnadzor: { rejim: 'standart', birlamchi: 'tasdiqlash', bolimlar: [
    { id: 'tasdiq', tur: 'royxat', nom: 'Tasdiqlashim kerak', manba: 'tasdiq.navbat', amal: 'tasdiqlash' },
    { id: 'tez', tur: 'amallar', nom: 'Nazorat', amallar: ['tasdiqlash', 'nazorat', 'buyurtmachi_kabinet', 'foto_dalil', 'f2_reestr', 'jarvis'] },
    { id: 'obyekt', tur: 'royxat', nom: 'Obyektlar', manba: 'obyektlar.oxirgi', amal: 'obyektlar' },
  ] },
  subpudratchi: { rejim: 'dala', birlamchi: 'fakt_yoz', bolimlar: [
    { id: 'dala', tur: 'amallar', nom: 'Dalada', katta: true, amallar: ['fakt_yoz', 'foto_dalil', 'material_sorov', 'hujjat_yarat'] },
    { id: 'sub', tur: 'royxat', nom: 'Bosh pudratchidan ishlar', manba: 'bugun.ishlar', guruh: 'joy', amal: 'subpudrat_ishlari' },
    { id: 'yana', tur: 'amallar', nom: 'Yana', amallar: ['subpudrat_ishlari', 'jarvis'] },
  ] },
  buxgalter: { rejim: 'standart', birlamchi: 'moliya', bolimlar: [
    { id: 'kpi', tur: 'kpi', nom: 'Moliya xulosasi', manba: 'moliya.xulosa', amal: 'moliya' },
    { id: 'tez', tur: 'amallar', nom: 'Tezkor amallar', amallar: ['moliya', 'hujjat_yarat', 'f2_reestr', 'jarvis'] },
    { id: 'tasdiq', tur: 'royxat', nom: 'Tasdiqlash navbati', manba: 'tasdiq.navbat', amal: 'tasdiqlash' },
  ] },
  ishchi: { rejim: 'standart', birlamchi: 'taklif_qoshil', bolimlar: [
    { id: 'boshla', tur: 'matn', nom: 'Boshlash', matn: 'Taklif kodi bilan ish joyiga qo‘shiling yoki shaxsiy ish joyingizda Jarvis bilan ishlang.' },
    { id: 'tez', tur: 'amallar', nom: 'Tezkor amallar', amallar: ['taklif_qoshil', 'jarvis', 'bugun'] },
  ] },
};

/** A'zolik roli (t2_azolik.rol) -> tomon. Noma'lum rolda ruxsatlardan taxmin qilinadi. */
export function tomonAniqla(rol: string | null | undefined, ruxsatlar?: readonly string[] | null): Tomon {
  switch (rol) {
    case 'boss': case 'admin': case 'rahbar': case 'superadmin': return 'rahbar';
    case 'pto': case 'loyihachi': return 'pto';
    case 'prorab': case 'usta': case 'brigadir': case 'mexanik': case 'haydovchi': return 'prorab';
    case 'omborchi': return 'omborchi';
    case 'taminotchi': return 'taminotchi';
    case 'buyurtmachi': case 'inspektor': case 'kuzatuvchi': return 'texnadzor';
    case 'pudratchi': return 'subpudratchi';
    case 'bugalter': return 'buxgalter';
    default: {
      const p = ruxsatlar ?? [];
      if (p.includes('f2.prepare') || p.includes('smeta.write')) return 'pto';
      if (p.includes('fakt.write') || p.includes('self.work.write')) return 'prorab';
      if (p.includes('financial.write')) return 'buxgalter';
      return 'ishchi';
    }
  }
}
/** Aloqa roli (t2_tomon_aloqa.men_rol, xom matn yoki t2_yonalish kaliti) -> kabinet tomoni; boshqa rollar kabinet ochmaydi. */
export function aloqaTomoni(menRol: string | null | undefined): Tomon | null {
  switch (menRol) {
    case 'subpudratchi': return 'subpudratchi';
    case 'zakazchik': case 'buyurtmachi': return 'texnadzor';
    case 'taminotchi': case 'yetkazuvchi': return 'taminotchi';
    default: return null; // pudratchi/bosh_pudratchi — ichki kabinet a'zolikdan chiqadi
  }
}

const bittasi = (list: ReadonlySet<string>, talab: string): boolean => talab === '' || talab.split('|').some((p) => list.has(p));

export type IshJoyiQator = { kompaniya_id: number; nom: string; turi?: string; rol?: string };
export type AloqaQator = { holat?: string; men_rol?: string; qarshi_nom?: string };
export type IshStoliKirish = {
  ishJoylari: readonly IshJoyiQator[];
  ruxsatlar?: Readonly<Record<number, readonly string[]>>;
  modullarOff?: Readonly<Record<number, readonly string[]>>;
  aloqalar?: Readonly<Record<number, readonly AloqaQator[]>>;
  superadmin?: boolean;
  /** `kompaniya:tomon` yoki faqat kompaniya_id (tanlangan kompaniyaning birinchi kabineti). */
  kabinet?: string | null;
  kompaniyaId?: number | null;
};

export function kabinetlarQur(k: IshStoliKirish): Omit<Kabinet, 'joriy'>[] {
  const out: Omit<Kabinet, 'joriy'>[] = [];
  const bor = new Set<string>();
  const qosh = (c: Omit<Kabinet, 'joriy'>) => { if (!bor.has(c.id)) { bor.add(c.id); out.push(c); } };
  for (const j of k.ishJoylari) {
    const shaxsiy = j.turi === 'shaxsiy';
    const t = shaxsiy ? 'ishchi' : tomonAniqla(j.rol, k.ruxsatlar?.[j.kompaniya_id]);
    // Shaxsiy ish joyida ham a'zolik roli (egasi) ishlaydi: to'liq funksiya (kompaniyasiz ishchi ham to'liq ishlaydi).
    const tomon: Tomon = shaxsiy && j.rol ? tomonAniqla(j.rol, k.ruxsatlar?.[j.kompaniya_id]) : t;
    qosh({ id: `${j.kompaniya_id}:${tomon}`, kompaniya_id: j.kompaniya_id, nom: j.nom, tomon, tomon_nom: TOMON_NOM[tomon], manba: shaxsiy ? 'shaxsiy' : 'azolik' });
    for (const a of k.aloqalar?.[j.kompaniya_id] ?? []) {
      if (a.holat !== 'faol') continue;
      const at = aloqaTomoni(a.men_rol);
      if (!at) continue;
      qosh({ id: `${j.kompaniya_id}:${at}`, kompaniya_id: j.kompaniya_id, nom: j.nom, tomon: at, tomon_nom: TOMON_NOM[at], manba: 'aloqa' });
    }
  }
  if (!out.length) out.push({ id: '0:ishchi', kompaniya_id: null, nom: 'Shaxsiy', tomon: 'ishchi', tomon_nom: TOMON_NOM.ishchi, manba: 'shaxsiy' });
  return out;
}

/** Kabinet tanlovi: aniq `kompaniya:tomon` -> shu; faqat kompaniya -> uning birinchi kabineti; aks holda birinchisi. */
export function kabinetTanla(list: readonly Omit<Kabinet, 'joriy'>[], kabinet?: string | null, kompaniyaId?: number | null): Omit<Kabinet, 'joriy'> {
  return list.find((c) => c.id === kabinet) ?? (kompaniyaId != null ? list.find((c) => c.kompaniya_id === kompaniyaId) : undefined) ?? list[0];
}

export function ishStoliQur(k: IshStoliKirish): IshStoli {
  const list = kabinetlarQur(k);
  const tanlangan = kabinetTanla(list, k.kabinet, k.kompaniyaId);
  const kid = tanlangan.kompaniya_id;
  const ruxsat = new Set(kid == null ? [] : (k.ruxsatlar?.[kid] ?? []));
  const off = new Set(kid == null ? [] : (k.modullarOff?.[kid] ?? []));
  const super_ = !!k.superadmin;
  const mumkin = (a: AmalTarif) => (super_ || bittasi(ruxsat, a.ruxsat)) && !(a.modul && off.has(a.modul));
  const m = MATRITSA[tanlangan.tomon];
  const ochiq = new Map<string, Amal>();
  const ber = (id: string): Amal | null => {
    const t = KAT.get(id);
    if (!t || !mumkin(t)) return null;
    if (!ochiq.has(id)) ochiq.set(id, { id: t.id, nom: t.nom, ikonka: t.ikonka, maqsad: t.maqsad, ...(id === m.birlamchi ? { birlamchi: true } : {}) });
    return ochiq.get(id)!;
  };
  const bolimlar: Bolim[] = [];
  for (const b of m.bolimlar) {
    if (b.tur === 'matn') { bolimlar.push({ ...b }); continue; }
    const amal = b.amal ? ber(b.amal)?.id : undefined;
    if (b.tur === 'amallar') {
      const ids = (b.amallar ?? []).map((i) => ber(i)?.id).filter((x): x is string => !!x);
      if (ids.length) bolimlar.push({ ...b, amallar: ids, amal: undefined });
      continue;
    }
    // royxat/kpi: ma'lumot oqimi o'qish ruxsatini «hammasi» amalidan oladi — amal ruxsatsiz bo'lsa bo'lim ham chiqmaydi.
    if (b.amal && !amal) continue;
    bolimlar.push({ ...b, ...(amal ? { amal } : {}) });
  }
  const birlamchi = ochiq.has(m.birlamchi) ? m.birlamchi : ([...ochiq.keys()][0] ?? null);
  return {
    ok: true, versiya: ISH_STOLI_VERSIYA,
    kabinetlar: list.map((c) => ({ ...c, joriy: c.id === tanlangan.id })),
    joriy: tanlangan.id, kompaniya_id: kid, tomon: tanlangan.tomon, tomon_nom: tanlangan.tomon_nom,
    rejim: m.rejim, dala: m.rejim === 'dala' ? { katta_tugma: true, oflayn: true, ovoz: true, foto: true } : null,
    amallar: [...ochiq.values()], bolimlar, birlamchi_amal: birlamchi,
  };
}
