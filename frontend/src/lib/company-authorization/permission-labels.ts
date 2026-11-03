import type { PermissionCode } from './effective-authorization';

/** Presentation only. Server-owned permission identifiers are never renamed. */
export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  'f2.read':'F2 tarixi va Nakopitelniyni ko‘rish', 'f2.import':'Tayyor F2 faylini import qilish',
  'f2.prepare':'F2 qoralamasini tayyorlash', 'f2.approve':'F2 ni tasdiqlash',
  'f2.cancel':'F2 ni bekor qilish', 'f2.correct':'F2 tuzatish hujjatini yaratish',
  'smeta.read':'Smeta va LRV ni ko‘rish', 'smeta.write':'Smeta bilan ishlash',
  'fakt.read':'Faktni ko‘rish', 'fakt.write':'Fakt kiritish',
  'narx.read':'Narx va ustamalarni ko‘rish', 'narx.write':'Narx va ustamalarni tahrirlash',
  'company.read': 'Kompaniya ma’lumotlarini ko‘rish',
  'company.profile.update': 'Kompaniya rekvizitlarini o‘zgartirish',
  'company.member.manage': 'A’zolar va ularning rollarini boshqarish',
  'control.company.read': 'Kompaniya sozlamalarini ko‘rish',
  'control.company.write': 'Kompaniya sozlamalarini boshqarish',
  'control.global.read': 'Platforma boshqaruvini ko‘rish',
  'control.global.write': 'Platformani boshqarish',
  'project.read': 'Loyihalarni ko‘rish', 'project.write': 'Loyihalarni tahrirlash',
  'object.read': 'Obyektlarni ko‘rish', 'object.write': 'Obyektlarni tahrirlash',
  'document.read': 'Hujjatlarni ko‘rish', 'document.write': 'Hujjatlar bilan ishlash',
  'financial.read': 'Moliyaviy ma’lumotlarni ko‘rish', 'financial.write': 'Moliyaviy ma’lumotlarni tahrirlash',
  // Ekotizim (E2 §3.1)
  'procurement.read': 'Xaridlarni ko‘rish', 'procurement.write': 'Zayavka va tender bilan ishlash', 'procurement.approve': 'Xaridni tasdiqlash',
  'supply.offer': 'Tenderga taklif berish', 'supply.fulfil': 'Buyurtmani bajarish',
  'logistics.read': 'Yuk va reyslarni ko‘rish', 'logistics.dispatch': 'Reyslarni taqsimlash', 'logistics.trip': 'O‘z reysini bajarish',
  'warehouse.read': 'Omborni ko‘rish', 'warehouse.write': 'Ombor harakatlarini kiritish', 'warehouse.receive': 'Yukni omborga qabul qilish',
  'quality.read': 'Sifat nazoratini ko‘rish', 'quality.inspect': 'Tekshiruv o‘tkazish', 'quality.decide': 'Sifat bo‘yicha qaror chiqarish',
  'design.read': 'Chizmalarni ko‘rish', 'design.write': 'Chizmalar bilan ishlash', 'design.issue': 'Chizmani ishga chiqarish',
  'hr.read': 'Xodimlarni ko‘rish', 'hr.write': 'Xodimlarni tahrirlash', 'hr.pii.read': 'Xodimlarning shaxsiy ma’lumotlarini ko‘rish',
  'hr.pii.write': 'Xodimlarning shaxsiy ma’lumotlarini tahrirlash', 'hr.tabel.write': 'Tabel kiritish',
  'payroll.read': 'Ish haqini ko‘rish', 'payroll.write': 'Ish haqini hisoblash',
  'machinery.read': 'Texnikani ko‘rish', 'machinery.write': 'Texnikani tahrirlash', 'machinery.log': 'Texnika jurnaliga yozish',
  'accounting.read': 'Buxgalteriyani ko‘rish', 'accounting.write': 'Buxgalteriya yozuvlarini kiritish', 'accounting.approve': 'To‘lovni tasdiqlash',
  'self.work.read': 'O‘z topshiriqlarini ko‘rish', 'self.work.write': 'O‘z topshiriqlarini bajarish',
};
export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin (platforma)', admin: 'Kompaniya administratori', boss: 'Kompaniya rahbari',
  rahbar: 'Kuzatuvchi rahbar', pto: 'PTO muhandisi', prorab: 'Prorab', bugalter: 'Buxgalter',
  buyurtmachi: 'Buyurtmachi', pudratchi: 'Pudratchi', kuzatuvchi: 'Kuzatuvchi',
  omborchi: 'Omborchi', mexanik: 'Mexanik', kadr: 'Kadrlar xodimi', taminotchi: 'Ta’minotchi', usta: 'Usta',
  brigadir: 'Brigadir', haydovchi: 'Haydovchi', inspektor: 'Inspektor', loyihachi: 'Loyihachi',
};
