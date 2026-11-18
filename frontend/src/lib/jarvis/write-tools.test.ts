import { expect, it } from 'vitest';
import { jarvisF2WriteIntent, jarvisWriteTools, parseJarvisWriteCall, toolSummary } from './write-tools';

const call = { name: 'f2_qoralama_tahrir', arguments: { akt_id: 41, ozgartir: [{ qator_id: 53, hajm: 2, narx: 0 }] } };
it.each(['41 F-2 da 53 hajmini 2 qil', 'Ф-2 да 53 ҳажмини 2 қил', 'Измени объём в КС-2', 'Faktga -2 qo‘sh'])('routes the natural write request %s', question => {
  expect(jarvisF2WriteIntent(question)).toBe(true);
});
it('keeps read-only F2 and fact questions in the existing read router', () => {
  expect(jarvisF2WriteIntent('F-2 holati qanday?')).toBe(false);
  expect(jarvisF2WriteIntent('Fakt jami qancha?')).toBe(false);
});
it('validates an absolute F2 edit including an explicit zero price', () => {
  expect(parseJarvisWriteCall(call)).toMatchObject({ name: call.name, args: call.arguments });
  expect(jarvisWriteTools.map(tool => tool.nom)).not.toContain('f2_tasdiq');
});
it.each(['actor_id', 'p_actor_id', 'kompaniya_id', 'token', 'tasdiqlayman'])('rejects model authority or confirmation field %s', key => {
  expect(parseJarvisWriteCall({ ...call, arguments: { ...call.arguments, [key]: 7 } })).toBeNull();
});
it('preserves a negative fact delta and rejects invalid payloads', () => {
  expect(parseJarvisWriteCall({ name: 'fakt_yoz', arguments: { obyekt_id: 3, qatorlar: [{ qator_id: 53, hajm: -2 }] } })?.args)
    .toMatchObject({ qatorlar: [{ qator_id: 53, hajm: -2 }] });
  expect(parseJarvisWriteCall({ name: 'f2_tasdiq', arguments: { token: 'x', tasdiqlayman: true } })).toBeNull();
  expect(parseJarvisWriteCall({ ...call, arguments: { akt_id: 41, ozgartir: [{ qator_id: 53, hajm: null }] } })).toBeNull();
});
it('accepts a model conclusion only with unchanged evidence numbers', () => {
  expect(toolSummary('{"javob":"Jami 12,50 va -2"}', 'Sinov 12,50; -2')).toBe('Jami 12,50 va -2');
  expect(toolSummary('{"javob":"Jami 1250"}', 'Sinov 12,50')).toBeNull();
  expect(toolSummary('{"javob":"Jami 2","tool_call":{}}', '2')).toBeNull();
});
