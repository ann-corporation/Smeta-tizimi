import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Muhit } from './muhit';
import { toolChaqir, type ToolTarif } from './tool';
import { f2Import } from './tools/f2-import';
import { f2, f2Royxat, obyektHolat, obyektlar, pereraschet, qator, qatorQidir } from './tools/obyekt';
import { aktor, aktorTanla, sqlOqish, sxema } from './tools/oqish';
import { faktQamrov } from './tools/qamrov';
import { snapshotFarq, snapshotOl, snapshotQaytar, snapshotRoyxat } from './tools/snapshot';
import { qatorOchir, qatorQosh, qatorTahrir, rpc, sqlYozish } from './tools/yozish';

export const VERSIYA = '0.1.0';

export const TOOLLAR: ToolTarif[] = [
  // o'qish
  sqlOqish, sxema, aktor, aktorTanla, obyektlar, obyektHolat, qator, qatorQidir, f2Royxat, f2, pereraschet,
  snapshotRoyxat, snapshotFarq,
  // yozish (snapshot + audit + dry_run)
  rpc, faktQamrov, f2Import, qatorTahrir, qatorQosh, qatorOchir, sqlYozish, snapshotOl, snapshotQaytar,
];

export function serverYasa(mu: Muhit): McpServer {
  const s = new McpServer({ name: 'smeta', version: VERSIYA }, {
    instructions: 'Smeta tizimi (T2) bazasi bilan to\'g\'ridan-to\'g\'ri ishlash. Pul: NDS siz; ustamasiz + ustamali (ИТОГО-4), NDS alohida; null — noma\'lum (0 emas). '
      + 'Yozuvchi toollar avtomatik snapshot oladi (snapshot sxemasi bo\'lsa), bazaga audit yozadi; dry_run:true — preview + ROLLBACK. '
      + 'RPC aktori: SMETA_AKTOR_ID yoki aktor_tanla. Sxema: `sxema` tooli.',
  });
  for (const t of TOOLLAR) {
    s.registerTool(t.nom, {
      description: t.tavsif + (t.yozadi ? ' [YOZADI]' : ' [faqat o\'qish]'),
      inputSchema: t.kirish,
      annotations: { readOnlyHint: !t.yozadi, destructiveHint: t.yozadi, openWorldHint: false },
    }, async (args: unknown) => toolChaqir(t, mu, args));
  }
  return s;
}
