import { expect, it } from 'vitest';
import { searchNavigation } from './navigation-search';
const groups = [{ nom: 'PTO', menyular: [{ nom: 'F2 tayyorlash', yol: '/admin/f2-tayyorlash' }, { nom: 'Obyektlar ro‘yxati', yol: '/admin/obyektlar' }] }];
it('qidiruv bo‘sh bo‘lsa mavjud menyuni saqlaydi', () => expect(searchNavigation(groups, ' ')).toBe(groups));
it('nom va guruh bo‘yicha birgalikda qidiradi', () => expect(searchNavigation(groups, 'pto F2')[0].menyular).toHaveLength(1));
it('apostrof variantlarini teng ko‘radi', () => expect(searchNavigation(groups, "ro'yxati")[0].menyular[0].yol).toBe('/admin/obyektlar'));
it('ruxsatda yo‘q sahifani yaratmaydi va manbani o‘zgartirmaydi', () => {
  expect(searchNavigation(groups, 'admin/system-control')).toEqual([]);
  expect(groups[0].menyular).toHaveLength(2);
});
