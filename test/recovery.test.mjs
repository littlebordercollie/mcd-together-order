import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Orders } from "../lib/orders.mjs";
import {
  recoveryCandidates,
  verifyRecoveredDetail,
} from "../lib/order-recovery.mjs";
import { attempt, historyRow, detail } from "./recovery-fixtures.mjs";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "together-recovery-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ctx = {
    list: [structuredClone(historyRow)],
    detail: structuredClone(detail),
    calls: [],
  };
  const options = {
    enabled: false,
    file: join(dir, "journal.json"),
    now: () => Date.parse(attempt.startedAt),
    mcp: {
      call: async (name, args) => {
        ctx.calls.push({ name, args });
        if (name === "order-list") return { list: structuredClone(ctx.list) };
        if (name === "query-order") return structuredClone(ctx.detail);
        throw new Error("Recovery must not mutate an official order");
      },
    },
  };
  const orders = new Orders(options);
  await orders.persist(attempt);
  return { ctx, orders, options };
}

test("恢复候选严格匹配门店、单品、数量、金额、时间和业务类型", () => {
  assert.equal(recoveryCandidates({ list: [historyRow] }, attempt).length, 1);
  for (const patch of [
    { storeCode: "another-store" },
    { orderType: "2" },
    { beType: "2" },
    { realTotalAmount: "15" },
    { createTime: "2026-10-19 10:00:03" },
    { createTime: "2026-10-19 18:30:00" },
    { createTime: "invalid" },
    {
      orderProductList: [
        { productCode: "456", productName: "模拟单品", quantity: 1 },
      ],
    },
    {
      orderProductList: [
        { productCode: "123", productName: "模拟单品", quantity: 2 },
      ],
    },
    { orderProductList: [{ productCode: "123", quantity: 1 }] },
    { orderProductList: null },
  ])
    assert.deepEqual(
      recoveryCandidates({ list: [{ ...historyRow, ...patch }] }, attempt),
      [],
    );
  assert.throws(() =>
    recoveryCandidates({ list: [] }, { ...attempt, startedAt: "invalid" }),
  );
});

test("相同餐品的多笔历史订单都交给家长核对，不自动选第一笔", () => {
  const list = [historyRow, { ...historyRow, orderId: "second" }];
  assert.equal(recoveryCandidates({ list }, attempt).length, 2);
});

test("空列表或旧版无快照记录不能证明未创建，也不会解锁", async (t) => {
  const { ctx, orders } = await fixture(t);
  ctx.list = [];
  assert.deepEqual((await orders.recovery()).candidates, []);
  assert.equal((await orders.journal()).state, "uncertain");
  await assert.rejects(() =>
    orders.recover({ orderId: historyRow.orderId, parentConfirmed: true }),
  );
  const { snapshot, ...legacy } = attempt;
  await orders.persist(legacy);
  ctx.list = [historyRow];
  assert.deepEqual((await orders.recovery()).candidates, []);
  assert.equal((await orders.journal()).state, "uncertain");
});

test("未确认、任意订单号和恢复前已变化的历史记录均不可绑定", async (t) => {
  const { ctx, orders } = await fixture(t);
  await assert.rejects(() =>
    orders.recover({ orderId: historyRow.orderId, parentConfirmed: false }),
  );
  assert.equal(ctx.calls.length, 0);
  await assert.rejects(() =>
    orders.recover({ orderId: "unrelated", parentConfirmed: true }),
  );
  assert.equal(ctx.calls.filter((c) => c.name === "query-order").length, 0);
  await orders.recovery();
  ctx.list[0].realTotalAmount = "15";
  await assert.rejects(() =>
    orders.recover({ orderId: historyRow.orderId, parentConfirmed: true }),
  );
  assert.equal((await orders.journal()).state, "uncertain");
});

test("家长确认后只查询已有订单，跨实例保留订单号，绝不再次创建", async (t) => {
  const { ctx, orders, options } = await fixture(t);
  const found = await orders.recovery();
  assert.equal(found.candidates[0].orderId, historyRow.orderId);
  assert.equal((await orders.journal()).state, "uncertain");
  const restored = await orders.recover({
    orderId: historyRow.orderId,
    parentConfirmed: true,
  });
  assert.equal(restored.status, "待支付");
  assert.equal(restored.payUrl, "");
  const restarted = new Orders(options);
  const recovered = await restarted.recovery();
  assert.equal(recovered.order.orderId, historyRow.orderId);
  assert.equal((await restarted.journal()).state, "created");
  assert.ok(
    ctx.calls.every((c) => ["order-list", "query-order"].includes(c.name)),
  );
});

test("详情订单号、餐品或金额与候选不同，继续保留结果不明状态", async (t) => {
  const { ctx, orders } = await fixture(t);
  for (const patch of [
    { orderId: "other" },
    { realTotalAmount: "13.00" },
    { orderProductList: [{ productName: "另一个餐品", quantity: 1 }] },
    { orderProductList: [{ productName: "模拟单品", quantity: 2 }] },
  ]) {
    ctx.detail = { ...detail, ...patch };
    await assert.rejects(() =>
      orders.recover({ orderId: historyRow.orderId, parentConfirmed: true }),
    );
    assert.equal((await orders.journal()).state, "uncertain");
  }
});

test("只接受官方返回的付款链接，未知链接不会丢失已知订单号", async (t) => {
  const { ctx, orders } = await fixture(t);
  ctx.detail.payH5Url = "https://mcd.cn.attacker.invalid/pay";
  const result = await orders.recover({
    orderId: historyRow.orderId,
    parentConfirmed: true,
  });
  assert.equal(result.payUrl, "");
  assert.equal((await orders.journal()).result.orderId, historyRow.orderId);
});

test("未知状态继续锁定，官方已完成状态才关闭本机记录", async (t) => {
  const { ctx, orders } = await fixture(t);
  ctx.detail.orderStatus = "新的未知状态";
  await orders.recover({ orderId: historyRow.orderId, parentConfirmed: true });
  assert.equal((await orders.journal()).state, "created");
  ctx.detail.orderStatus = "订单已完成";
  assert.equal((await orders.status(historyRow.orderId)).status, "订单已完成");
  assert.equal((await orders.journal()).state, "closed");
});

test("并发恢复只有一次成功绑定", async (t) => {
  const { orders } = await fixture(t);
  const input = { orderId: historyRow.orderId, parentConfirmed: true };
  const results = await Promise.allSettled([
    orders.recover(input),
    orders.recover(input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await orders.journal()).result.orderId, historyRow.orderId);
});

test("历史响应格式改变时明确停止，不返回伪造候选", () => {
  assert.throws(
    () => recoveryCandidates({ orders: [historyRow] }, attempt),
    /格式无法确认/,
  );
  const c = recoveryCandidates({ list: [historyRow] }, attempt)[0];
  assert.doesNotThrow(() => verifyRecoveredDetail(detail, c));
});
