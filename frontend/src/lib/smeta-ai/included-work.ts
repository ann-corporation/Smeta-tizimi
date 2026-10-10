import type { EstimateDoc } from '../smeta-studio/model';
import { foundationReference } from './normative-reference';

type Proposal = { id: string; bolim: string; tavsif: string; tanlangan: { kod: string; nom: string } | null };
export type IncludedWorkReview = { code: string; document: string; url: string; page: number };

// Fabrication and removal alone are deliberately excluded: the audited table does not prove them.
function installation(text: string): boolean {
  return /(?:armatur|арматур|qolip|opalub|опалуб)/i.test(text)
    && /(?:o[‘'’]?rnat|(?:^|[^a-zа-яё])montaj|установ|(?:^|[^а-яё])монтаж)/i.test(text);
}

/** Potential overlap requires review, not automatic deletion or an assumed catalogue edition. */
export function includedWorkReviews(proposals: Proposal[], doc?: EstimateDoc): Map<string, IncludedWorkReview> {
  const section = (s: string) => s.trim().toLowerCase() || 'asosiy';
  const rows = [
    ...proposals.map(p => ({ id: p.id, section: section(p.bolim), code: p.tanlangan?.kod ?? '', text: `${p.tavsif} ${p.tanlangan?.nom ?? ''}`, proposed: true })),
    ...Object.values(doc?.occurrences ?? {}).map(o => ({ id: o.id, section: section(doc!.sections[o.sectionId]?.name ?? ''), code: o.source.code, text: o.source.name ?? '', proposed: false })),
  ];
  const reviews = new Map<string, IncludedWorkReview>();
  for (const foundation of rows) {
    const ref = foundationReference(foundation.code);
    if (!ref) continue;
    for (const separate of rows) {
      if (separate === foundation || separate.section !== foundation.section || !installation(separate.text)) continue;
      // A second composite foundation is not a standalone installation position.
      if (foundationReference(separate.code)) continue;
      const proof = { code: foundation.code, document: ref.document, url: ref.url, page: ref.pdfPage };
      if (separate.proposed) reviews.set(separate.id, proof);
      if (foundation.proposed) reviews.set(foundation.id, proof);
    }
  }
  return reviews;
}
