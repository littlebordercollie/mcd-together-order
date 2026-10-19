import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await page.goto("http://127.0.0.1:3741");
  async function inspect(name) {
    await page.screenshot({
      path: `test-results/${name}-360.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name + " overflow",
    );
    report.push({
      name,
      headings: await page.locator("h1,h2,h3,.hero-sub").evaluateAll((els) =>
        els.map((el) => {
          const chars = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            for (let i = 0; i < node.textContent.length; i++) {
              const range = document.createRange();
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              const r = range.getBoundingClientRect();
              if (r.width)
                chars.push({ y: Math.round(r.y), text: node.textContent[i] });
            }
          }
          const lines = [];
          for (const c of chars) {
            const line = lines.find((l) => Math.abs(l.y - c.y) < 3);
            if (line) line.text += c.text;
            else lines.push({ ...c });
          }
          return { tag: el.tagName, lines: lines.map((l) => l.text) };
        }),
      ),
    });
  }
  await inspect("welcome");
  await page.getByRole("button", { name: "开始一起点", exact: true }).click();
  await inspect("prepare");
  await page.getByRole("button", { name: "准备好了，交给孩子" }).click();
  await page.getByRole("button", { name: "选择麦香鸡", exact: true }).click();
  await inspect("choose");
  await page
    .getByRole("button", { name: "我选好了", exact: true })
    .first()
    .click();
  await inspect("recap");
  await page.getByRole("button", { name: "交给家长确认" }).click();
  await page.getByRole("button", { name: "查看示例金额" }).click();
  await inspect("review");
} finally {
  await browser.close();
  await writeFile(
    "test-results/semantic-lines-360.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report, null, 2));
