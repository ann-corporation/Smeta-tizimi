import {it,expect} from 'vitest';
import {parseGoalPlan} from './vazifa-reja';
it('accepts only the complete executable read workflow',()=>{expect(parseGoalPlan({supported:true,explanation:'Check',questions:[],steps:['object.summary','object.discrepancies']})?.supported).toBe(true);});
it.each([['object.summary','write.fact'],['object.summary'],['object.discrepancies','object.summary']])('rejects unsupported or incomplete steps %j',(...steps)=>{expect(parseGoalPlan({supported:true,explanation:'Check',questions:[],steps})).toBeNull();});
it('unsupported goals cannot carry executable steps',()=>{expect(parseGoalPlan({supported:false,explanation:'Needs document capability',questions:[],steps:[]})).not.toBeNull();expect(parseGoalPlan({supported:false,explanation:'No',questions:[],steps:['object.summary']})).toBeNull();});
it('an unanswered question cannot be marked executable',()=>{expect(parseGoalPlan({supported:true,explanation:'Maybe',questions:['Which object?'],steps:['object.summary','object.discrepancies']})).toBeNull();});
