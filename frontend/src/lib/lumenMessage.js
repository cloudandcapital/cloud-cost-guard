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
  let tableLines = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", runs: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length) blocks.push({ type: "list", items: listItems.map(parseInline) });
    listItems = [];
  };
  const flushTable = () => {
    if (tableLines.length >= 2) {
      const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const headers = cells(tableLines[0]);
      const separator = cells(tableLines[1]).every((cell) => /^:?-{3,}:?$/.test(cell));
      const rows = (separator ? tableLines.slice(2) : tableLines.slice(1)).map(cells);
      blocks.push({
        type: "table",
        rows: rows.map((row) => headers.map((header, index) => ({
          label: parseInline(header),
          value: parseInline(row[index] || "—"),
        }))),
      });
    }
    tableLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const tableRow = /^\|.*\|$/.test(line);
    if (!line) {
      flushParagraph();
      flushList();
      flushTable();
    } else if (tableRow) {
      flushParagraph();
      flushList();
      tableLines.push(line);
    } else if (/^-{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      flushTable();
    } else if (heading) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({ type: "heading", level: Math.min(heading[1].length, 3), runs: parseInline(heading[2]) });
    } else if (bullet) {
      flushParagraph();
      flushTable();
      listItems.push(bullet[1]);
    } else {
      flushList();
      flushTable();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  flushTable();
  return blocks;
}
