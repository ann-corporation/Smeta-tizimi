/**
 * sozlamaReestr.ts — tizimdagi BARCHA sozlamalarning yagona reestri (sof ma'lumot, React'siz).
 * Uch qatlam: akkaunt (shaxsiy), kompaniya (admin panel), tizim (platforma, faqat superadmin).
 * Har yozuv — sozlama qayerda o'zgartirilishi (`yol`) va qiymat qayerda saqlanishi (`saqlash`).
 * Yangi sozlama qo'shilsa — shu yerga ham yoziladi (test `yol` marshrutini App.tsx bilan solishtiradi).
 * Tizimga oid (egasi 2026-10-27): `faqatSuperadmin: true` YOKI `yol` navReestr.faqatSuperadminYolmi bo'yicha tizim yo'li —
 * faqat platforma superadmini ko'radi (menyu va marshrut qo'riqchisi bilan bitta manba).
 */
import { faqatSuperadminYolmi } from '../nav/navReestr';

export type SozlamaQatlam = 'akkaunt' | 'kompaniya' | 'tizim';
export type Mavqe = 'zakazchik' | 'pudratchi' | 'loyihachi';

export type Sozlama = {
  id: string;
  nom: string;
  izoh: string;
  qatlam: SozlamaQatlam;
  bolim: string;
  /** O'zgartiriladigan joyga havola (so'rov satri bilan). */
  yol: string;
  /** 'brauzer' — qiymat faqat shu brauzerda (localStorage). */
  saqlash: 'server' | 'brauzer';
  /** Imkoniyat (permission) ro'yxati; [] — hamma. `'a+b'` — ikkalasi ham kerak. Ro'yxatdagi birortasi mos kelsa yetarli. */
  ruxsat: readonly string[];
  /** Qaysi kompaniya turlariga tegishli; yo'q — hammasiga. */
  mavqe?: readonly Mavqe[];
  faqatSuperadmin?: boolean;
};

export const QATLAMLAR: readonly SozlamaQatlam[] = ['akkaunt', 'kompaniya', 'tizim'];

export const SOZLAMALAR: readonly Sozlama[] = [
  { id: 'akkaunt.ism', nom: 'Ism', izoh: 'Hisobdagi ism — hujjat va jamoada shu ko‘rinadi.', qatlam: 'akkaunt', bolim: 'Profil va til', yol: '/admin/akkaunt?bolim=profil', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.telefon', nom: 'Telefon', izoh: 'Aloqa telefon raqami.', qatlam: 'akkaunt', bolim: 'Profil va til', yol: '/admin/akkaunt?bolim=profil', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.avatar_rang', nom: 'Avatar rangi', izoh: 'Profil belgisining rangi.', qatlam: 'akkaunt', bolim: 'Profil va til', yol: '/admin/akkaunt?bolim=profil', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.til', nom: 'Interfeys tili', izoh: 'O‘zbek (lotin/kirill), rus yoki ingliz.', qatlam: 'akkaunt', bolim: 'Profil va til', yol: '/admin/akkaunt?bolim=profil', saqlash: 'brauzer', ruxsat: [] },
  { id: 'akkaunt.parol', nom: 'Parol', izoh: 'Parolni o‘rnatish yoki almashtirish.', qatlam: 'akkaunt', bolim: 'Kirish va xavfsizlik', yol: '/admin/akkaunt?bolim=xavfsizlik', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.google', nom: 'Google bilan kirish', izoh: 'Google hisobini ulash yoki uzish.', qatlam: 'akkaunt', bolim: 'Kirish va xavfsizlik', yol: '/admin/akkaunt?bolim=kirish', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.email_kod', nom: 'Email kod bilan kirish', izoh: 'Emailga kelgan bir martalik kod orqali kirish.', qatlam: 'akkaunt', bolim: 'Kirish va xavfsizlik', yol: '/admin/akkaunt?bolim=kirish', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.sessiya', nom: 'Sessiya', izoh: 'Joriy sessiya muddati va xavfsizlik holati.', qatlam: 'akkaunt', bolim: 'Kirish va xavfsizlik', yol: '/admin/akkaunt?bolim=xavfsizlik', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.kompaniyalarim', nom: 'Kompaniyalarim va rollarim', izoh: 'Qaysi kompaniyada qanday rolingiz borligi, ish joyini almashtirish.', qatlam: 'akkaunt', bolim: 'Ish joylari va rollar', yol: '/admin/akkaunt?bolim=kompaniyalar', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.ish_joylarim', nom: 'Ish joylarim', izoh: 'Shaxsiy yoki tashkilot ish joyi yaratish, taklifga qo‘shilish.', qatlam: 'akkaunt', bolim: 'Ish joylari va rollar', yol: '/admin/ish-joylarim', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.mutaxassis', nom: 'Mening xizmatlarim (mutaxassis profili)', izoh: 'Kasb, hudud, tajriba va kompaniyalarga xizmat takliflari.', qatlam: 'akkaunt', bolim: 'Ish joylari va rollar', yol: '/admin/mutaxassis', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.bildirishnoma', nom: 'Bildirishnomalar', izoh: 'Topshiriqlar va xabarlar qutisi; Telegram/Email kanallari hali ulanmagan.', qatlam: 'akkaunt', bolim: 'Bildirishnomalar', yol: '/admin/akkaunt?bolim=bildirishnoma', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.mavzu', nom: 'Mavzu', izoh: 'Yorug‘, qorong‘i yoki tizim mavzusi.', qatlam: 'akkaunt', bolim: 'Ko‘rinish', yol: '/admin/akkaunt?bolim=korinish', saqlash: 'brauzer', ruxsat: [] },
  { id: 'akkaunt.zichlik', nom: 'Zichlik', izoh: 'Qulay yoki ixcham boshqaruv o‘lchamlari.', qatlam: 'akkaunt', bolim: 'Ko‘rinish', yol: '/admin/akkaunt?bolim=korinish', saqlash: 'brauzer', ruxsat: [] },
  { id: 'akkaunt.sidebar_mahkam', nom: 'Yon panelni doim ochiq tutish', izoh: 'Yon menyuni mahkamlash.', qatlam: 'akkaunt', bolim: 'Ko‘rinish', yol: '/admin/akkaunt?bolim=korinish', saqlash: 'brauzer', ruxsat: [] },
  { id: 'akkaunt.smeta_daraxt', nom: 'Smeta daraxti ustunlari va zichligi', izoh: 'Ustun preseti (asosiy/F2/narx/to‘liq) va zichlik.', qatlam: 'akkaunt', bolim: 'Ko‘rinish', yol: '/admin/holat', saqlash: 'brauzer', ruxsat: [] },
  { id: 'akkaunt.studio_korinish', nom: 'Smeta Studio ko‘rinishi va hududi', izoh: 'Panellar kengligi, 2/3 panel rejimi va narx hududi.', qatlam: 'akkaunt', bolim: 'Ko‘rinish', yol: '/admin/smeta-studio', saqlash: 'brauzer', ruxsat: [] },
  { id: 'akkaunt.tarif', nom: 'Tarif va hisob', izoh: 'Tarif, token balansi va saqlash holatini ko‘rish.', qatlam: 'akkaunt', bolim: 'Tarif', yol: '/admin/akkaunt?bolim=tarif', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.ai_shaxsiy', nom: 'AI shaxsiy uslubi', izoh: 'AI qachon so‘rasin, javob tili va uslubi (AI yordamchi oynasidagi «Sozlama» tabi).', qatlam: 'akkaunt', bolim: 'AI yordamchi', yol: '/admin/dashboard', saqlash: 'server', ruxsat: [] },
  { id: 'akkaunt.ai_kuzatuv', nom: 'AI kuzatuvi', izoh: 'AI ishingizni kuzatib, o‘zi taklif berishi (standart: o‘chiq).', qatlam: 'akkaunt', bolim: 'AI yordamchi', yol: '/admin/dashboard', saqlash: 'brauzer', ruxsat: [] },
  { id: 'kompaniya.rekvizit', nom: 'Rekvizitlar', izoh: 'To‘liq nom, STIR, manzil, rahbar, bank va hisob raqam — F2/F3/akt sarlavhalariga tushadi.', qatlam: 'kompaniya', bolim: 'Kompaniya profili', yol: '/admin/kompaniya?tab=profil', saqlash: 'server', ruxsat: ['company.profile.update'] },
  { id: 'kompaniya.logo', nom: 'Kompaniya logotipi', izoh: 'Yon menyu va hujjatlarda ko‘rinadigan logotip (PNG/JPEG, 300 KB gacha).', qatlam: 'kompaniya', bolim: 'Kompaniya profili', yol: '/admin/kompaniya?tab=profil', saqlash: 'server', ruxsat: ['company.profile.update'] },
  { id: 'kompaniya.mavqe', nom: 'Kompaniya turi', izoh: 'Buyurtmachi, pudratchi yoki loyihachi — qaysi sozlamalar mosligini belgilaydi.', qatlam: 'kompaniya', bolim: 'Kompaniya profili', yol: '/admin/kompaniya?tab=sozlamalar', saqlash: 'server', ruxsat: ['company.profile.update'] },
  { id: 'kompaniya.azolar', nom: 'A‘zolar', izoh: 'A‘zo qo‘shish, olib tashlash, rolini o‘zgartirish, vaqtinchalik parol.', qatlam: 'kompaniya', bolim: 'A‘zolar va rollar', yol: '/admin/kompaniya?tab=azolar', saqlash: 'server', ruxsat: ['company.member.manage'] },
  { id: 'kompaniya.taklif_havolalari', nom: 'Taklif havolalari', izoh: 'Rol, muddat va odam soni bilan taklif havolasi yaratish.', qatlam: 'kompaniya', bolim: 'A‘zolar va rollar', yol: '/admin/kompaniya?tab=azolar', saqlash: 'server', ruxsat: ['company.member.manage'] },
  { id: 'kompaniya.xizmat_takliflari', nom: 'Xizmat takliflari', izoh: 'Mutaxassislardan kelgan va ularga yuborilgan takliflar.', qatlam: 'kompaniya', bolim: 'A‘zolar va rollar', yol: '/admin/kompaniya?tab=azolar', saqlash: 'server', ruxsat: ['company.member.manage'] },
  { id: 'kompaniya.rollar', nom: 'Rollar va ruxsatlar', izoh: 'Rol-ruxsat jadvali (faqat o‘qish).', qatlam: 'kompaniya', bolim: 'A‘zolar va rollar', yol: '/admin/kompaniya?tab=rollar', saqlash: 'server', ruxsat: ['company.member.manage'] },
  { id: 'kompaniya.azo_ruxsat', nom: 'A‘zoga qo‘shimcha ruxsatlar', izoh: 'Alohida a‘zo uchun rolga qo‘shimcha ruxsat berish.', qatlam: 'kompaniya', bolim: 'A‘zolar va rollar', yol: '/admin/kompaniya?tab=rollar', saqlash: 'server', ruxsat: ['company.member.manage'] },
  { id: 'kompaniya.tomonlar_aloqa', nom: 'Tomonlar aloqasi', izoh: 'Boshqa kompaniya bilan bir martalik kod orqali bog‘lanish va ko‘rish huquqini berish.', qatlam: 'kompaniya', bolim: 'A‘zolar va rollar', yol: '/admin/aloqalar', saqlash: 'server', ruxsat: ['company.member.manage'] },
  { id: 'kompaniya.modullar', nom: 'Modullar', izoh: 'AOSR, narx, loyiha, ERP modullarini yoqish/o‘chirish.', qatlam: 'kompaniya', bolim: 'Modullar va integratsiya', yol: '/admin/kompaniya?tab=modullar', saqlash: 'server', ruxsat: ['control.company.write'] },
  { id: 'kompaniya.loyiha_obyekt', nom: 'Loyiha va obyektlar', izoh: 'Kompaniya loyihalari va obyektlari ro‘yxati.', qatlam: 'kompaniya', bolim: 'Modullar va integratsiya', yol: '/admin/kompaniya?tab=loyiha', saqlash: 'server', ruxsat: ['project.read'] },
  { id: 'kompaniya.integratsiya', nom: 'Integratsiyalar holati', izoh: 'Tashqi integratsiyalar sog‘lig‘i (faqat o‘qish).', qatlam: 'tizim', bolim: 'Modullar va integratsiya', yol: '/admin/kompaniya?tab=integratsiya', saqlash: 'server', ruxsat: ['control.company.read'], faqatSuperadmin: true },
  { id: 'kompaniya.audit', nom: 'Audit jurnali', izoh: 'Kompaniyadagi muhim o‘zgarishlar jurnali.', qatlam: 'kompaniya', bolim: 'Modullar va integratsiya', yol: '/admin/kompaniya?tab=audit', saqlash: 'server', ruxsat: ['control.company.read'] },
  { id: 'kompaniya.tizim_nazorat', nom: 'Texnik imkoniyatlar va nazorat', izoh: 'Kompaniya darajasidagi imkoniyatlar, ishlar va hodisalar.', qatlam: 'tizim', bolim: 'Modullar va integratsiya', yol: '/admin/system-control', saqlash: 'server', ruxsat: ['control.company.read'], faqatSuperadmin: true },
  { id: 'kompaniya.valyuta', nom: 'Asosiy valyuta', izoh: 'UZS yoki USD.', qatlam: 'kompaniya', bolim: 'Umumiy sozlamalar', yol: '/admin/tizim-sozlama', saqlash: 'server', ruxsat: ['company.read'] },
  { id: 'kompaniya.qatiy_nazorat', nom: 'Qat‘iy moliyaviy nazorat', izoh: 'Moliyaviy cheklovlarni qat‘iy qo‘llash.', qatlam: 'kompaniya', bolim: 'Umumiy sozlamalar', yol: '/admin/tizim-sozlama', saqlash: 'server', ruxsat: ['company.read'] },
  { id: 'kompaniya.didox', nom: 'Didox (EHF) kaliti', izoh: 'Elektron hujjat almashinuvi uchun API kaliti.', qatlam: 'kompaniya', bolim: 'Umumiy sozlamalar', yol: '/admin/tizim-sozlama', saqlash: 'server', ruxsat: ['company.read'] },
  { id: 'kompaniya.gas_sinx', nom: 'Google Sheets avto-sinxronizatsiyasi', izoh: 'Eski GAS sinxronizatsiyasini yoqish.', qatlam: 'tizim', bolim: 'Umumiy sozlamalar', yol: '/admin/tizim-sozlama', saqlash: 'server', ruxsat: ['company.read'], faqatSuperadmin: true },
  { id: 'kompaniya.f2_tasdiq_rejimi', nom: 'F2 tasdiq rejimi', izoh: 'Shaxsiy (bir kishi) yoki korporativ (tayyorlovchi, tekshiruvchi va tasdiqlovchi alohida).', qatlam: 'kompaniya', bolim: 'F2 jarayoni', yol: '/admin/kompaniya?tab=sozlamalar', saqlash: 'server', ruxsat: ['company.profile.update'], mavqe: ['pudratchi'] },
  { id: 'kompaniya.hujjat_imzo_tomonlari', nom: 'Hujjat imzochilari', izoh: 'Imzochilar har obyektda (loyiha, obyekt yoki razdel darajasida) alohida: buyurtmachi o‘z odamlarini, pudratchi o‘zinikini tayinlaydi. Hujjat sahifalaridagi «Hujjat imzolari» panelida.', qatlam: 'kompaniya', bolim: 'F2 jarayoni', yol: '/admin/obyektlar', saqlash: 'server', ruxsat: ['company.read'] },
  { id: 'kompaniya.hujjat_dizayni', nom: 'Hujjat dizayni', izoh: 'Excel va ko‘rinishdagi rang mavzusi, hujjat turlari bo‘yicha.', qatlam: 'kompaniya', bolim: 'Hujjatlar', yol: '/admin/kompaniya?tab=sozlamalar', saqlash: 'server', ruxsat: ['company.read'] },
  { id: 'kompaniya.obyekt_ulash', nom: 'Obyektni havola bilan ulashish', izoh: 'Obyekt F2 va xulosasini tashqi tomonga 7 kunlik havola bilan ko‘rsatish.', qatlam: 'kompaniya', bolim: 'Hujjatlar', yol: '/admin/obyektlar', saqlash: 'server', ruxsat: ['object.write'] },
  { id: 'kompaniya.korzinka', nom: 'Korzinka', izoh: 'O‘chirilgan yozuvlarni tiklash.', qatlam: 'kompaniya', bolim: 'Hujjatlar', yol: '/admin/korzinka', saqlash: 'server', ruxsat: ['company.read'] },
  { id: 'kompaniya.fayl_saqlash', nom: 'Fayl saqlash (Storage)', izoh: 'Kompaniya Drive papkasini ulash va loyiha papkalarini yaratish.', qatlam: 'kompaniya', bolim: 'Hujjatlar', yol: '/admin/storage', saqlash: 'server', ruxsat: ['control.company.write'] },
  { id: 'kompaniya.nakrutka', nom: 'Nakrutka koeffitsientlari', izoh: 'Kompaniya, shartnoma va obyekt bo‘yicha ustama.', qatlam: 'kompaniya', bolim: 'Narx va nakrutka', yol: '/admin/nakrutka', saqlash: 'server', ruxsat: ['narx.read'], mavqe: ['pudratchi'] },
  { id: 'kompaniya.podval', nom: 'Podval konstruktori', izoh: 'Nakrutka podvalini qatorma-qator qurish.', qatlam: 'kompaniya', bolim: 'Narx va nakrutka', yol: '/admin/nakrutka', saqlash: 'server', ruxsat: ['narx.read'], mavqe: ['pudratchi'] },
  { id: 'kompaniya.narx_manbalari', nom: 'Narx manbalari', izoh: 'Katalog, faktura va tijoriy takliflar manbalari.', qatlam: 'kompaniya', bolim: 'Narx va nakrutka', yol: '/admin/narx-manbalari', saqlash: 'server', ruxsat: ['narx.read'], mavqe: ['pudratchi'] },
  { id: 'kompaniya.narx_nazorati', nom: 'Narxlar nazorati', izoh: 'Narx chetlanishi, kategoriya va diapazonlar.', qatlam: 'kompaniya', bolim: 'Narx va nakrutka', yol: '/admin/narxlar', saqlash: 'server', ruxsat: ['narx.read'], mavqe: ['pudratchi'] },
  { id: 'kompaniya.ai_yoqish', nom: 'AI yoqish va oylik limit', izoh: 'Kompaniyada AI yoqish, oylik token limiti, a‘zolarni kuzatish ruxsati.', qatlam: 'kompaniya', bolim: 'AI ishchilar', yol: '/admin/ai-agentlar', saqlash: 'server', ruxsat: ['control.company.read'] },
  { id: 'kompaniya.ai_model_siyosati', nom: 'AI model siyosati', izoh: 'A‘zolar AI modelini o‘zi tanlay oladimi yoki qulflanadimi.', qatlam: 'kompaniya', bolim: 'AI ishchilar', yol: '/admin/ai-agentlar', saqlash: 'server', ruxsat: ['control.company.read'] },
  { id: 'kompaniya.ai_modellar', nom: 'AI agent modellari', izoh: 'Har bir kompaniya agenti qaysi modeldan foydalanadi.', qatlam: 'kompaniya', bolim: 'AI ishchilar', yol: '/admin/ai-agentlar', saqlash: 'server', ruxsat: ['control.company.read'] },
  { id: 'kompaniya.ai_bilim', nom: 'Kompaniya bilimi (AI qoidalari)', izoh: 'AI ishchilar foydalanadigan kompaniya qoidalari va atamalari.', qatlam: 'kompaniya', bolim: 'AI ishchilar', yol: '/admin/ai-agentlar', saqlash: 'server', ruxsat: ['control.company.read'] },
  { id: 'kompaniya.tokenlar', nom: 'Tokenlar va obuna', izoh: 'Token balansi, sotib olish va amal narxlari (faqat o‘qish).', qatlam: 'kompaniya', bolim: 'Token va obuna', yol: '/admin/tokenlar', saqlash: 'server', ruxsat: ['company.read'] },
  { id: 'kompaniya.buyurtmachi_kabineti', nom: 'Buyurtmachi kabineti', izoh: 'Pudratchilardan kelgan obyektlar va hujjatlarni ko‘rish.', qatlam: 'kompaniya', bolim: 'Buyurtmachi kabineti', yol: '/admin/zakazchik', saqlash: 'server', ruxsat: ['company.read'], mavqe: ['zakazchik'] },
  { id: 'kompaniya.taqdimlar', nom: 'Taqdimlar', izoh: 'Pudratchi taqdim etgan ishlar va hujjatlar.', qatlam: 'kompaniya', bolim: 'Buyurtmachi kabineti', yol: '/admin/taqdimlar', saqlash: 'server', ruxsat: ['company.read'], mavqe: ['zakazchik'] },
  { id: 'tizim.foydalanuvchilar', nom: 'Foydalanuvchilar', izoh: 'Foydalanuvchini bloklash, a‘zolik va rollarni belgilash.', qatlam: 'tizim', bolim: 'Platforma boshqaruvi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.kompaniyalar_obuna', nom: 'Kompaniyalar va obunalar', izoh: 'Kompaniyalar, tarif biriktirish va balanslar.', qatlam: 'tizim', bolim: 'Platforma boshqaruvi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.tolovlar', nom: 'To‘lov so‘rovlari', izoh: 'Token sotib olish so‘rovlarini tasdiqlash yoki rad etish.', qatlam: 'tizim', bolim: 'Platforma boshqaruvi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.token_hisobi', nom: 'Token hisobi', izoh: 'Token jurnali va qaytarish jarayoni.', qatlam: 'tizim', bolim: 'Platforma boshqaruvi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.audit', nom: 'Platforma auditi', izoh: 'Butun platforma bo‘yicha audit jurnali.', qatlam: 'tizim', bolim: 'Platforma boshqaruvi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.demo_obyekt', nom: 'Demo obyekt', izoh: 'Yangi foydalanuvchilarga nusxalanadigan namuna obyekt.', qatlam: 'tizim', bolim: 'Platforma boshqaruvi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.token_narxi', nom: 'Token narxi va amal narxlari', izoh: 'Token narxi, umumiy foyda foizi va amallar narx jadvali.', qatlam: 'tizim', bolim: 'Narx va tarif', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.tarif_rejalari', nom: 'Tarif rejalari', izoh: 'Tarif kodi, nomi, oylik token va narxi.', qatlam: 'tizim', bolim: 'Narx va tarif', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.royxat_bonusi', nom: 'Ro‘yxatdan o‘tish bonusi', izoh: 'Yangi foydalanuvchiga beriladigan boshlang‘ich tokenlar.', qatlam: 'tizim', bolim: 'Narx va tarif', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.dollar_kursi', nom: 'Dollar kursi', izoh: 'AI xarajatini hisoblash uchun kurs.', qatlam: 'tizim', bolim: 'Narx va tarif', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.tolov_rekvizit', nom: 'To‘lov rekvizitlari', izoh: 'Foydalanuvchilarga ko‘rsatiladigan to‘lov ma‘lumotlari.', qatlam: 'tizim', bolim: 'Narx va tarif', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.kataloglar', nom: 'Kataloglar va narx indeksi', izoh: 'Umumiy platforma katalogi nashri va narx indeksi.', qatlam: 'tizim', bolim: 'Narx va tarif', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.ai_ustama', nom: 'AI ustama foizi', izoh: 'AI xarajatiga standart ustama va kompaniyaga alohida ustama.', qatlam: 'tizim', bolim: 'AI markazi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.ai_modellar', nom: 'AI standart modellari', izoh: 'Tizim agentlari standart modeli va OpenRouter model galereyasi.', qatlam: 'tizim', bolim: 'AI markazi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.ai_limit', nom: 'AI xarajat limiti', izoh: 'Oylik USD limit.', qatlam: 'tizim', bolim: 'AI markazi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.ai_qoidalar', nom: 'AI qoidalari va manbalari', izoh: 'Boshqaruvchi agent, o‘rganish, qoidalar va manbalar.', qatlam: 'tizim', bolim: 'AI markazi', yol: '/admin/boshqaruv', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.funksiya_yoqish', nom: 'Funksiyalarni yoqish va o‘chirish', izoh: 'Imkoniyatni global, loyiha yoki kompaniya bo‘yicha yoqish va avariyada o‘chirish.', qatlam: 'tizim', bolim: 'Nazorat va xizmat', yol: '/admin/system-control', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.ish_nazorati', nom: 'Ishlar va joylashtirish holati', izoh: 'Fon ishlari, hodisalar va deploy holatini boshqarish.', qatlam: 'tizim', bolim: 'Nazorat va xizmat', yol: '/admin/system-control', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.sayt_xaritasi', nom: 'Sayt xaritasi', izoh: 'Sahifa va oqimlar xaritasi (faqat o‘qish).', qatlam: 'tizim', bolim: 'Nazorat va xizmat', yol: '/admin/sayt-xaritasi', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.fayl_boglash', nom: 'Fayl bog‘lash (eski)', izoh: 'Eski GAS Drive tabi: fayllarni obyekt va hujjatlarga bog‘lash.', qatlam: 'tizim', bolim: 'Nazorat va xizmat', yol: '/admin/fayl-boglash', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
  { id: 'tizim.eski_sinov', nom: 'Eski sinov qobig‘i', izoh: 'Moslik uchun saqlangan /admin/test sahifalari.', qatlam: 'tizim', bolim: 'Nazorat va xizmat', yol: '/admin/test', saqlash: 'server', ruxsat: ['control.global.read'], faqatSuperadmin: true },
];

/** `[]` → hamma; aks holda birorta element, uning barcha `+` bo'laklari `permissions` da bo'lsa. */
export function ruxsatMos(ruxsat: readonly string[], permissions: readonly string[]): boolean {
  if (ruxsat.length === 0) return true;
  return ruxsat.some((r) => r.split('+').every((p) => permissions.includes(p.trim())));
}

/** Kompaniya turi noma'lum (null) bo'lsa — hech narsa yashirilmaydi. */
export function mavqeMos(s: Pick<Sozlama, 'mavqe'>, mavqe: string | null | undefined): boolean {
  if (!s.mavqe || s.mavqe.length === 0) return true;
  if (!mavqe) return true;
  return (s.mavqe as readonly string[]).includes(mavqe);
}

export type SozlamaKontekst = { superadmin: boolean; permissions: readonly string[]; mavqe?: string | null };

/** Foydalanuvchi ko'ra oladigan sozlamalar. Superadmin — hammasi; `mavqe` berilsa mos kelmaganlar tushiriladi. */
export function sozlamaFiltr(ctx: SozlamaKontekst, royxat: readonly Sozlama[] = SOZLAMALAR): Sozlama[] {
  return royxat.filter((s) => {
    if ((s.faqatSuperadmin || faqatSuperadminYolmi(s.yol)) && !ctx.superadmin) return false;
    if (!ctx.superadmin && !ruxsatMos(s.ruxsat, ctx.permissions)) return false;
    if (ctx.mavqe !== undefined && !mavqeMos(s, ctx.mavqe)) return false;
    return true;
  });
}

export function qatlamSoni(royxat: readonly Sozlama[]): Record<SozlamaQatlam, number> {
  const r: Record<SozlamaQatlam, number> = { akkaunt: 0, kompaniya: 0, tizim: 0 };
  for (const s of royxat) r[s.qatlam] += 1;
  return r;
}
