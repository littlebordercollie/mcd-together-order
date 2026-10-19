import { prompts } from "./audio-prompts.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const report = {
  at: new Date().toISOString(),
  base: process.env.TEST_URL || "http://127.0.0.1:3741",
  checks: [],
  screenshots: [],
  errors: [],
};
const check = (name, value) => {
  assert.ok(value, name);
  report.checks.push(name);
};
await mkdir("test-results", { recursive: true });
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [device, width, height] of [
    ["desktop", 1366, 900],
    ["tablet", 820, 1180],
    ["mobile", 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) =>
      report.errors.push({ device, error: e.message }),
    );
    await page.addInitScript(() => {
      window.__played = [];
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        this.addEventListener(
          "playing",
          () =>
            window.__played.push({
              src: this.currentSrc,
              duration: this.duration,
            }),
          { once: true },
        );
        return original.call(this);
      };
    });
    const state = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("together-order-v1")),
      );
    const snap = async (name) => {
      await page
        .locator("#notice")
        .evaluate((el) => el.classList.remove("visible"));
      await page.screenshot({
        path: `docs/screenshots/${name}-${device}.png`,
        fullPage: true,
      });
      report.screenshots.push(`${name}-${device}.png`);
      check(
        `${device}/${name}: 无横向溢出`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      check(
        `${device}/${name}: 图片实际加载`,
        await page
          .locator("img")
          .evaluateAll((imgs) =>
            imgs.every((i) => i.complete && i.naturalWidth > 0),
          ),
      );
    };
    await page.goto(report.base);
    await page.waitForLoadState("networkidle");
    await snap("welcome");
    await page.getByRole("button", { name: "开始一起点", exact: true }).click();
    await snap("prepare");
    await page.locator('[data-action="hide"][data-id="demo-bigmac"]').click();
    check(
      `${device}: 家长可收起餐品`,
      (await state()).hidden.includes("demo-bigmac"),
    );
    await page.locator('[data-action="hide"][data-id="demo-bigmac"]').click();
    await page.getByRole("button", { name: "准备好了，交给孩子" }).click();
    await page.waitForFunction(() => window.__played.length > 0);
    check(`${device}: 开场提示真实触发 playing`, true);
    await page.locator('[data-product="demo-fish"] [data-listen]').click();
    await page.waitForFunction(() =>
      window.__played.some((x) => x.src.includes("/fish.mp3")),
    );
    check(
      `${device}: 听餐品语音没有选择或加数量`,
      Object.keys((await state()).basket).length === 0,
    );
    await page.getByRole("button", { name: "选择麦香鸡", exact: true }).click();
    await page
      .getByRole("button", { name: "已选麦香鸡", exact: true })
      .click({ clickCount: 2 });
    check(
      `${device}: 双击已选餐品仍为一份`,
      (await state()).basket["demo-chicken"] === 1,
    );
    const beforeAudio = JSON.stringify((await state()).basket);
    await page.locator('[data-product="demo-chicken"] [data-listen]').click();
    check(
      `${device}: 重复听不改选择`,
      JSON.stringify((await state()).basket) === beforeAudio,
    );
    await page.getByRole("button", { name: "换一组", exact: false }).click();
    check(
      `${device}: 换组保留原选择`,
      (await state()).basket["demo-chicken"] === 1,
    );
    await page.getByRole("button", { name: "换一组", exact: false }).click();
    await page.getByRole("button", { name: "不要麦香鸡", exact: true }).click();
    check(`${device}: 取消即时生效`, !(await state()).basket["demo-chicken"]);
    await page.getByRole("button", { name: "选择麦香鸡", exact: true }).click();
    await page.reload();
    check(
      `${device}: 刷新继续原选择`,
      (await state()).basket["demo-chicken"] === 1,
    );
    await snap("choose");
    if (device === "mobile")
      check(
        "mobile: 固定餐盘条在可见视窗内",
        await page.locator(".mobile-traybar").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.y >= 0 && r.bottom <= innerHeight + 1;
        }),
      );
    await page.getByRole("button", { name: "找家长", exact: true }).click();
    check(`${device}: 求助弹窗可见`, await page.locator("dialog").isVisible());
    await page.getByRole("button", { name: "我继续选", exact: true }).click();
    check(
      `${device}: 求助返回保留选择`,
      (await state()).basket["demo-chicken"] === 1,
    );
    await page.getByRole("button", { name: "小食", exact: true }).click();
    await page
      .getByRole("button", { name: "选择薯条（中）", exact: true })
      .click();
    await page.getByRole("button", { name: "饮品", exact: true }).click();
    await page
      .getByRole("button", { name: "选择冰露饮用水", exact: true })
      .click();
    await page
      .getByRole("button", { name: "我选好了", exact: true })
      .first()
      .click();
    await snap("recap");
    await page.getByRole("button", { name: "交给家长确认" }).click();
    await page
      .getByRole("button", { name: "查看示例金额", exact: true })
      .click();
    check(
      `${device}: 演示核价总额正确`,
      (await state()).quote.totalFen === 3500,
    );
    check(
      `${device}: 没有家长确认不能完成`,
      await page.locator("#order-button").isDisabled(),
    );
    await page.getByRole("button", { name: "增加麦香鸡", exact: true }).click();
    check(`${device}: 修改数量清除旧报价`, (await state()).quote === null);
    check(
      `${device}: 孩子原始选择没有被覆盖`,
      (await state()).original["demo-chicken"] === 1,
    );
    check(
      `${device}: 修改记录可见`,
      await page.locator(".changes").isVisible(),
    );
    await page.getByRole("button", { name: "减少麦香鸡", exact: true }).click();
    await page
      .getByRole("button", { name: "查看示例金额", exact: true })
      .click();
    await snap("review");
    await page.locator("#parent-confirm").check();
    check(
      `${device}: 勾选后才可完成`,
      await page.locator("#order-button").isEnabled(),
    );
    await page.locator("#order-button").click();
    check(`${device}: 演示没有创建订单`, (await state()).order === null);
    check(
      `${device}: 完成页明确没有扣款`,
      (await page.locator("main").innerText()).includes("没有创建订单或扣款"),
    );
    await snap("done");
    // Actual audio event check on every shipped prompt, without adding choices.
    if (device === "desktop") {
      const sounds = Object.keys(prompts);
      const played = await page.evaluate(async (keys) => {
        const out = [];
        for (const key of keys) {
          const audio = new Audio(`assets/audio/minimax/${key}.mp3`);
          await new Promise((resolve, reject) => {
            audio.addEventListener(
              "playing",
              () => {
                out.push({ key, duration: audio.duration });
                audio.pause();
                resolve();
              },
              { once: true },
            );
            audio.onerror = () => reject(new Error(key));
            audio.play().catch(reject);
          });
        }
        return out;
      }, sounds);
      check(
        `${sounds.length} 个 MiniMax 音频均真实触发 playing 且有有效时长`,
        played.length === sounds.length && played.every((x) => x.duration > 0),
      );
      report.audio = played;
    }
    await page.getByRole("button", { name: "再体验一次", exact: true }).click();
    await page.getByRole("button", { name: "准备好了，交给孩子" }).click();
    await page.getByRole("button", { name: "这次先不选", exact: true }).click();
    await page
      .locator("dialog")
      .getByRole("button", { name: "这次先不选", exact: true })
      .click();
    await page.getByRole("button", { name: "交给家长确认" }).click();
    await page
      .getByRole("button", { name: "知道了，这次先不买", exact: true })
      .click();
    check(
      `${device}: 什么都不选也能完成沟通且不创建订单`,
      (await page.locator("main").innerText()).includes(
        "这一餐先不买，没有创建订单",
      ),
    );
    await context.close();
  }
  check("所有流程没有浏览器脚本异常", report.errors.length === 0);
  const health = await fetch(`${report.base}/api/config`)
    .then((r) => r.json())
    .catch(() => null);
  if (health?.csrf) {
    const denied = await fetch(`${report.base}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    check("缺少页面凭证时拒绝订单请求", denied.status === 400);
  }
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(
    "test-results/browser-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  `Browser checks passed: ${report.checks.length}; screenshots: ${report.screenshots.length}; audio: ${report.audio.length}`,
);
