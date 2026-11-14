import { describe, expect, it } from 'vitest';
import { keyingiShartnomaRaqam } from './shartnoma-sukut';

describe('keyingiShartnomaRaqam', () => {
  it('eng katta oxirgi son + 1; bekor va raqamsizlar e‘tiborsiz', () => {
    expect(keyingiShartnomaRaqam([{ raqam: '№5' }, { raqam: 'DS-12' }, { raqam: '99', holat: 'bekor' }, { raqam: 'bez raqam' }])).toBe('13');
    expect(keyingiShartnomaRaqam([])).toBe('1');
  });
});
