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

  test("converts a complete Markdown table into pipe-free stacked content", () => {
    const blocks = parseLumenMessage(
      "Summary paragraph.\n\n| Issue | Est. Monthly Opportunity |\n| --- | ---: |\n| **EBS volumes** | **$284.40** |\n| Untagged spend | $9,039.45 allocation gap |\n\nClosing paragraph."
    );
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "table", "paragraph"]);
    expect(blocks[1].rows).toHaveLength(2);
    expect(blocks[1].rows[0][0].label[0].text).toBe("Issue");
    expect(blocks[1].rows[0][0].value).toEqual([{ text: "EBS volumes", bold: true }]);
    expect(blocks[1].rows[0][1].value).toEqual([{ text: "$284.40", bold: true }]);
    expect(JSON.stringify(blocks)).not.toMatch(/\||---|##/);
  });
});
