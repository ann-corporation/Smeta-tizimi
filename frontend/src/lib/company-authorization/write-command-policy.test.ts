import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DINAMIK_BUYRUQLAR, RUXSATSIZ_BUYRUQ, WRITE_COMMAND_POLICY, writeCommandPermission } from '../../../functions/_shared/write-command-policy';
import { requestPermission } from '../../../functions/_shared/permission-policy';

/* Smeta Network auditi P0 (2026-10-21): har yozish buyrug'i — aniq ruxsat; reyestrda yo'q — rad (fail-closed). */
const manba = readFileSync(join(process.cwd(), 'functions/api/sb-yoz.ts'), 'utf8');
const blok = manba.slice(manba.indexOf('const AMALLAR = {'), manba.indexOf('} as const;'));
const amallar = [...blok.matchAll(/^\s+([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]);
const KATALOG = new Set(['company.member.manage', 'company.profile.update', 'company.read', 'control.company.read', 'control.company.write',
  'control.global.read', 'control.global.write', 'document.read', 'document.write', 'f2.approve', 'f2.cancel', 'f2.correct', 'f2.import', 'f2.prepare',
  'f2.read', 'fakt.read', 'fakt.write', 'financial.read', 'financial.write', 'narx.read', 'narx.write', 'object.read', 'object.write',
  'project.read', 'project.write', 'smeta.read', 'smeta.write']);

describe('yozish buyruqlari reyestri', () => {
  it('sb-yoz dagi har amal reyestrda (yoki dinamik ro‘yxatda), reyestrda ortiqcha amal yo‘q', () => {
    expect(amallar.length).toBeGreaterThan(100);
    expect(amallar.filter((a) => !(a in WRITE_COMMAND_POLICY) && !DINAMIK_BUYRUQLAR.has(a))).toEqual([]);
    expect(Object.keys(WRITE_COMMAND_POLICY).filter((a) => !amallar.includes(a))).toEqual([]);
  });
  it('har ruxsat — DB katalogidagi haqiqiy ruxsat nomi', () => {
    expect(Object.entries(WRITE_COMMAND_POLICY).filter(([, p]) => !KATALOG.has(p))).toEqual([]);
  });
  it('noma’lum amal — hech kimda yo‘q ruxsat (fail-closed); dinamik F2 o‘tishi tanaga qaraydi', () => {
    expect(writeCommandPermission('yangi_tekshirilmagan_amal')).toBe(RUXSATSIZ_BUYRUQ);
    expect(KATALOG.has(RUXSATSIZ_BUYRUQ)).toBe(false);
    expect(requestPermission('sb-yoz', 'POST', { amal: 'yangi_tekshirilmagan_amal' }, new URLSearchParams())).toBe(RUXSATSIZ_BUYRUQ);
    expect(writeCommandPermission('akt_lifecycle_transition_v1', { to_status: 'cancelled' })).toBe('f2.cancel');
    expect(writeCommandPermission('akt_lifecycle_transition_v1', { to_status: 'approved' })).toBe('f2.approve');
  });
  it('smeta qatorini o‘zgartiruvchi ish_abc buyruqlari smeta.write talab qiladi (RPC bilan bir xil)', () => {
    for (const a of ['ish_abc_saqla_v1', 'ish_abc_ochir_v1', 'ish_abc_tahrir_v1', 'qator_ish_abc_ochir_v2', 'qator_ish_abc_tahrir_v2', 'smeta_bolim_yarat_v1']) {
      expect(writeCommandPermission(a)).toBe('smeta.write');
    }
    expect(writeCommandPermission('m29_bajar_v1')).toBe('fakt.write');
  });
});
