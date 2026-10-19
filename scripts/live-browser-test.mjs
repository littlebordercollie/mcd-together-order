import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:3741";
const report = {
  at: new Date().toISOString(),
  base,
  scenario: "北京回龙观地铁站，到店自取，只读联调",
  checks: [],
  errors: [],
  screenshots: [],
  transactionRequests: 0,
};
const check = (name, value) => {
  assert.ok(value, name);
  report.checks.push(name);
};
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
let prepared;
try {
  for (const mobile of [false, true]) {
    const device = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1366, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) =>
      report.errors.push({ device, message: e.message }),
    );
    await page.route("**/api/order", (route) => {
      report.transactionRequests++;
      return route.abort();
    });
    await page.addInitScript(() => {
      window.__played = [];
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        this.addEventListener(
          "playing",
          () => window.__played.push(this.currentSrc.split("/").pop()),
          { once: true },
        );
        return original.call(this);
      };
    });
    if (mobile)
      await page.addInitScript(
        (s) => localStorage.setItem("together-order-v1", JSON.stringify(s)),
        prepared,
      );
    await page.goto(base);
    if (!mobile) {
      await page
        .getByRole("button", { name: "连接真实门店", exact: true })
        .click();
      await page.locator('[name="city"]').fill("北京");
      await page.locator('[name="keyword"]').fill("回龙观地铁站");
      await page.getByRole("button", { name: "查询附近餐厅" }).click();
      await page
        .locator('[data-action="store"][data-id="1950147"]')
        .click({ timeout: 30000 });
      await page.locator(".prepare-grid").waitFor({ timeout: 120000 });
      prepared = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("together-order-v1")),
      );
      check(
        "真实门店和菜单经过页面接口加载",
        prepared.mode === "live" &&
          prepared.store.storeCode === "1950147" &&
          prepared.menu.length > 0,
      );
      check(
        "全部已加载单品绑定精确名称录音",
        prepared.menu.every((p) => p.audio && p.priceFen > 0),
      );
      report.store = prepared.store;
      report.products = prepared.menu.map(({ id, name, priceFen, audio }) => ({
        id,
        name,
        priceFen,
        audio,
      }));
    }
    async function snap(name) {
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("img")].every(
            (i) => i.complete && i.naturalWidth > 0,
          ),
        null,
        { timeout: 30000 },
      );
      await page.locator("#notice").evaluate((el) => {
        el.classList.remove("visible");
        el.style.visibility = "hidden";
      });
      const path = `docs/screenshots/live-${name}-${device}.png`;
      await page.screenshot({ path, fullPage: true });
      report.screenshots.push(path);
      check(
        `${device}/${name} 没有横向溢出`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await snap("prepare");
    await page.getByRole("button", { name: "准备好了，交给孩子" }).click();
    const card = page.locator('[data-product="1406"]');
    if (mobile) await card.locator(".listen").tap();
    else await card.locator(".food-pick").hover();
    await page.waitForFunction(() => window.__played.includes("live-1406.mp3"));
    check(
      `${device} 真实餐品录音实际播放且没有加入清单`,
      await page.evaluate(
        () =>
          Object.keys(
            JSON.parse(localStorage.getItem("together-order-v1")).basket,
          ).length === 0,
      ),
    );
    await snap("choose");
    await page.locator('[data-product="1406"] .select-button').click();
    await page.locator('[data-action="category"][data-id="side"]').click();
    await page.locator('[data-product="4810"] .select-button').click();
    await page.locator('[data-action="category"][data-id="drink"]').click();
    await page.locator('[data-product="3010"] .select-button').click();
    await page
      .getByRole("button", { name: "我选好了", exact: true })
      .first()
      .click();
    await snap("recap");
    await page.getByRole("button", { name: "交给家长确认" }).click();
    const response = page.waitForResponse(
      (r) => r.url() === base + "/api/quote",
    );
    await page.getByRole("button", { name: "获取官方实时价格" }).click();
    const q = await (await response).json();
    check(
      `${device} 核价响应和页面金额一致`,
      q.totalFen > 0 &&
        (await page.locator(".total strong").innerText()) ===
          `¥${(q.totalFen / 100).toFixed(2)}`,
    );
    check(
      `${device} 显示官方堂食和外带选项`,
      JSON.stringify(
        await page.locator("#takeway option").allTextContents(),
      ) === JSON.stringify(["堂食", "外带"]),
    );
    check(
      `${device} 核价保留三个餐品及各一份`,
      q.lines.length === 3 && q.lines.every((l) => l.quantity === 1),
    );
    await page.locator("#parent-confirm").check();
    check(
      `${device} 下单开关关闭时确认后仍不可创建`,
      await page.locator("#order-button").isDisabled(),
    );
    await snap("quote");
    report.quote = {
      totalFen: q.totalFen,
      lines: q.lines,
      takeWays: q.takeWays,
    };
    await context.close();
  }
  check("未发起任何创建订单请求", report.transactionRequests === 0);
  check("页面没有脚本错误", report.errors.length === 0);
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(
    "docs/live-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    passed: report.passed,
    checks: report.checks.length,
    products: report.products.length,
    totalFen: report.quote.totalFen,
    transactionRequests: report.transactionRequests,
  }),
);
