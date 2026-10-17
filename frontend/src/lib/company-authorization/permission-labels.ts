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
};
export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin (platforma)', admin: 'Kompaniya administratori', boss: 'Kompaniya rahbari',
  rahbar: 'Kuzatuvchi rahbar', pto: 'PTO muhandisi', prorab: 'Prorab', bugalter: 'Buxgalter',
  buyurtmachi: 'Buyurtmachi', pudratchi: 'Pudratchi', kuzatuvchi: 'Kuzatuvchi',
};
