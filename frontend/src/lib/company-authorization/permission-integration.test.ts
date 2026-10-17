import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataPermission, requestPermission, SCOPED_APIS } from '../../../functions/_shared/permission-policy';
import { PERMISSIONS } from './effective-authorization';
const root=resolve(process.cwd(),'..');
const read=(p:string)=>readFileSync(resolve(root,p),'utf8');
describe('role integration architecture',()=>{
  it('every API is scoped or has an explicit independently secured exception',()=>{
    const exceptions=new Set(['didox-webhook','t2-bridge','hujjat-r2','kirish','kirish-google','royxat','royxat-ozi','royxat-email-kod','soglik','xato','kontekst-diag','catalog-release','norm-katalog','koef-katalog','hour-price-catalog','mash-katalog','narx-katalog','narx-katalog-nashr']);
    const routes=readdirSync(resolve(root,'frontend/functions/api')).filter(n=>n.endsWith('.ts')&&!n.endsWith('.test.ts')&&!n.startsWith('_')).map(n=>n.slice(0,-3));
    expect(routes.filter(n=>!SCOPED_APIS.has(n)&&!exceptions.has(n))).toEqual([]);
  });
  it('all named write actions classify to a known permission; platform writes stay platform-only',()=>{
    const actions=[...read('frontend/functions/api/sb-yoz.ts').matchAll(/^  (\w+): \{ rpc:/gm)].map(m=>m[1]);
    expect(actions.length).toBeGreaterThan(100);
    for(const action of actions) expect(PERMISSIONS).toContain(dataPermission(action,true));
    expect(dataPermission('platforma_narx_manba_yoz',true)).toBe('control.global.write');
    expect(dataPermission('faktura_yoz',true)).toBe('financial.write');
    expect(dataPermission('fakt_yoz_v2',true)).toBe('fakt.write');
    expect(dataPermission('t2_faktura',false)).toBe('financial.read');
    expect(dataPermission('t2_fakt',false)).toBe('fakt.read');
    expect(dataPermission('t2_akt_reestr',false)).toBe('f2.read');
  });
  it('SQL and UI expose exactly the same company permission catalog',()=>{
    const sql=read('supabase/migrations/20261017100629_t2_individual_permission_constructor_v2.sql');
    const catalog=sql.slice(sql.indexOf('create or replace function public.t2_permission_catalog_v2()'),sql.indexOf('create or replace function public.t2_role_permissions_v2'));
    const codes=[...catalog.matchAll(/'([a-z0-9_.]+)'/g)].map(m=>m[1]);
    expect(codes.sort()).toEqual(PERMISSIONS.filter(p=>!p.startsWith('control.global')).sort());
  });
  it('20 native bindings change only permission guards, not financial/history/business logic',()=>{
    const forward=read('supabase/migrations/20261017100629_t2_individual_permission_constructor_v2.sql');
    const rollback=read('supabase/migrations/20261017100629_t2_individual_permission_constructor_v2.rollback.sql');
    const names=[...forward.matchAll(/-- (t2_\w+): /g)].map(m=>m[1]); expect(names).toHaveLength(20);
    function body(text:string,name:string) {
      const start=text.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
      const open=text.indexOf('AS $function$',start); const end=text.indexOf('$function$',open+13);
      expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(open);
      return text.slice(open+13,end);
    }
    const compact=(s:string)=>s.replace(/\s+/g,' ').trim();
    for(const name of names){
      let patched=body(forward,name);
      expect(patched).toContain('perform public.t2_require_permission_v2');
      patched=patched.replace(/\s*perform public\.t2_require_permission_v2\([^;]*\);/g,'');
      patched=patched.replace(/ and not public\.t2_permission_allowed_v2\([^\n]*?\) then/g,' then');
      expect(compact(patched),name).toBe(compact(body(rollback,name)));
    }
  });
  it('read-only and write lifecycle transitions remain separate',()=>{
    expect(requestPermission('sb-yoz','POST',{amal:'akt_lifecycle_transition_v1',to_status:'cancelled'},new URLSearchParams())).toBe('f2.cancel');
    expect(requestPermission('sb-yoz','POST',{amal:'akt_lifecycle_transition_v1',to_status:'submitted'},new URLSearchParams())).toBe('f2.prepare');
    expect(requestPermission('sb-yoz','POST',{amal:'akt_lifecycle_transition_v1',to_status:'approved'},new URLSearchParams())).toBe('f2.approve');
  });
});
