const LIMIT = 3500;

/** Every source character is delivered once; the final message retains the conversation controls. */
export function telegramJarvisDelivery(body: string, guide: string): { matn: string; transcript?: string[] } {
  if (!body || body.length + guide.length + 2 <= LIMIT) return { matn: body ? `${guide}\n\n${body}` : guide };
  const transcript: string[] = [];
  for (let start = 0; start < body.length;) {
    let end = Math.min(start + LIMIT, body.length);
    if (end < body.length) {
      const line = body.lastIndexOf('\n', end - 1) + 1;
      const space = body.lastIndexOf(' ', end - 1) + 1;
      if (line > start + LIMIT / 2) end = line;
      else if (space > start + LIMIT / 2) end = space;
      // Telegram limits are in UTF-16 units. Do not divide an emoji's surrogate pair.
      const last = body.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end--;
    }
    transcript.push(body.slice(start, end));
    start = end;
  }
  return { matn: guide, transcript };
}
