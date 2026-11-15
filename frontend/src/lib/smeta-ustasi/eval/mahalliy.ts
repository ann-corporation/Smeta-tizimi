/**
 * Eval — faqat Node (lokal, oflayn). Keys papkalarini O'QIYDI va hisobotni shu papkaga (repodan TASHQARIDA) yozadi.
 *
 *   <eval-papka>/<keys>/input.txt        — foydalanuvchi matni (erkin tavsif)
 *   <eval-papka>/<keys>/case.json        — { "smeta": "<tasdiqlangan smeta fayli, nisbiy yoki mutlaq>", "hosil": "hosil.json"? }
 *                                          (case.json bo'lmasa: papkadagi birinchi .xlsx/.xls)
 *   <eval-papka>/<keys>/hosil.json       — ixtiyoriy: [{ "kod": "...", "summa": 123 }] — ustasi quvuri natijasi (recall / jami uchun)
 *   <eval-papka>/katalog.json            — ixtiyoriy soxta katalog (fixture); aks holda --katalog <norm-library reliz papkasi>
 *
 * Maxfiylik: ma'lumot repoga, testga, commit'ga va tashqi model so'roviga tushmaydi; model chaqirilmaydi.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { kitobAnatomiyasi } from '../../smeta-anatomiya';
import { faylniOqi } from '../../smeta-anatomiya/korpus/oqish';
import { NormLibraryCatalog } from '../../catalog-extraction/norm-library';
import type { AiKatalog } from '../../smeta-ai/worker';
import { hisobotMd, keysniBaholash, sodaKatalog, yigish, type Keys, type SodaIsh } from './baholash';

const oqi = (p: string) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
export const SUKUT_PAPKA = 'D:\\BOG_MIYASI\\ESLATMA_EVAL\\';

/** Tasdiqlangan smetadan kutilgan ishlar: smetaAnatomiya asosiy LRV varag'i (parallel parser yo'q). */
export function kutilganIshlar(smetaFayl: string) {
  const kitob = faylniOqi(smetaFayl, path.dirname(smetaFayl));
  const a = kitobAnatomiyasi(kitob);
  const varaqlar = a.asosiyLrv ? a.varaqlar.filter(v => v.varaq === a.asosiyLrv) : a.varaqlar.filter(v => v.rol === 'lrv');
  return varaqlar.flatMap(v => v.ishlar).map(i => ({ shifr: i.shifr, nom: i.xom, birlik: i.birlik, summa: i.summa }));
}

export function keyslarniOqi(papka: string): Keys[] {
  const out: Keys[] = [];
  for (const d of fs.readdirSync(papka, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(papka, d.name);
    const inputP = path.join(dir, 'input.txt');
    if (!fs.existsSync(inputP)) continue;
    const casep = path.join(dir, 'case.json');
    const cfg: { smeta?: string; hosil?: string } = fs.existsSync(casep) ? JSON.parse(oqi(casep)) : {};
    const smetaRel = cfg.smeta ?? fs.readdirSync(dir).find(f => /\.xlsx?$/i.test(f));
    if (!smetaRel) throw new Error(`KEYS_SMETA_YOQ: ${d.name}`);
    const hosilP = path.resolve(dir, cfg.hosil ?? 'hosil.json');
    out.push({ nom: d.name, matn: oqi(inputP), kutilgan: kutilganIshlar(path.resolve(dir, smetaRel)),
      ...(fs.existsSync(hosilP) ? { hosil: JSON.parse(oqi(hosilP)) } : {}) });
  }
  return out;
}

/** norm-library reliz papkasi (manifest.json, navigation.json, works.jsonl.gz, collection-NNN.json.gz) ustida fayl fetcher. */
export async function relizKatalogi(papka: string): Promise<AiKatalog> {
  const fetcher = async (url: string) => {
    const f = new URL(url, 'http://local').searchParams.get('f') ?? '';
    const p = path.resolve(papka, f);
    if (!/^[\w.-]+$/.test(f) || !p.startsWith(path.resolve(papka)) || !fs.existsSync(p)) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(fs.readFileSync(p)), { status: 200 });
  };
  return (await NormLibraryCatalog.open(fetcher, 'http://local/api/norm-library')) as unknown as AiKatalog;
}

export type EvalOpsiya = { papka: string; katalog?: string; chiqish?: string; sana?: string };

export async function evalIshga(o: EvalOpsiya) {
  const katalogP = o.katalog ?? process.env.NORM_LIBRARY_FIXTURE_ROOT;
  const sodaP = path.join(o.papka, 'katalog.json');
  let katalog: AiKatalog, katalogNomi: string;
  if (katalogP) { katalog = await relizKatalogi(katalogP); katalogNomi = 'norm-library reliz (lokal papka)'; }
  else if (fs.existsSync(sodaP)) { katalog = sodaKatalog(JSON.parse(oqi(sodaP)) as SodaIsh[]); katalogNomi = 'soxta katalog.json (fixture)'; }
  else throw new Error('KATALOG_YOQ: --katalog <norm-library reliz papkasi> yoki NORM_LIBRARY_FIXTURE_ROOT bering (tarmoq/DB ishlatilmaydi)');
  const keyslar = keyslarniOqi(o.papka);
  const natijalar = keyslar.map(k => keysniBaholash(k, katalog));
  const yig = yigish(natijalar);
  const sana = o.sana ?? new Date().toISOString().slice(0, 10);
  const md = hisobotMd(natijalar, yig, { sana, katalog: katalogNomi });
  const chiqish = o.chiqish ?? o.papka;
  fs.mkdirSync(chiqish, { recursive: true });
  const nom = `hisobot_${sana}`;
  // JSON'ga ish nomlari ham tushadi (maxfiy): u FAQAT shu lokal eval papkasida qoladi.
  fs.writeFileSync(path.join(chiqish, `${nom}.json`), JSON.stringify({ sana, katalog: katalogNomi, yigindi: yig, keyslar: natijalar }, null, 2));
  fs.writeFileSync(path.join(chiqish, `${nom}.md`), md);
  return { natijalar, yigindi: yig, md, fayllar: [`${nom}.json`, `${nom}.md`] };
}
