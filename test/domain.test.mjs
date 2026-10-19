import test from "node:test";
import assert from "node:assert/strict";
import {
  fen,
  paymentUrl,
  validateItems,
  normalizeQuote,
  menuCandidates,
  singleProduct,
} from "../lib/domain.mjs";
import { unwrap } from "../lib/mcp.mjs";
test("金额明确区分元和分，拒绝非数字与负数", () => {
  assert.equal(fen("12.34"), 1234);
  assert.equal(fen(1234, "fen"), 1234);
  for (const bad of [-1, NaN, "12元", null, ""]) assert.throws(() => fen(bad));
});
test("付款链接只接受官方 HTTPS 域名，拒绝相似域名和用户名伪装", () => {
  assert.equal(
    paymentUrl("https://m.mcd.cn/pay?a=1"),
    "https://m.mcd.cn/pay?a=1",
  );
  for (const bad of [
    "javascript:alert(1)",
    "http://m.mcd.cn/pay",
    "https://mcd.cn.evil.test/",
    "https://user@mcd.cn/",
  ])
    assert.throws(() => paymentUrl(bad));
});
test("示例商品绝不会发送给真实下单逻辑", () => {
  assert.throws(() =>
    validateItems([{ productCode: "demo-chicken", quantity: 1 }]),
  );
  assert.throws(() =>
    validateItems([
      { productCode: "1", quantity: 1 },
      { productCode: "1", quantity: 1 },
    ]),
  );
  assert.throws(() => validateItems([{ productCode: "1", quantity: 1.5 }]));
});
test("响应失败与非 JSON 内容不会伪装成菜单", () => {
  assert.throws(() => unwrap({ isError: true }));
  assert.throws(() =>
    unwrap({ content: [{ type: "text", text: "服务异常" }] }),
  );
  assert.throws(() =>
    unwrap({ structuredContent: { success: false, data: [] } }),
  );
  assert.deepEqual(
    unwrap({
      content: [
        { type: "text", text: '{"success":true,"code":200,"data":[1]}' },
      ],
    }),
    [1],
  );
});
test("未核实报价单位时拒绝报价", () => {
  assert.throws(
    () => normalizeQuote({ productList: [], price: 100 }, [], undefined),
    /金额单位/,
  );
});
test("报价必须匹配官方商品和数量", () => {
  const rows = {
    price: 1400,
    productList: [
      { productCode: "123", productName: "示例", quantity: 1, subtotal: 1400 },
    ],
  };
  assert.equal(
    normalizeQuote(rows, [{ productCode: "123", quantity: 1 }], "fen").totalFen,
    1400,
  );
  assert.throws(() =>
    normalizeQuote(rows, [{ productCode: "123", quantity: 2 }], "fen"),
  );
  assert.throws(() =>
    normalizeQuote(rows, [{ productCode: "456", quantity: 1 }], "fen"),
  );
});
test("有会员条件和套餐的餐品不进入单品候选", () => {
  const products = {
    meals: {
      a: { name: "汉堡" },
      b: { name: "汉堡套餐" },
      c: { name: "鱼堡", withOrder: { cardId: "x" } },
      d: { name: "薯条", discountType: "会员折扣" },
    },
  };
  assert.deepEqual(
    menuCandidates(products).map((p) => p.id),
    ["a"],
  );
});
test("详情发现套餐、缺图、错码时停止，不能默默替代", () => {
  const c = { id: "1", name: "汉堡" };
  assert.throws(() => singleProduct({ code: "1", rounds: [{}] }, c));
  assert.throws(() => singleProduct({ code: "1", rounds: [], image: "" }, c));
  assert.throws(() => singleProduct({ code: "2", rounds: [] }, c));
});

test("分单位不接受小数，避免静默四舍五入", () => {
  assert.throws(() => fen("12.5", "fen"));
});
