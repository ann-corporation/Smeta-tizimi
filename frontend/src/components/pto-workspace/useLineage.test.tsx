import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompanyLineage } from './useLineage';
const read = vi.hoisted(() => vi.fn());
vi.mock('../../api/t2-shartnoma-liniya', () => ({shartnomaLiniyaOl: read}));
function View({id}: {id:number}) { const r=useCompanyLineage(id); return <p>{r.data?.loyihalar[0]?.nom ?? 'pending'}</p>; }
afterEach(() => { cleanup(); read.mockReset(); });
describe('company lineage cache', () => {
  it('does not display a late company A response in company B', async () => {
    let finish!: (r: unknown) => void;
    read.mockImplementation((id:number) => id===1 ? new Promise(resolve => {finish=resolve;}) : Promise.resolve({ok:true,natija:{loyihalar:[{id:2,nom:'B'}],shartnomalar:[],obyektlar:[]}}));
    const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const wrapper=({id}:{id:number}) => <QueryClientProvider client={cache}><View id={id}/></QueryClientProvider>;
    const app=render(wrapper({id:1})); await waitFor(() => expect(read).toHaveBeenCalledWith(1));
    app.rerender(wrapper({id:2})); await screen.findByText('B');
    finish({ok:true,natija:{loyihalar:[{id:1,nom:'A'}],shartnomalar:[],obyektlar:[]}});
    await waitFor(() => expect(screen.getByText('B')).toBeTruthy()); expect(screen.queryByText('A')).toBeNull();
  });
  it('shares one request between navigator and object breadcrumb', async () => {
    read.mockResolvedValue({ok:true,natija:{loyihalar:[{id:1,nom:'A'}],shartnomalar:[],obyektlar:[]}});
    const cache=new QueryClient();
    render(<QueryClientProvider client={cache}><View id={1}/><View id={1}/></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByText('A')).toHaveLength(2)); expect(read).toHaveBeenCalledTimes(1);
  });
});
