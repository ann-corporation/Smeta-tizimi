import { describe, expect, it, vi } from 'vitest';
import { amalIshga, juftAmallari, tugunAmallari } from './amal-mavzu';

const hamma = { permissions: ['smeta.write', 'financial.write', 'warehouse.write', 'document.write', 'company.member.manage', 'f2.prepare', 'f2.approve', 'narx.write', 'project.read'], superadmin: false };

describe('amal adapteri (mindmap karta, ikkinchi ro‘yxatsiz)', () => {
  it('tugun turi bo‘yicha amallar reestrdan: shartnoma tugunida to‘lov, obyektda zayavka/arxiv', () => {
    expect(tugunAmallari('shartnoma', hamma).map((a) => a.kalit)).toContain('moliya.tolov');
    expect(tugunAmallari('obyekt', hamma).map((a) => a.kalit)).toEqual(expect.arrayContaining(['zayavka.yaratish', 'arxiv.obyekt']));
    expect(tugunAmallari('noma‘lum', hamma)).toEqual([]);
  });
  it('ruxsat bo‘yicha filtrlanadi', () => {
    expect(tugunAmallari('shartnoma', { permissions: ['fakt.read'], superadmin: false })).toEqual([]);
  });
  it('chiziq tortish: obyekt + shartnoma -> shartnoma qo‘shish; tomon + hujjat -> yuborish', () => {
    expect(juftAmallari('obyekt', 'shartnoma', hamma).map((a) => a.kalit)).toContain('shartnoma.qosh');
    expect(juftAmallari('shartnoma', 'obyekt', hamma).map((a) => a.kalit)).toContain('shartnoma.qosh');
    expect(juftAmallari('tomon', 'kompaniya', hamma).map((a) => a.kalit)).toContain('tomon.aloqa');
  });
  it('amalIshga Jarvis oqimini amal nomi bilan ochadi', () => {
    const f = vi.fn(); window.addEventListener('ai:ochish', f as EventListener);
    amalIshga({ kalit: 'moliya.tolov', nom: 'To‘lov kiritish' });
    expect((f.mock.calls[0][0] as CustomEvent).detail.savol).toBe('To‘lov kiritish');
    window.removeEventListener('ai:ochish', f as EventListener);
  });
});