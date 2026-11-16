// @vitest-environment node
/**
 * LOCAL builder of the experience index from the REAL approved smetas (nothing is uploaded; L0 uploads with tools/tajriba-indeks/r2_yukla_tajriba.ps1).
 * It drives the SAME code path as the nightly job (functions/_shared/tajriba-tick.ts) with the local objects as the data source and a folder as "R2".
 *
 *   TAJRIBA_DB_JSONL="<db_export.mjs output>"         (optional) DB lines
 *   MOSLASH_EVAL_DIRS="<approved smeta folders;...>"  (optional) approved smeta files
 *   MOSLASH_EVAL_OUT="<eval folder>"                  dataset cache of the smeta files (moslash-eval-io)
 *   TAJRIBA_OUT="<NEW folder outside the repository>" the R2 tree is written here + upload-manifest.json
 *   npx vitest run src/lib/smeta-ai/tajriba-qur.local.test.ts
 * Skipped without TAJRIBA_OUT (never a fake PASS).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { lokalObyektlar } from './tajriba-lokal-io';
import { tajribaTickIsh, type TajribaDeps } from '../../../functions/_shared/tajriba-tick';
import { TAJRIBA_PREFIX } from './tajriba-paket';

const OUT = process.env.TAJRIBA_OUT;
const DB = process.env.TAJRIBA_DB_JSONL;

describe.skipIf(!OUT)('tajriba indeksi: lokal qurish', () => {
  it('builds the global + company layers through the nightly code path', async () => {
    const { obyektlar, birlashtirildi } = lokalObyektlar({ dbJsonl: DB });
    const ids = new Map(obyektlar.map((o, i) => [o.id, i + 1]));
    const iso = (t: number) => new Date((t || 1_767_225_600) * 1000 + (0)).toISOString();
    const jadval = [...obyektlar].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1)).map((o, i) => ({ o, yangilandi: new Date(Date.parse(iso(o.t)) + i * 1000).toISOString() }));
    const r2 = new Map<string, Uint8Array>();
    const d: TajribaDeps = {
      async rpc(nom, args) {
        if (nom === 't2_tajriba_ozgargan_obyektlar_v1') return jadval.filter(x => x.yangilandi > String(args.p_vaqt)).slice(0, Number(args.p_limit))
          .map(x => ({ kompaniya_id: Number(x.o.kompaniya.replace(/\D/g, '')) || 1, obyekt_id: ids.get(x.o.id), yangilandi: x.yangilandi }));
        if (nom === 't2_tajriba_obyekt_qatorlar_v1') return obyektlar.find(o => ids.get(o.id) === args.p_obyekt_id)!.qatorlar.map(q => ({ kod: q.kod, nom: q.nom, birlik: q.birlik, bolim: q.bolim }));
        if (nom === 't2_tajriba_tanlovlar_v1') return [];
        throw new Error(nom);
      },
      r2: { async get(k) { return r2.get(k) ?? null; }, async put(k, b) { r2.set(k, b); } },
    };
    let r: Awaited<ReturnType<typeof tajribaTickIsh>>, n = 0;
    do { r = await tajribaTickIsh(d, new Date(), { majbur: true, obyektPartiya: 20 }); n++; } while (r.qoldi && n < 50);
    expect(r.ok).toBe(true);
    const objects: Array<{ key: string; file: string; sha256: string; bytes: number; kind: string }> = [];
    for (const [k, b] of r2) {
      const file = path.join(OUT!, ...k.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, b);
      const kind = k.endsWith('manifest.json.gz') ? 'manifest' : /holat|state/.test(k) ? 'state' : 'shard';
      objects.push({ key: k, file, sha256: createHash('sha256').update(b).digest('hex'), bytes: b.length, kind });
    }
    fs.writeFileSync(path.join(OUT!, 'upload-manifest.json'), JSON.stringify({ prefix: TAJRIBA_PREFIX, objects }, null, 2), 'utf8');
    const jami = objects.reduce((a, o) => a + o.bytes, 0), served = objects.filter(o => o.kind !== 'state').reduce((a, o) => a + o.bytes, 0);
    fs.writeFileSync(path.join(OUT!, 'qurish_stat.json'), JSON.stringify({ obyekt: obyektlar.length, birlashtirildi, tick: r, fayl: objects.length, bayt_jami: jami, bayt_serve: served }, null, 2), 'utf8');
    console.log(JSON.stringify({ obyekt: obyektlar.length, birlashtirildi, fayl: objects.length, bayt_jami: jami, bayt_serve: served, tick: r }));
  }, 600_000);
});
