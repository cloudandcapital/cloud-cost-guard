function parseInline(text) {
  const runs = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), bold: false });
    runs.push({ text: match[1], bold: true });
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), bold: false });
  return runs.length ? runs : [{ text, bold: false }];
}

export function parseLumenMessage(input) {
  const lines = String(input || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let listItems = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", runs: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length) blocks.push({ type: "list", items: listItems.map(parseInline) });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: Math.min(heading[1].length, 3), runs: parseInline(heading[2]) });
    } else if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
