import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KompaniyaProvider, useKompaniya } from './KompaniyaKontekst';

const state = vi.hoisted(() => ({ data: {} as any }));
vi.mock('../../api/t2-men', () => ({ useMen: () => ({ data: state.data, isLoading: false, refetch: vi.fn() }) }));
function Probe() {
  const k = useKompaniya();
  return <div><span data-testid="facts">{JSON.stringify({ superadmin:k.superadmin, role:k.joriy?.rol, membership:k.joriy?.membershipRole, companies:k.kompaniyalar.map(c=>c.id), global:k.globalRejim })}</span><button onClick={()=>k.tanla(17)}>Select</button></div>;
}
const read = () => JSON.parse(screen.getByTestId('facts').textContent!);
function mount(platform_role: 'superadmin'|'none', membership = 'pto') {
  const contexts = platform_role === 'superadmin' ? [1,17,21] : [17];
  state.data = { ok:true, platform_role, foydalanuvchi: {id:7}, azoliklar:[{kompaniya_id:17,nom:'NTB',kod:'NTB',rol:membership,faol:true}],
    context_kompaniyalar:contexts.map(id=>({kompaniya_id:id,nom:'Company '+id,kod:'C'+id,faol:true,membership_role:id===17?membership:null,effective_role:platform_role==='superadmin'?'superadmin':membership,is_director:platform_role==='superadmin'||membership==='boss'})) };
  return render(<QueryClientProvider client={new QueryClient()}><KompaniyaProvider><Probe/></KompaniyaProvider></QueryClientProvider>);
}
afterEach(()=>{ cleanup(); localStorage.clear(); });
describe('platform role ≠ company membership',()=>{
  it('saved PTO company cannot downgrade platform superadmin',async()=>{
    localStorage.setItem('t2_kompaniya_kontekst',JSON.stringify({uid:7,id:17,global:false})); mount('superadmin');
    await waitFor(()=>expect(read()).toMatchObject({superadmin:true,role:'superadmin',membership:'pto',companies:[1,17,21]}));
  });
  it('normal user cannot inherit platform mode or unrelated companies',async()=>{
    localStorage.setItem('t2_kompaniya_kontekst',JSON.stringify({uid:999,id:1,global:true})); mount('none');
    await waitFor(()=>expect(read()).toMatchObject({superadmin:false,role:'pto',companies:[17],global:false}));
  });
  it('company admin is NOT platform superadmin',async()=>{
    mount('none','admin'); await waitFor(()=>expect(read()).toMatchObject({superadmin:false,role:'admin'}));
  });
  it('new superadmin starts in global mode without losing company choices',async()=>{
    mount('superadmin'); await waitFor(()=>expect(read()).toMatchObject({global:true,companies:[1,17,21]}));
  });
});
