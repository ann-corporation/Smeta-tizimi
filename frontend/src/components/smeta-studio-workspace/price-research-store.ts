import { get, update } from 'idb-keyval';
import type { InternetNatija } from '../../lib/smeta-ai/internet-narx';
export type PriceResearchItem={key:string;name:string;result:InternetNatija};
export function researchKey(company:number|null,draft:string){return `smeta:price-research:v1:${company ?? 'unbound'}:${draft}`;}
export async function retainResearch(scope:string,item:PriceResearchItem){await update<Record<string,PriceResearchItem>>(scope,old=>({...old,[item.key]:item}));}
export async function readResearch(scope:string){return await get<Record<string,PriceResearchItem>>(scope);}
