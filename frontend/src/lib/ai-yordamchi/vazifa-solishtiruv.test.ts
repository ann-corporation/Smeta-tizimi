import {it,expect,vi} from 'vitest';
import { reconciliationTask,reconciliationExecutor } from './vazifa-solishtiruv';
const scope={actorId:7,companyId:17,objectId:101};
it('unknown source is not evidence and never coerced to zero',async()=>{const save=vi.fn();const api={obyektHolat:vi.fn(async()=>null)};const e=reconciliationExecutor(api,save);const task=reconciliationTask('t','Compare',scope,['a','b']);expect(await e.readback(task.steps[0],scope)).toBeNull();expect(save).not.toHaveBeenCalled();});
it('existing discrepancy read is persisted without recalculation',async()=>{const result={doplata:{soni:1,jami:5},snyatie:{soni:0,jami:0},sigmadi:0,nomalum:3};const save=vi.fn(async()=> 'evidence:1');const e=reconciliationExecutor({slichitelniyHisob:async()=>result},save);const task=reconciliationTask('t','Compare',scope,['a','b']);expect(await e.readback(task.steps[1],scope)).toBe('evidence:1');expect(save).toHaveBeenCalledWith(scope,'b',result);});
