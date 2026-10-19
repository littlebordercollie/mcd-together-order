import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { recoveryCandidates } from "../lib/order-recovery.mjs";
import { attempt, historyRow } from "../test/recovery-fixtures.mjs";
import { blankState } from "../web/state.js";

const report = {
  at: new Date().toISOString(),
  source: "synthetic API fixtures, no MCP calls",
  checks: [],
  errors: [],
};
const check = (name, result) => {
  assert.ok(result, name);
  report.checks.push(name);
};
const candidate = recoveryCandidates({ list: [historyRow] }, attempt)[0];
const order = { ...candidate, payUrl: "", pickupCode: "" };
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [device, width, height] of [
    ["desktop", 1366, 900],
    ["mobile", 360, 780],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    let known = false,
      empty = false,
      status = "待支付",
      networkFailure = false;
    const calls = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      calls.push(path);
      let body;
      if (path === "/api/config")
        body = {
          live: true,
          orderEnabled: true,
          hasPendingOrder: true,
          csrf: "fixture",
        };
      else if (path === "/api/order-recovery")
        body = known
          ? { state: "created", order: { ...order, status }, candidates: [] }
          : { state: "uncertain", candidates: empty ? [] : [candidate] };
      else if (path === "/api/order-recover") {
        const input = route.request().postDataJSON();
        check(
          `${device}: 恢复请求显式携带家长确认`,
          input.parentConfirmed && input.orderId === order.orderId,
        );
        known = true;
        body = order;
      } else if (path === "/api/order-status") body = { ...order, status };
      else if (path === "/api/order" && networkFailure)
        return route.abort("connectionfailed");
      else if (path === "/api/order")
        return route.fulfill({
          status: 400,
          json: {
            code: "ORDER_RECOVERY_REQUIRED",
            error: "下单结果暂不明确，请先查找这笔订单，不要再次下单。",
          },
        });
      else if (path === "/api/quote")
        body = {
          id: "fixture-quote",
          totalFen: 1400,
          lines: [{ name: "模拟单品", quantity: 1, subtotalFen: 1400 }],
          takeWays: [{ code: "counter", name: "柜台取餐" }],
        };
      else throw new Error(`Unexpected request ${path}`);
      await route.fulfill({ json: body });
    });
    await page.goto("http://127.0.0.1:3741");
    await page.getByRole("button", { name: "找回刚才的订单" }).click();
    const restore = page.getByRole("button", { name: "恢复这笔订单" });
    await restore.waitFor();
    check(`${device}: 未确认不能恢复`, await restore.isDisabled());
    check(
      `${device}: 显示时间、金额、餐品与官方状态`,
      (await page.locator("dialog").innerText()).includes(
        "2026-10-19 18:00:03",
      ) &&
        (await page.locator("dialog").innerText()).includes("¥14.00") &&
        (await page.locator("dialog").innerText()).includes("模拟单品"),
    );
    check(
      `${device}: 弹窗无横向溢出`,
      await page
        .locator("dialog")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
    await page.screenshot({ path: `test-results/recovery-${device}.png` });
    await page.getByLabel("已核对这笔订单").check();
    await restore.click();
    await page.getByRole("heading", { name: "待支付", exact: true }).waitFor();
    check(
      `${device}: 空本地餐盘仍显示恢复的订单`,
      !(await page.locator("main").innerText()).includes("今天先不选") &&
        (await page.locator("main").innerText()).includes("fixture-order"),
    );
    check(
      `${device}: 无付款链接时不伪造支付按钮`,
      (await page.getByRole("link", { name: "打开官方付款页面" }).count()) ===
        0,
    );
    check(`${device}: 恢复没有创建新订单`, !calls.includes("/api/order"));
    check(
      `${device}: 页面无横向溢出`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `test-results/recovered-${device}.png`,
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("heading", { name: "待支付", exact: true }).waitFor();
    check(
      `${device}: 刷新保留恢复的订单号`,
      (await page.locator("main").innerText()).includes("fixture-order"),
    );
    status = "订单已完成";
    await page.getByRole("button", { name: "查询官方订单状态" }).click();
    await page
      .getByRole("heading", { name: "订单已完成", exact: true })
      .waitFor();
    check(`${device}: 完成状态来自查询结果`, true);
    await page.getByRole("button", { name: "回到首页", exact: true }).click();
    await page.getByRole("button", { name: "找回刚才的订单" }).click();
    await page
      .getByRole("heading", { name: "订单已完成", exact: true })
      .waitFor();
    check(`${device}: 已知订单可从首页直接找回`, true);

    // History can be incomplete. Empty results do not become a retry-order action.
    known = false;
    empty = true;
    await page.getByRole("button", { name: "回到首页", exact: true }).click();
    await page.getByRole("button", { name: "找回刚才的订单" }).click();
    await page
      .getByText("暂未找到符合这次选择的订单。", { exact: true })
      .waitFor();
    check(
      `${device}: 空历史保留核对提示`,
      (await page.locator("dialog").innerText()).includes("暂时不要重新下单"),
    );
    check(
      `${device}: 空历史没有恢复或再次下单按钮`,
      (await page
        .locator('dialog [data-action="recover"], dialog [data-action="order"]')
        .count()) === 0,
    );
    await page.screenshot({
      path: `test-results/recovery-empty-${device}.png`,
    });
    await page.getByRole("button", { name: "稍后再看" }).click();

    // An actual order request error is retained as a dialog, not just a transient toast.
    const s = blankState();
    Object.assign(s, {
      mode: "live",
      page: "review",
      store: {
        storeCode: "fixture-store",
        name: "模拟门店",
        address: "模拟地址",
      },
      menu: [
        {
          id: "123",
          name: "模拟单品",
          category: "main",
          priceFen: 1400,
          image: "assets/food/chicken.jpg",
        },
      ],
      basket: { 123: 1 },
      original: { 123: 1 },
    });
    await page.evaluate(
      (data) => localStorage.setItem("together-order-v1", JSON.stringify(data)),
      s,
    );
    await page.reload();
    await page.getByRole("button", { name: "获取官方实时价格" }).click();
    await page.locator("#parent-confirm").check();
    await page.getByRole("button", { name: "确认并创建订单" }).click();
    await page
      .getByRole("heading", { name: "先找回这笔订单", exact: true })
      .waitFor();
    check(
      `${device}: 超时错误提供持久恢复入口`,
      await page.getByRole("button", { name: "查询这笔订单" }).isVisible(),
    );
    await page.getByRole("button", { name: "查询这笔订单" }).click();
    await page
      .getByText("暂未找到符合这次选择的订单。", { exact: true })
      .waitFor();
    check(
      `${device}: 查询恢复没有再次请求创建`,
      calls.filter((p) => p === "/api/order").length === 1,
    );
    await page.getByRole("button", { name: "稍后再看" }).click();
    networkFailure = true;
    await page.locator("#parent-confirm").check();
    await page.getByRole("button", { name: "确认并创建订单" }).click();
    await page
      .getByRole("heading", { name: "先找回这笔订单", exact: true })
      .waitFor();
    check(
      `${device}: 浏览器断网同样保留结果待核实提示`,
      (await page.locator("dialog").innerText()).includes("连接中断"),
    );
    await context.close();
  }
  check("浏览器没有脚本异常", report.errors.length === 0);
} finally {
  await browser.close();
  await writeFile(
    "test-results/recovery-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    errors: report.errors.length,
    report: "test-results/recovery-browser.json",
  }),
);
