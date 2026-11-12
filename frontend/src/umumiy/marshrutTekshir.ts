/**
 * marshrutTekshir.ts — MENYU HAVOLASI ↔ MARSHRUT MOSLIGI
 * ═══════════════════════════════════════════════════════════════════
 *
 * NIMA UCHUN BOR. 2026-08-17 da foydalanuvchi: «шартномалар табига
 * кирсам кириш менюсига чиқариб ташлаяпди». Sabab sessiya ham, server
 * ham emas edi — menyuda `/admin/shartnoma` (birlikda), marshrutda esa
 * `shartnomalar` (ko'plikda) yozilgan. React Router mos marshrut
 * topmasa `<Route path="*">` ga tushadi, u `/` ga yo'naltiradi — ya'ni
 * KIRISH sahifasiga. Foydalanuvchi buni «tizim meni chiqarib tashladi»
 * deb ko'radi va sababini bilishning imkoni yo'q.
 *
 * Bu turdagi xato eng yomoni: TypeScript ham, `tsc` ham, lint ham uni
 * KO'RMAYDI (ikkalasi ham oddiy matn). Faqat qo'lda bosib ko'rish
 * orqali topiladi — ya'ni foydalanuvchi topadi.
 *
 * ENDI: dev muhitida menyu chizilganda har havola marshrutlar ro'yxati
 * bilan solishtiriladi va mos kelmasa konsolda BALAND ogohlantirish
 * chiqadi. Produksiyada tekshiruv ishlamaydi (`import.meta.env.DEV`) —
 * foydalanuvchiga hech narsa ko'rinmaydi, tezlikka ta'siri yo'q.
 */

/** App.tsx dagi `/admin/*` marshrutlarining YAGONA ro'yxati. */
export const ADMIN_MARSHRUTLARI = [
  'obyektlar', 'holat', 'holat/:id', 'fakt', 'bugun', 'f2', 'f2-tayyorlash', 'f2-tarix', 'smeta-narxlash', 'buxgalteriya',
  'shartnomalar', 'fakturalar', 'sklad', 'narxlar', 'ierarxiya',
  'monitoring', 'sozlamalar', 'fayl-boglash', 'hujjatlar',
  'shaxsiy-smeta', 'supabase', 'tezlik', 'test', 'test/obyektlar', 'test/daraxt', 'test/import', 'test/narxlar', 'test/oqish', 'kadrlar', 'texnika', 'taminot', 'sifat',
  'dashboard', 'pult', 'test/portfel', 'test/crm', 'participants', 'documents', 'hujjat-nazorat',
  'mindmap', 'grafik', 'storage', 'system-control', 'kompaniya',
  'test/smeta', 'test/moliya', 'test/logistika', 'test/zayavka', 'test/aosr', 'test/erp',
  'test/sozlama', 'test/xodimlar', 'test/korzinka',
  /* 2026-10-26: yagona navigatsiya reestridagi (lib/nav/navReestr.ts) qolgan yo'llar — navFiltr.test.ts tekshiradi. */
  'smeta-studio', 'm29', 'aosr', 'narx-dalil', 'nakrutka', 'narx-manbalari', 'oferta', 'loyiha', 'shartnoma-liniya', 'qarzdorlik',
  'crm', 'aloqalar', 'kontragentlar', 'yetkazuvchi', 'subpudratchi', 'subpudrat', 'zakazchik', 'taqdimlar', 'murojaatlar', 'laboratoriya', 'hujjat-aylanish', 'moliya', 'logistika', 'zayavka', 'tender', 'tender-ochiq', 'yuk-birjasi', 'bozor-sorov', 'bozor-kabinet', 'bozor-moderatsiya', 'yuk-chaqirish', 'haydovchi', 'erp', 'f2-reestr',
  'nakopitelniy', 'tizim-sozlama', 'hujjat-dizayn', 'tokenlar', 'ai-agentlar', 'korzinka', 'ish-joylarim',
  'topshiriqlar', 'mutaxassis', 'boshqaruv', 'sayt-xaritasi', 'akkaunt', 'tizim-xaritasi',
  /* 2026-11-03: Uy sotish. */
  'sotuv',
  /* 2026-11-04: HR + KPI. */
  'hr',
  /* 2026-11-05: ish kartasi + narx tekshiruvi. */
  'narx-tekshiruv',
  /* 2026-11-12: naryad (brigada topshirig'i) + lug'at. */
  'naryad',
  /* 2026-11-12: foto-dalil (P2). */
  'foto',
  /* 2026-11-12: Texnik nazorat (texnadzor). */
  'nazorat', 'nazorat/tekshiruv', 'nazorat/jurnal',
  /* 2026-11-11: loyihachi / mualliflik nazorati (chizma reyestri + rol uyi «Bugun»). */
  'chizmalar', 'loyihachi', 'loyiha-smeta', 'solishtiruv',
] as const;

/**
 * Menyu havolalarini marshrutlar bilan solishtiradi.
 * Faqat DEV da chaqiriladi; buzuq havolalar ro'yxatini qaytaradi.
 */
export function menyuTekshir(yollar: string[]): string[] {
  const bor = new Set<string>(ADMIN_MARSHRUTLARI as readonly string[]);
  const buzuq: string[] = [];

  for (const y of yollar) {
    const nisbiy = y.replace(/^\/admin\/?/, '');
    if (!nisbiy) continue;                       // `/admin` — index marshruti
    /* `holat/:id` kabi parametrli marshrutlarni ham hisobga olamiz */
    const mos = bor.has(nisbiy) ||
      [...bor].some((m) => {
        if (!m.includes(':')) return false;
        const naqsh = new RegExp('^' + m.replace(/:[^/]+/g, '[^/]+') + '$');
        return naqsh.test(nisbiy);
      });
    if (!mos) buzuq.push(y);
  }
  return buzuq;
}

/** Dev'da bir marta ishga tushadi va konsolga baland ogohlantirish beradi. */
let _tekshirildi = false;
export function menyuTekshirDev(yollar: string[]): void {
  if (!import.meta.env.DEV || _tekshirildi) return;
  _tekshirildi = true;
  const buzuq = menyuTekshir(yollar);
  if (buzuq.length) {
    console.error(
      '%c⛔ BUZUQ MENYU HAVOLASI — bosilganda KIRISH sahifasiga otib yuboradi!',
      'font-weight:bold;font-size:13px;color:#f43f5e',
      '\n' + buzuq.map((b) => '   ' + b).join('\n') +
      '\n\nSabab: App.tsx da bunday marshrut yo\'q, so\'rov `path="*"` ga tushadi.' +
      '\nTuzatish: AdminShell dagi `yol` ni marshrut nomiga tenglashtiring' +
      '\n(marshrutlar ro\'yxati: src/umumiy/marshrutTekshir.ts).'
    );
  }
}
