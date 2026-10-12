import { useQueries, useQuery } from '@tanstack/react-query';
import type { T2Obyekt } from '../../api/supabase';
import type { Liniya } from '../../api/t2-shartnoma-liniya';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { sbPodvallarOl } from '../../api/t2-nakrutka-podval';
import { aggregateMarkup, effectiveContract, markupAmount, markupKey } from './markup';

// Small server aggregates only. Keep at most four reads in flight; the main estimate is never blocked.
let active = 0;
const waiting: Array<() => void> = [];
export async function limitedRead<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  await new Promise<void>(resolve => {const start=()=>{active++;resolve();};if(active<4) start();else waiting.push(start);});
  try {if(signal.aborted) throw new Error('MARKUP_CANCELLED');return await read();}
  finally {active--;waiting.shift()?.();}
}

export function useMarkupTotals(companyId: number, line: Liniya | undefined, objects: T2Obyekt[]) {
  const podvals = useQuery({queryKey:['pto-markup-podvals',companyId],enabled:!!line,staleTime:60_000,retry:false,
    queryFn:async()=>{const r=await sbPodvallarOl(companyId);if(!r.ok || r.toliq===false || !Array.isArray(r.qatorlar)) throw new Error('PODVAL_READ_FAILED');return r.qatorlar;}});
  const pairs=new Map<string,{object:T2Obyekt;contractId:number|null}>();
  if(line) for(const object of objects) {
    const canonical=line.obyektlar.find(o=>o.id===object.id);
    if(!canonical) continue;
    const primary=effectiveContract(line,object.id);
    if(primary!==undefined) pairs.set(markupKey(object.id,primary),{object,contractId:primary});
    for(const contract of line.shartnomalar.filter(s=>s.loyiha_id===canonical.loyiha_id && s.obyektlar.includes(object.id))) pairs.set(markupKey(object.id,contract.id),{object,contractId:contract.id});
  }
  const entries=[...pairs.entries()];
  const queries=useQueries({queries:entries.map(([key,pair])=>({
    queryKey:['pto-markup',companyId,key,pair.object.versiya,pair.object.yangilandi],
    enabled:podvals.isSuccess,staleTime:60_000,retry:false,
    queryFn:({signal}:{signal:AbortSignal})=>limitedRead(async()=>{
      const r=await t2ObyektNakrutka(pair.object.id,pair.contractId);
      if(!r.ok) throw new Error('MARKUP_READ_FAILED');
      return r;
    },signal),
  }))});
  const values=new Map(entries.map(([key,pair],i)=>[key,podvals.isSuccess && queries[i].data ? markupAmount(pair.object,queries[i].data!,podvals.data,pair.contractId) : null]));
  return {loading:podvals.isPending || podvals.isFetching || queries.some(q=>q.isPending && q.fetchStatus!=='idle'),
    retry:()=>{void podvals.refetch();if(podvals.data) queries.forEach(q=>{void q.refetch();});},
    failed:podvals.isError || queries.some(q=>q.isError),
    sum:(ids:readonly number[],contractId?:number)=>aggregateMarkup(ids,objects,id=>{
      const sid=contractId ?? (line ? effectiveContract(line,id) : undefined);
      return sid===undefined ? null : values.get(markupKey(id,sid));
    })};
}
