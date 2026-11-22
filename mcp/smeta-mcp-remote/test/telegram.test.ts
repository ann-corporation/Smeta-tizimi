import { describe, expect, it } from 'vitest';
import { sessdanProps } from '../src/telegram';

describe('Telegram orqali kirish — sayt sessiyasidan foydalanuvchi', () => {
  const tok = (o: unknown) => `sess=${btoa(JSON.stringify(o)).replace(/=+$/, '')}.abc123; HttpOnly; Secure; Path=/`;
  it('foydalanuvchi_id va login o\'qiladi', () => {
    const p = sessdanProps(tok({ foydalanuvchi_id: 183, email: '+998900000000', rol: 'superadmin' }));
    expect(p?.foydalanuvchi_id).toBe(183);
    expect(p?.login).toBe('+998900000000');
  });
  it('yaroqsiz yoki yo\'q token — null', () => {
    expect(sessdanProps(null)).toBeNull();
    expect(sessdanProps('sess=@@@.x')).toBeNull();
    expect(sessdanProps(tok({ foydalanuvchi_id: -1 }))).toBeNull();
    expect(sessdanProps('boshqa=1')).toBeNull();
  });
});
