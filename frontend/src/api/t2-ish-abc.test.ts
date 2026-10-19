import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataPermission } from '../../functions/_shared/permission-policy';
const m=vi.hoisted(()=>({write:vi.fn()}));
vi.mock('./supabase',()=>({yozAmali:m.write}));
import { ishAbcOchir, ishAbcTahrir } from './t2-ish-abc';
beforeEach(()=>{m.write.mockReset();m.write.mockResolvedValue({ok:true});});
describe('versioned F2 row corrections',()=>{
 it('preserves an explicit zero version and uses smeta.write instead of document.write',async()=>{
  await ishAbcOchir({kompaniyaId:5,obyektId:7,qatorId:9,kutilganVersiya:0,operationId:'stable'});
  const body=m.write.mock.calls[0][0];
  expect(body).toMatchObject({amal:'qator_ish_abc_ochir_v2',kutilgan_versiya:0,operation_id:'stable',kompaniya_id:5,obyekt_id:7,qator_id:9});
  expect(dataPermission(body.amal,true,body)).toBe('smeta.write');
 });
 it('passes the row version with edit payload and stable operation identity',async()=>{
  await ishAbcTahrir({kompaniyaId:5,obyektId:7,qatorId:9,kutilganVersiya:3,operationId:'stable',sabab:'fix',resurslar:[]});
  const body=m.write.mock.calls[0][0];
  expect(body).toMatchObject({amal:'qator_ish_abc_tahrir_v2',kutilgan_versiya:3,operation_id:'stable',resurslar:[]});
  expect(dataPermission(body.amal,true,body)).toBe('smeta.write');
 });
 it('keeps existing non-F2 callers compatible when they do not supply a version',async()=>{
  await ishAbcOchir({kompaniyaId:5,obyektId:7,qatorId:9,operationId:'legacy'});
  expect(m.write.mock.calls[0][0].amal).toBe('qator_ish_abc_ochir_v1');
 });
});
