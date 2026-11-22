import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KORSATMA } from './korsatma';
import type { Muhit } from './muhit';
import { toolChaqir, type ToolTarif } from './tool';
import { f2Import } from './tools/f2-import';
import { HUJJAT_TOOLLAR } from './tools/hujjat';
import { HUJJAT_PAKET_TOOLLAR } from './tools/hujjat-paket';
import { bajarilmadi, f2Holat, f2QoralamaTahrir, f2QoralamaYarat, faktYoz, narxTuzat, podvalTahrir, qoshimchaIsh, yoyilma } from './tools/ish-oqimi';
import { f2Jami } from './tools/jami';
import { minusFakt } from './tools/minus-fakt';
import { f2, f2Royxat, obyektHolat, obyektlar, pereraschet, qator, qatorQidir } from './tools/obyekt';
import { aktor, aktorTanla, sqlOqish, sxema } from './tools/oqish';
import { aktBekor, f2QoralamaYangila, f2Yarat, faktJurnal, forma3, ishOchir, nakopitelniy, normativQidir, ostatka, shartnomaMoslash, slichitelniy, zamenaQosh } from './tools/pto';
import { faktQamrov } from './tools/qamrov';
import { snapshotFarq, snapshotOl, snapshotQaytar, snapshotRoyxat } from './tools/snapshot';
import { TRANSPORT_TOOLLAR } from './tools/transport';
import { qatorOchir, qatorQosh, qatorTahrir, rpc, sqlYozish } from './tools/yozish';

export const VERSIYA = '0.2.0';

export const TOOLLAR: ToolTarif[] = [
  // o'qish
  sqlOqish, sxema, aktor, aktorTanla, obyektlar, obyektHolat, qator, qatorQidir, f2Royxat, f2, f2Jami, pereraschet,
  snapshotRoyxat, snapshotFarq, yoyilma,
  // yozish (snapshot + audit + dry_run)
  rpc, faktQamrov, f2Import, qatorTahrir, qatorQosh, qatorOchir, sqlYozish, snapshotOl, snapshotQaytar,
  // ish oqimlari (dry_run standart true)
  f2QoralamaYarat, f2Holat, f2QoralamaTahrir, podvalTahrir, narxTuzat, bajarilmadi, qoshimchaIsh, faktYoz, minusFakt,
  // PTO qamrovi v1 (o'qish: nakopitelniy, ostatka, shartnoma_moslash, fakt_jurnal, normativ_qidir; yozish — dry_run standart true)
  nakopitelniy, ostatka, shartnomaMoslash, faktJurnal, normativQidir, slichitelniy,
  zamenaQosh, ishOchir, f2QoralamaYangila, f2Yarat, aktBekor, forma3,
  // Rasmiy hujjat (f2_excel: sayt dvigateli, token, Disk)
  ...HUJJAT_TOOLLAR,
  ...HUJJAT_PAKET_TOOLLAR,
  // Transport auditi (transport_tekshir: material boshiga bitta usul; faqat o'qish)
  ...TRANSPORT_TOOLLAR,
];

export function serverYasa(mu: Muhit): McpServer {
  const s = new McpServer({ name: 'smeta', version: VERSIYA }, { instructions: KORSATMA });
  for (const t of TOOLLAR) {
    s.registerTool(t.nom, {
      description: t.tavsif + (t.yozadi ? ' [YOZADI]' : ' [faqat o\'qish]'),
      inputSchema: t.kirish,
      annotations: { readOnlyHint: !t.yozadi, destructiveHint: t.yozadi, openWorldHint: false },
    }, async (args: unknown) => toolChaqir(t, mu, args));
  }
  return s;
}
