import { formatCompactCurrencyTick } from "./chartFormat";

test("formats distinct readable currency ticks", () => {
  expect([0, 400, 800, 1200].map(formatCompactCurrencyTick)).toEqual(["$0", "$400", "$800", "$1.2k"]);
});
