import { kitobAnatomiyasi, type KitobAnatomiyasi } from '../smeta-anatomiya';
import { f2AktlarniOqi, type F2Akt } from '../smeta-anatomiya/f2';
import type { KirishKitob } from '../smeta-anatomiya/turlar';
import type { WorkbookEvidence } from './evidence';
import { triageUnassignedRows, type SourceRowCandidate } from './triage';

export * from './evidence';
export interface DocumentUnderstanding extends WorkbookEvidence {
  source: KirishKitob;
  anatomy: KitobAnatomiyasi;
  f2: F2Akt[];
  unassignedCandidates: SourceRowCandidate[];
}

/** Lossless snapshot and existing canonical parsers; never a business write. */
export function understandWorkbook(input: KirishKitob): DocumentUnderstanding {
  const source = structuredClone(input);
  const anatomy = kitobAnatomiyasi(source);
  const f2 = f2AktlarniOqi(source);
  return { ...anatomy.sourceEvidence, source, anatomy, f2, unassignedCandidates: triageUnassignedRows(anatomy.sourceEvidence) };
}
