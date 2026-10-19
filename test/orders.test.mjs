import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Orders } from "../lib/orders.mjs";
async function setup(t, opts = {}) {
  const dir = await mkdtemp(join(tmpdir(), "together-order-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ctx = { calls: [], price: 1400, status: "待支付", failCreate: false };
  const mcp = {
    arguments: async () => ({}),
    call: async (name, args) => {
      ctx.calls.push({ name, args });
      if (name === "calculate-price")
        return {
          price: ctx.price,
          productList: [
            {
              productCode: "123",
              productName: "测试单品",
              quantity: 1,
              subtotal: ctx.price,
            },
          ],
          takeWayList: [{ code: "counter", name: "柜台取餐" }],
        };
      if (name === "create-order") {
        if (ctx.failCreate) throw new Error("Timeout");
        await new Promise((r) => setTimeout(r, 10));
        return {
          orderId: "test-order",
          payH5Url: "https://m.mcd.cn/example",
          orderDetail: { orderStatus: "待支付" },
        };
      }
      if (name === "query-order")
        return {
          orderId: "test-order",
          orderStatus: ctx.status,
          pickupCode: "",
        };
    },
  };
  const options = {
    mcp,
    storeFor: (id) =>
      id === "store" ? { storeCode: "store", beCode: "be" } : null,
    productFor: () => true,
    unit: "fen",
    enabled: true,
    file: join(dir, "journal.json"),
    ...opts,
  };
  const orders = new Orders(options);
  const q = await orders.quote("store", [{ productCode: "123", quantity: 1 }]);
  const confirm = {
    quoteId: q.id,
    confirmedTotalFen: q.totalFen,
    parentConfirmed: true,
    takeWayCode: "counter",
  };
  return { ...ctx, ctx, orders, q, confirm, options };
}
test("未确认或下单开关关闭绝不创建订单", async (t) => {
  const x = await setup(t);
  await assert.rejects(() =>
    x.orders.create({ ...x.confirm, parentConfirmed: false }),
  );
  x.orders.enabled = false;
  await assert.rejects(() => x.orders.create(x.confirm));
  assert.equal(x.ctx.calls.filter((c) => c.name === "create-order").length, 0);
});
test("最后一刻价格改变，要求重新核价", async (t) => {
  const x = await setup(t);
  x.ctx.price = 1500;
  await assert.rejects(() => x.orders.create(x.confirm), /价格或餐品发生变化/);
  assert.equal(x.ctx.calls.filter((c) => c.name === "create-order").length, 0);
});
test("重复提交同一报价只创建一次并返回已有订单", async (t) => {
  const x = await setup(t);
  const first = await x.orders.create(x.confirm);
  const second = await x.orders.create(x.confirm);
  assert.equal(first.orderId, second.orderId);
  assert.equal(x.ctx.calls.filter((c) => c.name === "create-order").length, 1);
  assert.equal(first.status, "待支付");
});
test("并发双击不能产生两笔订单", async (t) => {
  const x = await setup(t);
  const results = await Promise.allSettled([
    x.orders.create(x.confirm),
    x.orders.create(x.confirm),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(x.ctx.calls.filter((c) => c.name === "create-order").length, 1);
});
test("下单超时跨进程重启仍阻止盲目重试", async (t) => {
  const x = await setup(t);
  x.ctx.failCreate = true;
  await assert.rejects(() => x.orders.create(x.confirm), /结果暂不明确/);
  const restarted = new Orders(x.options);
  const q = await restarted.quote("store", [
    { productCode: "123", quantity: 1 },
  ]);
  await assert.rejects(
    () => restarted.create({ ...x.confirm, quoteId: q.id }),
    /上一笔订单/,
  );
  assert.equal(x.ctx.calls.filter((c) => c.name === "create-order").length, 1);
});
test("报价过期和错误取餐方式不下单", async (t) => {
  const x = await setup(t);
  await assert.rejects(
    () => x.orders.create({ ...x.confirm, takeWayCode: "invented" }),
    /取餐方式/,
  );
  x.orders.now = () => Date.now() + 10 * 60 * 1000;
  await assert.rejects(() => x.orders.create(x.confirm), /报价已过期/);
});
test("官方待支付原样显示，不将打开链接当成已付款", async (t) => {
  const x = await setup(t);
  await x.orders.create(x.confirm);
  assert.equal((await x.orders.status("test-order")).status, "待支付");
  await assert.rejects(() => x.orders.status("someone-elses-order"));
});

test("到店核价和创建均不传 beCode，保留服务端菜单的官方默认配料", async (t) => {
  const modification = {
    values: [{ code: "ingredient", key: "0-1", quantity: 1 }],
  };
  const x = await setup(t, {
    productFor: () => ({ defaultModification: modification }),
  });
  await x.orders.create(x.confirm);
  for (const { name, args } of x.ctx.calls.filter((c) =>
    ["calculate-price", "create-order"].includes(c.name),
  )) {
    assert.equal(Object.hasOwn(args, "beCode"), false, name);
    assert.deepEqual(args.items[0].modification, modification, name);
  }
});
