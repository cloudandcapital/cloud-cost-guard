import { parseLumenMessage } from "./lumenMessage";

describe("Lumen message formatting", () => {
  test("parses headings without exposing Markdown markers", () => {
    const blocks = parseLumenMessage("# Summary\n## Detail\n### Note");
    expect(blocks.map((block) => block.type)).toEqual(["heading", "heading", "heading"]);
    expect(blocks.map((block) => block.runs[0].text)).toEqual(["Summary", "Detail", "Note"]);
  });

  test("parses bold text as structured runs", () => {
    expect(parseLumenMessage("Cloud spend is **$33,479.45**." )[0].runs).toEqual([
      { text: "Cloud spend is ", bold: false },
      { text: "$33,479.45", bold: true },
      { text: ".", bold: false },
    ]);
  });

  test("groups hyphen bullets into an unordered list", () => {
    const blocks = parseLumenMessage("- Review EC2\n- Confirm the owner");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("list");
    expect(blocks[0].items.map((item) => item[0].text)).toEqual(["Review EC2", "Confirm the owner"]);
  });

  test("keeps ordinary paragraphs as paragraphs", () => {
    const blocks = parseLumenMessage("First paragraph.\nStill first.\n\nSecond paragraph.");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
    expect(blocks[0].runs[0].text).toBe("First paragraph. Still first.");
  });
});
