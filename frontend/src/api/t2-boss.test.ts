import {afterEach,expect,it,vi} from 'vitest';
import {bossDashboardOl} from './t2-boss';
import {dashboardFixture} from '../components/boss-decision/fixtures.fixture';
afterEach(()=>vi.unstubAllGlobals());
it('passes abort signal and validates same-company echo',async()=>{const controller=new AbortController();const fetcher=vi.fn().mockImplementation(async()=>Response.json(dashboardFixture()));vi.stubGlobal('fetch',fetcher);expect((await bossDashboardOl(17,controller.signal)).kompaniya.kompaniya_id).toBe(17);expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);await expect(bossDashboardOl(18)).rejects.toThrow('SCOPE');});
it.each([0,-1,1.5,NaN,Infinity])('rejects invalid company %s before any request',async id=>{const f=vi.fn();vi.stubGlobal('fetch',f);await expect(bossDashboardOl(id)).rejects.toThrow('CONTEXT');expect(f).not.toHaveBeenCalled();});
it('fails closed on malformed executive data, permits explicit legacy coverage',async()=>{const d=dashboardFixture();(d.executive as any).objects=null;vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(d)));await expect(bossDashboardOl(17)).rejects.toThrow('SHAPE');delete d.executive;vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(d)));expect((await bossDashboardOl(17)).executive).toBeUndefined();});
