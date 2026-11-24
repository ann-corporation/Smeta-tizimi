type Part = { ref: string; text: string };
function parts(answer: string, result: number): Part[] {
  let size = 0;
  return answer.split(/\r?\n[\t ]*\r?\n/).flatMap((text, paragraph): Part[] => {
    if (!text.trim() || size + text.length > 1800) return [];
    size += text.length;
    return [{ ref: `r${result}p${paragraph}`, text }];
  });
}

/** Model context uses whole source paragraphs, not clipped numbers. Canonical evidence remains unchanged. */
export function toolEvidence<T extends { javob: string }>(results: readonly T[]) {
  return results.map(({ javob, ...metadata }, result) => {
    const offered = parts(javob, result);
    return { ...metadata, javob_parts: offered, excerpt_omitted: offered.map(part => part.text).join('\n\n') !== javob };
  });
}

/** The model selects references; the server renders exact source values, labels, units and signs. */
export function toolSummary(raw: string, evidence: string | readonly string[]): string | null {
  try {
    const value = JSON.parse(raw) as { javob?: unknown; tool_call?: unknown; summary_refs?: unknown };
    if (value.tool_call != null || typeof value.javob !== 'string' || !Array.isArray(value.summary_refs) ||
        value.summary_refs.length < 1 || value.summary_refs.length > 4 || new Set(value.summary_refs).size !== value.summary_refs.length) return null;
    const answers = typeof evidence === 'string' ? [evidence] : evidence;
    const source = new Map(answers.flatMap(parts).map(part => [part.ref, part.text]));
    const selected: string[] = [];
    for (const ref of value.summary_refs) {
      if (typeof ref !== 'string' || !source.has(ref)) return null;
      selected.push(source.get(ref)!);
    }
    const summary = selected.join('\n\n');
    return summary.length <= 1200 ? summary : null;
  } catch { return null; }
}
