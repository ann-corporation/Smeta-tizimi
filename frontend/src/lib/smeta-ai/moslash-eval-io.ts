/** Node-only helpers of the LOCAL eval runners (real smetas / catalogue release are read from folders outside the repository). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { kitobAnatomiyasi, sarlavhaYoli } from '../smeta-anatomiya/index';
import { faylniOqi } from '../smeta-anatomiya/korpus/oqish';
import { NormLibraryCatalog } from '../catalog-extraction/norm-library';
import type { IshJuft, ResursJuft } from './moslash-eval';

export const EVAL_DIRS = (process.env.MOSLASH_EVAL_DIRS ?? '').split(';').map(s => s.trim()).filter(Boolean);
export const EVAL_ROOT = process.env.NORM_LIBRARY_FIXTURE_ROOT;
export const EVAL_OUT = process.env.MOSLASH_EVAL_OUT;

function fayllar(dir: string): string[] {
  const out: string[] = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) out.push(...fayllar(p));
    else if (/\.(xlsx?|xlsm)$/i.test(n) && !n.startsWith('~$')) out.push(p);
  }
  return out.sort();
}

export async function katalogOch(): Promise<NormLibraryCatalog> {
  const fetcher = async (u: string) => new Response(fs.readFileSync(path.join(EVAL_ROOT!, new URL(u, 'http://x').searchParams.get('f')!)));
  return NormLibraryCatalog.open(fetcher, '/api/norm-library');
}

export type Dataset = { ishlar: IshJuft[]; resurslar: ResursJuft[]; fayllar: number };
/** Work lines + resource lines of the approved smetas (cached in the report folder; unique ids). */
export function datasetOl(): Dataset {
  const cache = EVAL_OUT ? path.join(EVAL_OUT, 'dataset.json') : null;
  if (cache && fs.existsSync(cache)) {
    const d = JSON.parse(fs.readFileSync(cache, 'utf8')) as Dataset;
    d.ishlar.forEach((j, i) => { j.id = String(i); });
    return d;
  }
  const ishlar: IshJuft[] = [], resurslar: ResursJuft[] = [];
  let n = 0;
  for (const dir of EVAL_DIRS) for (const p of fayllar(dir)) {
    let a;
    try { a = kitobAnatomiyasi(faylniOqi(p, dir)); } catch { continue; }
    n++;
    const fayl = path.relative(dir, p).replace(/\\/g, '/');
    for (const v of a.varaqlar) {
      if (v.rol !== 'lrv' && v.rol !== 'res') continue;
      const barcha = [...v.titul, ...v.sarlavhalar];
      for (const i of v.ishlar) {
        if (v.rol === 'lrv' && i.shifr && i.xom) ishlar.push({ id: '', nom: i.xom, birlik: i.birlik, hajm: i.hajm, kod: i.shifr, bolim: sarlavhaYoli(barcha, i.sarlavha).map(s => s.xom), fayl });
        for (const r of i.resurslar) if (r.xom) resurslar.push({ kod: r.kod, nom: r.xom, birlik: r.birlik, narx: r.narx, fayl });
      }
      for (const r of v.vedomost) if (r.xom) resurslar.push({ kod: r.kod, nom: r.xom, birlik: r.birlik, narx: r.narx, fayl });
    }
  }
  ishlar.forEach((j, i) => { j.id = String(i); });
  const d = { ishlar, resurslar, fayllar: n };
  if (cache) { fs.mkdirSync(EVAL_OUT!, { recursive: true }); fs.writeFileSync(cache, JSON.stringify(d), 'utf8'); }
  return d;
}
