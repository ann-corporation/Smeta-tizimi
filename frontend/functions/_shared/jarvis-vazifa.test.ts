import {it,expect} from 'vitest';
import {taskPayload} from './jarvis-vazifa';
import {reconciliationTask} from '../../src/lib/ai-yordamchi/vazifa-solishtiruv';
const scope={actorId:7,companyId:17,objectId:101};
it('session actor overrides client authority',()=>{const t=reconciliationTask('t','Check',scope,['a','b']);t.scope.actorId=999;expect(taskPayload(t,{...scope,actorId:7})?.scope.actorId).toBe(7);});
it('rejects writes, foreign object and malformed state',()=>{const t=reconciliationTask('t','Check',scope,['a','b']);t.steps[0].write=true;expect(taskPayload(t,scope)).toBeNull();t.steps[0].write=false;t.steps[0].input.objectId=102;expect(taskPayload(t,scope)).toBeNull();});
it('verified state requires evidence',()=>{const t=reconciliationTask('t','Check',scope,['a','b']);t.steps[0].state='verified';expect(taskPayload(t,scope)).toBeNull();});
