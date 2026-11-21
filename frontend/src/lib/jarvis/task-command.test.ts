import { expect, it } from 'vitest';
import { taskDraft } from './task-command';

it('keeps an absent deadline/object/assignee unknown and accepts an exact leap day', () => {
  expect(taskDraft({ sarlavha: '  Tekshiruv  ' })).toEqual({ sarlavha: 'Tekshiruv', matn: null, muddat: null,
    tur: 'ish', obyekt_id: null, ijrochi_foydalanuvchi_id: null });
  expect(taskDraft({ sarlavha: 'Текширув', muddat: '2028-02-29', obyekt_id: 17,
    ijrochi_foydalanuvchi_id: 31, tur: 'tekshiruv' })).toMatchObject({ muddat: '2028-02-29', obyekt_id: 17 });
});
it.each([null, [], 'task', {}, { sarlavha: '' }, { sarlavha: 'x\ny' }, { sarlavha: 'x'.repeat(201) },
  { sarlavha: 'x', muddat: '2027-02-29' }, { sarlavha: 'x', muddat: '0000-01-01' },
  { sarlavha: 'x', muddat: '2026-13-01' }, { sarlavha: 'x', muddat: '' }, { sarlavha: 'x', muddat: 0 },
  { sarlavha: 'x', obyekt_id: '17' }, { sarlavha: 'x', obyekt_id: 0 }, { sarlavha: 'x', obyekt_id: 1.1 },
  { sarlavha: 'x', ijrochi_foydalanuvchi_id: 2 ** 53 }, { sarlavha: 'x', matn: false },
  { sarlavha: 'x', matn: 'x'.repeat(4001) }, { sarlavha: 'x', tur: null },
  { sarlavha: 'x', kompaniya_id: 99 }, { sarlavha: 'x', tasdiqlayman: true },
])('rejects malformed or privilege-bearing input: %j', value => expect(taskDraft(value)).toBeNull());
