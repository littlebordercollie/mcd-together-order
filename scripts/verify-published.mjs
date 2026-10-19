import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { prompts } from "./audio-prompts.mjs";
const base = "https://littlebordercollie.github.io/mcd-together-order/";
const report = { at: new Date().toISOString(), url: base, checks: [] };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  report.checks.push("公开页面 HTTP 200");
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("html").getAttribute("data-build"), "static");
  assert.match(await page.locator("h1").innerText(), /让我慢慢选/);
  report.checks.push("静态演示标记及首页标题正确");
  const html = await response.body();
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    createHash("sha256")
      .update(await readFile("dist/index.html"))
      .digest("hex"),
  );
  report.checks.push("公开 HTML 与本机构建字节一致");
  const assets = (await readdir("dist")).filter((name) =>
    /\.(js|css)$/.test(name),
  );
  for (const name of assets) {
    const response = await page.request.get(new URL(name, base).href);
    assert.equal(response.status(), 200, name);
    assert.equal(
      createHash("sha256")
        .update(await response.body())
        .digest("hex"),
      createHash("sha256")
        .update(await readFile(`dist/${name}`))
        .digest("hex"),
      `Published asset differs: ${name}`,
    );
  }
  report.checks.push(
    `公开脚本和样式与本机构建逐字节一致（${assets.length} 个文件）`,
  );
  for (const key of Object.keys(prompts)) {
    const path = `assets/audio/minimax/${key}.mp3`;
    const response = await page.request.get(new URL(path, base).href);
    assert.equal(response.status(), 200, path);
    assert.equal(
      createHash("sha256")
        .update(await response.body())
        .digest("hex"),
      createHash("sha256")
        .update(await readFile(`dist/${path}`))
        .digest("hex"),
      path,
    );
  }
  report.checks.push(
    `公开 MiniMax 录音与本地生成文件逐字节一致（${Object.keys(prompts).length} 条）`,
  );
  await page.getByRole("button", { name: "开始一起点", exact: true }).click();
  await page.getByRole("button", { name: "准备好了，交给孩子" }).click();
  await page.getByRole("button", { name: "选择麦香鸡", exact: true }).click();
  await page.getByRole("button", { name: "小食", exact: true }).click();
  await page
    .getByRole("button", { name: "选择薯条（中）", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator(".mobile-traybar").isVisible());
  report.checks.push("公开页面手机餐盘可见");
  await page
    .getByRole("button", { name: "我选好了", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "交给家长确认" }).click();
  await page.getByRole("button", { name: "查看示例金额" }).click();
  assert.ok((await page.locator(".total").innerText()).includes("27.00"));
  await page.locator("#parent-confirm").check();
  await page.locator("#order-button").click();
  assert.match(await page.locator("main").innerText(), /没有创建订单或扣款/);
  report.checks.push("公开页面完成选餐、核价、交接流程");
  assert.ok(
    await page
      .locator("img")
      .evaluateAll((xs) => xs.every((x) => x.complete && x.naturalWidth > 0)),
  );
  assert.equal(errors.length, 0);
  report.checks.push("餐品图片加载且无脚本异常");
  const sound = await page.evaluate(async () => {
    const audio = new Audio("assets/audio/minimax/chicken.mp3");
    await audio.play();
    const result = { duration: audio.duration, playing: !audio.paused };
    audio.pause();
    return result;
  });
  assert.ok(sound.duration > 0 && sound.playing);
  report.checks.push("公开网页语音实际播放");
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(
    "docs/published-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report, null, 2));
