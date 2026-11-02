export type TreeNode = {
  id?: number;
  /** Optimistic-lock versiyasi — faqat kanonik (`t2_qator.id`) qatorlarda
   *  bor. `t2_qator_tahrir` shu bilan ziddiyatni aniqlaydi. */
  versiya?: number;
  type: 'rz' | 'bl' | 'rs' | 'mat' | 'ob';
  nom: string;
  varaq: string;
  row: number;
  kat?: string;
  kod?: string;
  birlik?: string;
  smetaHajm: number | null;   // HAJM
  smeta: number | null;       // PUL
  narx: number | null;
  fakt: number | null;
  qoldiq: number | null;
  faktHajm?: number | null;
  qoldiqHajm?: number | null;
  qoldiqSumma?: number | null;
  narx_usul?: string;
  qoshimcha?: boolean;
  zamena?: boolean;
  f2ol: number;
  f2mum: number;
  stFakt?: number | null; stF2?: number | null; stOst?: number | null;
  /** "F2 olish mumkin" PUL qiymati — `f2mum`ning summa juftligi (fakt - f2). */
  stF2Mum?: number | null;
  oylar?: Record<string, { obyom: number; narx: number; narxIsFormula?: boolean; uid?: string; }>;
  isQosh?: boolean;
  isZamena?: boolean;
  /** LRV belgisi (egasi 2026-10-29): `t2_qator.change_type` dan, ota-zanjir bo'yicha meros (lib/lrv-ozgarish). */
  ozgarishGuruh?: 'asl' | 'qoshimcha' | 'zamena';
  /** Qatorning o'z `change_type` qiymati. */
  ozgarishOzi?: 'ADDITIONAL' | 'REPLACEMENT' | null;
  /** LRV Excel'dagi «№ п/п» (rz — yo'q). */
  lrvPoz?: number | null;
  /** Zamena → u almashtirgan asl qator. */
  almashtiradi?: { id: number; poz: number | null; nom: string } | null;
  /** Asl qator → uni almashtirgan zamenalar (bo'sh bo'lmasa — «ALMASHTIRILGAN»). */
  almashtirganlar?: Array<{ id: number; poz: number | null; nom: string }>;
  /** Avvalgi (almashtirilgan) smeta versiyasi qatori — asosiy ro'yxatda emas; qiymat — yangi versiya nomi (bo'sh bo'lishi mumkin). */
  avvalgiVersiya?: string;
  d1?: string; d2?: string; d3?: string;
  children?: TreeNode[];
};

export type PapkaObyekt = {
  obyekt: string;
  folderId: string;
  lokId: string;
  lokName: string;
  svodId: string;
  svodName: string;
  format: string;
  lokSheets: string[];
  svodSheets: string[];
  /* ⚡ 2026-08-16: bularni `apiPapkaSkan` ALLAQACHON qaytaradi, lekin
   * tipda yo'q edi — shuning uchun «Fayl bog'lash» sahifasi qurilmagan
   * va obyektni saytdan sozlab bo'lmasdi (eski GAS panelga qaytish
   * kerak bo'lardi). */
  svodCols?: { nom?: number; bir?: number; narx?: number; blok?: number; qty?: number; summa?: number };
  narxTayyor?: boolean;
  candidates?: Array<{ id: string; name: string }>;
};

export type BossObyekt = {
  nom: string;
  isGroup?: boolean;
  subItems?: BossObyekt[];
  smeta: number; smetaToza: number; fakt: number; f2: number;
  qoldiq: number; progress: number; f2pct: number; leaf: number;
  chel?: number; mash?: number; mat?: number; ob?: number;
  mk?: number; kab?: number; sub?: number;
  tolangan?: number; debitor?: number; avans?: number;
  ishchilarSoni?: number;
  texnikalarSoni?: number;
  zayavkalarKutilmoqda?: number;
  nuqsonlar?: number;
  kechikishKunlari?: number;
};

export type BossJami = {
  smeta: number; smetaToza: number; fakt: number; f2: number;
  qoldiq: number; progress: number; f2pct: number; leaf: number;
  chel: number; mash: number; mat: number; ob: number;
  mk: number; kab: number; sub: number;
  tolangan: number; debitor: number; avans: number;
  jamiIshchilar?: number;
  jamiTexnikalar?: number;
  faolZayavkalar?: number;
  halQilinmaganNuqsonlar?: number;
};

export interface BossData {
  objects: BossObyekt[];
  jami: BossJami;
  oylar: unknown[];
  sana: string;
}

export type Edit = {
  varaq: string;
  row: number;
  fakt?: number;
  f2?: Record<string, { obyom?: number; narx?: number }>;
  oylar?: Record<string, number>;
};

export type BlQosh = {
  obyekt: string;
  varaq: string;
  afterRow: number;
  nom: string;
  kod?: string;
  birlik?: string;
  hajm: number;
  tur?: 'bl' | 'mat' | 'ob';
  zamena?: boolean;
  droppedOnRow?: number;
  f?: number;
  f2Uid?: string;
};

export type RsQosh = {
  obyekt: string;
  varaq: string;
  blRow: number;
  nom: string;
  kod?: string;
  birlik?: string;
  narx?: number;
  norm?: number;
  kat?: string;
  f?: number;
  f2Uid?: string;
};

/* ---------- Shartnoma (80_Shartnoma.js → apiShartnomaOl) ---------- */
export type Shartnoma = {
  no: string;
  nomi: string;
  taraf: string;
  summa: number;
  nds: number;
  jami: number;
  holat: string;
  izoh: string;
  chelCh: number;
};

/* ---------- Sklad (86_Sklad.js → apiSkladQoldiq) ---------- */
export type SkladMaterial = {
  nom: string;
  birlik: string;
  kirim: number;
  chiqim: number;
  qoldiq: number;
};

export type SkladQoldiq = {
  ok: boolean;
  materiallar: SkladMaterial[];
  jami: number;
  xabar?: string;
};

/* ---------- Monitoring (79_WebAPI.js → apiWebApiLog) ---------- */
export type ApiLogYozuv = {
  t: string;    // ISO vaqt
  fn: string;   // funksiya nomi
  h: string;    // 'OK' | 'XATO' | 'AUTH_FAIL' | 'RUXSAT_YOQ'
  ms: number;
};

/* ---------- To'lov (85_Buxgalteriya.js → apiTolovOl) ---------- */
export type Tolov = {
  sana: string;
  shNo: string;
  obyekt: string;
  summa: number;
  tur: string;
  izoh: string;
  row: number;
};

/* ---------- Ф2 импорт (30_Panel.js + 35_F2Moslash.js) ---------- */
export type AktNode = {
  uid: string;
  type: 'rz' | 'bl' | 'rs' | 'mat' | 'ob';
  nom: string;
  kod?: string;
  bir?: string;
  hajm?: number;
  narx?: number;
  summa?: number;
  children?: AktNode[];
};

/** apiF2AvtoMoslash natijasi */
export type F2Moslik = {
  uid: string; varaq: string; row: number;
  kod: string; hajm: number; narx: number; summa: number;
};

export type F2MoslashNatija = {
  mosliklar: F2Moslik[];
  sabablar: Record<string, string>;
  takliflar?: Record<string, any[]>;
  rzDiag: { nom: string; ok: boolean }[];
  stat: {
    moslashti: number; otkazib: number; scopeHit: number; fuzzyHit: number;
    kanonHit: number; birlikBlok: number; zamenaShubha: number;
    yetimUrindi: number; yetimMos: number;
    lokalka: string; lokAuto: boolean; rzMos: number; rzJami: number; ms: number;
  };
};

export type F2JobHolat = {
  job: {
    status?: string; obyekt?: string; oyNom?: string;
    done?: number; total?: number; boshlandi?: number;
    /* ⚡ 2026-08-16: server har qadamda yangilaydi — qotib qolganini
     * aniqlash uchun (F2NavbatChip). */
    yangilandi?: number;
    qotdi?: number;
    zaharli?: number[]; xabar?: string;
  } | null;
  hozir?: string;
  log?: string[];
};

/* ---------- Narxlar markazi (30_Panel.js → apiNarxlarOl) ---------- */
export type NarxQator = {
  nom: string;
  birlik: string;
  kat: string;              // ЧЕЛ | МАШ | МАТ | ОБ | КАБ | М/К
  belgilangan: number | '';  // qo'lda belgilangan narx
  max: number;               // smetadagi eng katta narx
  smeta: Record<string, number>;   // obyekt → narx
  sanaLar: Record<string, number>; // sana → narx
  maxSana: number;
  natija: number;            // yakuniy ishlatiladigan narx
  manba: string;             // narx qayerdan olingan
  xavf: boolean;             // narxlar orasida >5% farq
};

export type NarxlarJavob = {
  rows: NarxQator[];
  objects: string[];
  sanalar: string[];
};

/* ---------- Ierarxiya / РАЗДЕЛЛАР reestri ---------- */
export type DarajaQator = {
  smeta: string;
  rzNom: string;
  d1: string; d2: string; d3: string;
  d4?: string; d5?: string;
};

/** apiF2FaylOqi ustun-tahlil rejimi (colConfig=null bo'lganda) */
export type F2UstunConfig = {
  ok: boolean;
  mode?: 'config';
  hasMarker?: boolean;
  cols?: { kod: number; nom: number; bir: number; norma: number; obyom: number; narx: number; sum: number };
  maxCol?: number;
  hdrQator?: number;
  preview?: { r: number; cells: string[]; mk: string }[];
  tree?: AktNode[];
  xabar?: string;
};

export type F2Varaq = { nom: string; qatorlar: number; ustunlar: number };

/* ---------- Buxgalteriya (85_Buxgalteriya.js) ---------- */
export type BuxQator = {
  no: string; nomi: string; taraf: string;
  dog_summa: number; bajarilgan: number; tolangan: number;
  debitor: number; avans: number;
  bajarilgan_pct: number; tolangan_pct: number; holat: string;
};
export type BuxDashboard = {
  qatorlar: BuxQator[];
  jami: { dog: number; bajarilgan: number; tolangan: number; debitor: number; avans: number };
  kassaQoldiq: number;
  jamiXarajat: number;
  jamiKreditor?: number; // Bizning qarzimiz (Postavshik + Ishchi) — GAS'da hali manba yo'q, undefined bo'lishi mumkin
  jamiDebitor: number;  // Bizning haqimiz
};
export type Xarajat = { row: number; sana: string; toifa: string; summa: number; izoh: string; manba?: 'Kadrlar' | 'Taminot' | 'Texnika' | 'Boshqa' };

/* ---------- Kadrlar va Tabel (ERP HR) ---------- */
export type Ishchi = {
  id: string;
  ism: string;
  kasb: string;
  stavka: number;    // kunlik ish haqi stavkasi
  brigada: string;
  obyekt: string;
  telefon?: string;
  status?: 'faol' | 'bo\'shatilgan';
};

export type TabelKuni = 'keldi' | 'kelmadi' | 'kasal' | 'otgul' | null;

export type TabelRecord = {
  ishchiId: string;
  sana: string;     // YYYY-MM-DD
  holat: TabelKuni;
  soat?: number;    // Necha soat ishlagani (agar soatbay bo'lsa)
  izoh?: string;
};

// Bir ishchi uchun oylik tabel matritsasi (apiKadrlarDashboard qaytaradigan haqiqiy shakl)
export type TabelOylik = {
  ishchiId: string;
  oy: string; // YYYY-MM
  kunlar: { sana: number; holat: TabelKuni }[];
  ishlaganKunlar: number;
  xisoblanganOylik: number;
};

export type KadrlarDashboard = {
  ishchilar: Ishchi[];
  tabellar: TabelOylik[];
  jamiFaolIshchilar: number;
  bugungiDavomat: number; // foizda (masalan, 95%)
  oylikFond: number;      // joriy oyda kutilayotgan xarajat
  berilganAvanslar: number;
};

/* ---------- Texnika va Yoqilg'i (ERP Machinery) ---------- */
export type TexnikaType = 'Ekskavator' | 'Kran' | 'Samosval' | 'Buldozer' | 'Boshqa';
export type TexnikaHolat = 'Ishlayapti' | 'Remontda' | 'Kutishda' | 'Ijara';

export type Texnika = {
  id: string;
  nom: string;
  davlatRaqami: string;
  turi: TexnikaType;
  holat: TexnikaHolat;
  obyekt: string;
  haydovchi: string; // F.I.O.
  yoqilgiQoldiq: number; // Litrda
  soatlikNorma?: number; // Motochasiga necha litr
};

export type YoqilgiRecord = {
  id: string;
  texnikaId: string;
  sana: string;
  kirimLitr?: number;
  chiqimLitr?: number;
  motochas: number;
  izoh: string;
};

export type TexnikaDashboard = {
  texnikalar: Texnika[];
  tarix: YoqilgiRecord[];
  jamiTexnika: number;
  faolTexnika: number;
  remontda: number;
  oylikYoqilgi: number; // Joriy oyda qancha litr sarflandi
};

/* ---------- Ta'minot, Ombor (Sklad) va Zayavkalar (ERP Supply) ---------- */
export type ZayavkaStatus = 'Obyektdan so\'rov' | 'Omborda tekshirilmoqda' | 'Ombordan berildi' | 'Bozorda' | 'Yuborildi' | 'Qabul qilindi' | 'Rad etildi';

export type Zayavka = {
  id: string;
  sana: string;
  obyekt: string;
  prorab: string;
  material: string;
  birlik: string;
  miqdor: number;
  status: ZayavkaStatus;
  izoh?: string;
};

export type Material = {
  id: string;
  guruh: 'Asosiy' | 'Yordamchi' | 'Mexanizm' | 'Boshqa';
  nom: string;
  birlik: string;
  obyekt: string; // Qaysi omborda (yoki Markaziy)
  qoldiq: number;
  minQoldiq: number; // Kritik chegara (shu miqdordan tushsa ogohlantirish beradi)
  smetaNarxi: number;
  faktNarxi: number;  // Haqiqiy olingan narxi
};

export type Postavshik = {
  id: string;
  nom: string;
  telefon: string;
  yetkazilganSumma: number;
  qarzimiz: number; // Agar to'liq to'lanmagan bo'lsa
};

export type TaminotDashboard = {
  zayavkalar: Zayavka[];
  materiallar: Material[];
  postavshiklar: Postavshik[];
  yangiZayavkalarSoni: number;
  kritikMateriallarSoni: number;
  jamiQarzimiz: number;
  smetaNarxidanOshganlar: number; // Smetadan qimmatga olingan materiallar soni
};

/* ---------- Sifat Nazorati (Texnadzor) ---------- */
export type NuqsonStatus = 'Yangi' | 'Jarayonda' | 'Tuzatildi' | 'Muddati o\'tgan';
export type MuhimlikDarajasi = 'Oddiy' | 'O\'rta' | 'Kritik';

export type Nuqson = {
  id: string;
  obyekt: string;
  prorab: string;
  sana: string;
  muddat: string;
  tavsif: string;
  daraja: MuhimlikDarajasi;
  status: NuqsonStatus;
  rasmUrl?: string;
  izoh?: string;
};

export type SifatDashboard = {
  nuqsonlar: Nuqson[];
  jamiNuqsonlar: number;
  tuzatilganlar: number;
  muddatOtilgan: number;
  kritik: number;
};

/* ---------- Navbat / Dvigatel ishga tushirish (50_Navbat.js) ---------- */
export type NavbatLogYozuv = {
  ob: string;
  ok: boolean;
  qisman?: boolean;
  xabar?: string;
  vaqt?: string;
};

export type NavbatHolat = {
  running: boolean;
  qolgan: number;
  bajarilgan: number;
  jami: number;
  foiz: number;
  hozir: string;
  log: NavbatLogYozuv[];
  navbat: string[];
};

export type NavbatBoshlash = { ok: boolean; xabar?: string };

/* ---------- Sozlamalar (30_Panel.js) ---------- */
export type TizimSozlama = {
  rootId: string;
  serverId: string;
  dataQator: number | string;
  narxMantiq: string;
};

/** Накрутка koeffitsienti (80_Shartnoma.js → apiNakrutkaOl) */
export type NakrutkaKoef = {
  koef: string;
  qiymat: number;
  def: number;
  override: boolean;
  izoh: string;
};

export type Stavka = { chel: number };
export type HolatJami = {
  stSm?: number; stFk?: number; stF2?: number;
  chel?: number; mash?: number; mat?: number; ob?: number;
  mk?: number; kab?: number; bez?: number;
};
