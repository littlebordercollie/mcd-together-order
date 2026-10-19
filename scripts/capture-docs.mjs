import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url() === "https://open.mcd.cn/mcp/doc");
  if (!page) throw new Error("Missing own docs tab");
  const text = await page.locator("body").innerText();
  await writeFile(".local/official-docs.txt", text);
  console.log("Official docs saved:", text.length, "characters");
  for (const title of [
    "4.2.6 查询附近可用门店",
    "4.2.13 查询订单详情",
    "4.2.14 查询历史订单",
  ]) {
    const start = text.lastIndexOf(title);
    console.log(text.slice(start, start + 3500));
  }
} finally {
  await browser.close();
}
