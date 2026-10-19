import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { blankState } from "../web/state.js";
const base = "http://127.0.0.1:3741";
const cfg = await (await fetch(base + "/api/config")).json();
assert.equal(cfg.orderEnabled, false);
async function api(path, body) {
  const r = await fetch(base + "/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Token": cfg.csrf },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.ok(r.ok, d.error);
  return d;
}
await api("stores", { city: "北京", keyword: "回龙观地铁站" });
const menu = await api("menu", { storeCode: "1950147" });
assert.ok(
  menu.menu.some((p) => p.id === "9900008751" && p.variants.length === 6),
);
const report = {
  at: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  transactionRequests: 0,
  quotes: [],
};
const check = (n, v) => {
  assert.ok(v, n);
  report.checks.push(n);
};
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [mode, device, width, height] of [
    ["live", "desktop", 1366, 900],
    ["live", "mobile", 390, 844],
    ["demo", "narrow", 360, 780],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 600,
      hasTouch: width < 600,
    });
    const p = await ctx.newPage();
    const key = mode + "/" + device;
    const initial = blankState();
    if (mode === "live") {
      initial.mode = "live";
      initial.menu = menu.menu;
      initial.store = menu.store;
    }
    initial.page = "choose";
    initial.category = "drink";
    await p.addInitScript((s) => {
      if (!localStorage.getItem("together-order-v1"))
        localStorage.setItem("together-order-v1", JSON.stringify(s));
      window.__played = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        this.addEventListener(
          "playing",
          () => window.__played.push(this.currentSrc.split("/").pop()),
          { once: true },
        );
        return play.call(this);
      };
    }, initial);
    p.on("pageerror", (e) => report.errors.push({ key, message: e.message }));
    await p.route("**/api/order", (route) => {
      report.transactionRequests++;
      return route.abort();
    });
    p.on("request", (req) => {
      if (req.url().endsWith("/api/quote"))
        report.quotes.push({ key, body: req.postDataJSON() });
    });
    await p.goto(base);
    await p.waitForLoadState("networkidle");
    const id = mode === "live" ? "9900008751" : "demo-cola";
    for (
      let i = 0;
      i < 6 &&
      !(await p
        .locator(`[data-action="choose"][data-id="${id}"]`)
        .first()
        .isVisible());
      i++
    )
      await p.getByRole("button", { name: /换一组/ }).click();
    const state = () =>
      p.evaluate(() => JSON.parse(localStorage.getItem("together-order-v1")));
    async function snap(name) {
      await p.locator("#notice").evaluate((e) => e.classList.remove("visible"));
      await p.waitForFunction(() =>
        [...document.querySelectorAll("img")].every(
          (i) => i.complete && i.naturalWidth,
        ),
      );
      const path = `docs/screenshots/options-${mode}-${name}-${device}.png`;
      await p.screenshot({ path, fullPage: true });
      report.screenshots.push(path);
      check(
        key + "/" + name + "无横向溢出",
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await p.locator(`[data-action="choose"][data-id="${id}"]`).first().click();
    check(key + "弹窗打开未加入清单", !(await state()).basket[id]);
    await p.getByRole("button", { name: "关闭", exact: true }).click();
    check(key + "关闭不偷偷选择", !(await state()).basket[id]);
    await p.locator(`[data-action="choose"][data-id="${id}"]`).first().click();
    if (device === "desktop") {
      await p.getByRole("button", { name: "无糖可乐", exact: true }).hover();
      await p.waitForFunction(() => window.__played.includes("kind-zero.mp3"));
      check(
        key + "悬停朗读选项但不替人选择",
        (await p
          .getByRole("button", { name: "无糖可乐", exact: true })
          .getAttribute("aria-pressed")) === "false" &&
          !(await state()).basket[id],
      );
    } else {
      await p.locator("#modal [data-listen]").click();
      await p.waitForFunction(() =>
        window.__played.includes("option-kind.mp3"),
      );
      check(key + "手机点按播放规格提问", !(await state()).basket[id]);
    }
    await p.getByRole("button", { name: "无糖可乐", exact: true }).click();
    check(
      key + "选择后不自动跳步",
      await p.getByRole("heading", { name: "想喝哪一种？" }).isVisible(),
    );
    await snap("kind");
    await p.getByRole("button", { name: "下一步", exact: true }).click();
    await p.getByRole("button", { name: "中杯", exact: true }).click();
    await snap("size");
    await p.getByRole("button", { name: "下一步", exact: true }).click();
    await p.getByRole("button", { name: "还有一种冰量", exact: true }).click();
    check(
      key + "第四种多冰可见",
      await p.getByRole("button", { name: "多冰", exact: true }).isVisible(),
    );
    await p.getByRole("button", { name: "回看其他冰量", exact: true }).click();
    await p.getByRole("button", { name: "去冰", exact: true }).click();
    await snap("ice");
    await p
      .getByRole("button", { name: "就按这些选，放进餐盘", exact: true })
      .click();
    check(key + "确认后只有一份", (await state()).basket[id] === 1);
    await snap("tray");
    await p
      .getByRole("button", { name: "我选好了", exact: true })
      .last()
      .click();
    await p.locator(".center-heading [data-listen]").click();
    await p.waitForFunction(
      () =>
        window.__played.includes("name-cola-zero-medium.mp3") &&
        window.__played.includes("ice-none.mp3"),
      null,
      { timeout: 20000 },
    );
    check(key + "清单实际播出无糖中杯与去冰", true);
    await snap("recap");
    await p.getByRole("button", { name: "交给家长确认", exact: true }).click();
    await p
      .getByRole("button", {
        name: mode === "live" ? "获取官方实时价格" : "查看示例金额",
        exact: true,
      })
      .click();
    await p.locator("#parent-confirm").waitFor();
    check(
      key + "核价包含完整规格",
      /无糖可口可乐中杯.*去冰/s.test(
        await p.locator(".quote-lines").innerText(),
      ),
    );
    if (mode === "live")
      check(
        key + "中杯无糖去冰官方报价10元",
        (await state()).quote.totalFen === 1000,
      );
    await snap("quote");
    await p
      .getByRole("button", { name: "调整无糖可口可乐中杯的规格", exact: true })
      .click();
    await p.getByRole("button", { name: "下一步", exact: true }).click();
    await p.getByRole("button", { name: "大杯", exact: true }).click();
    await p.getByRole("button", { name: "下一步", exact: true }).click();
    await p.getByRole("button", { name: "少冰", exact: true }).click();
    await p.getByRole("button", { name: "确认这些选择", exact: true }).click();
    check(key + "更改规格使旧报价失效", (await state()).quote === null);
    check(
      key + "保留最初中杯去冰",
      /中杯.*去冰/s.test(await p.locator(".intent-banner").innerText()),
    );
    check(
      key + "家长调整有完整记录",
      /家长调整.*中杯.*去冰.*大杯.*少冰/s.test(
        await p.locator(".changes").innerText(),
      ),
    );
    await snap("changed");
    await p
      .getByRole("button", {
        name: mode === "live" ? "获取官方实时价格" : "查看示例金额",
        exact: true,
      })
      .click();
    await p.locator("#parent-confirm").waitFor();
    if (mode === "live")
      check(
        key + "大杯无糖少冰官方报价12元",
        (await state()).quote.totalFen === 1200,
      );
    const savedChoice = (await state()).selections[id];
    await p.reload();
    check(
      key + "刷新保留规格但清除旧报价",
      JSON.stringify((await state()).selections[id]) ===
        JSON.stringify(savedChoice) && (await state()).quote === null,
    );
    if (mode === "live") check(key + "真实下单开关始终关闭", !cfg.orderEnabled);
    // Reopening from the student side must retain a pending request for guardian help.
    await p.getByRole("button", { name: "让孩子再选", exact: true }).click();
    await p
      .getByRole("button", { name: "调整无糖可口可乐大杯的规格", exact: true })
      .click();
    await p.getByRole("button", { name: "和家长一起选", exact: true }).click();
    await p
      .getByRole("button", { name: "我选好了", exact: true })
      .last()
      .click();
    await p.getByRole("button", { name: "交给家长确认", exact: true }).click();
    check(
      key + "待家长确认时禁止核价",
      !(await p
        .getByRole("button", {
          name: mode === "live" ? "获取官方实时价格" : "查看示例金额",
          exact: true,
        })
        .isEnabled()),
    );
    await p
      .getByRole("button", { name: "调整无糖可口可乐大杯的规格", exact: true })
      .click();
    await p.getByRole("button", { name: "确认这些选择", exact: true }).click();
    check(
      key + "家长明确确认后恢复核价",
      await p
        .getByRole("button", {
          name: mode === "live" ? "获取官方实时价格" : "查看示例金额",
          exact: true,
        })
        .isEnabled(),
    );
    await ctx.close();
  }
  check("所有浏览器未发起创建订单请求", report.transactionRequests === 0);
  check("无页面脚本异常", report.errors.length === 0);
  for (const { body } of report.quotes)
    check(
      "核价请求传递规格和冰量",
      body.items.some((i) => i.selection?.variantCode && i.selection?.iceKey),
    );
} finally {
  await browser.close();
  await writeFile(
    "docs/options-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    errors: report.errors,
    transactionRequests: report.transactionRequests,
    screenshots: report.screenshots.length,
  }),
);
