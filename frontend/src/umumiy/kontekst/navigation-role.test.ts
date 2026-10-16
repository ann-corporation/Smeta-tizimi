import {describe,it,expect} from 'vitest';
import {navigationRole} from './navigation-role';
describe('platform and company roles are independent',()=>{
 it('retains canonical superadmin authority with a selected PTO membership',()=>{expect(navigationRole({global:false,companyRole:'pto',memberships:[{rol:'superadmin'},{rol:'pto'}]})).toEqual({platform:'superadmin',company:'pto',effective:'superadmin'});});
 it('uses each company role for an ordinary user',()=>{for(const role of ['pto','boss','rahbar','prorab'])expect(navigationRole({global:false,companyRole:role,memberships:[{rol:role}]}).effective).toBe(role);});
 it('never promotes a platform admin to superadmin or overrides its company PTO role',()=>{expect(navigationRole({global:false,companyRole:'pto',memberships:[{rol:'admin'},{rol:'pto'}]})).toEqual({platform:'admin',company:'pto',effective:'pto'});expect(navigationRole({global:true,memberships:[{rol:'admin'}]}).effective).toBe('admin');});
 it('ignores revoked/inactive elevated memberships',()=>{expect(navigationRole({global:false,companyRole:'pto',memberships:[{rol:'superadmin',faol:false},{rol:'superadmin',holat:'bekor'},{rol:'pto'}]})).toEqual({platform:null,company:'pto',effective:'pto'});});
 it('does not restore a missing privilege from local context or a previous actor',()=>{expect(navigationRole({global:true,memberships:[]})).toEqual({platform:null,company:null,effective:''});});
});
