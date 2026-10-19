import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeStores,
  menuCandidates,
  singleProduct,
  normalizeQuote,
  defaultModification,
} from "../lib/domain.mjs";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/mcp-live-readonly.json", import.meta.url),
    "utf8",
  ),
);
const candidates = menuCandidates(fixture.menu);

test("实际到店门店不需要 beCode，暂停营业的门店不会混入", () => {
  const stores = normalizeStores(fixture.stores);
  assert.equal(stores.length, 1);
  assert.equal(stores[0].storeCode, "1950147");
  assert.equal(Object.hasOwn(stores[0], "beCode"), false);
});

test("单品价格取实际菜单 currentPrice，详情没有 price 仍可加载", () => {
  const p = singleProduct(
    fixture.details["1406"],
    candidates.find((c) => c.id === "1406"),
  );
  assert.equal(Object.hasOwn(fixture.details["1406"], "price"), false);
  assert.equal(p.priceFen, 2350);
  assert.equal(p.audio, "live-1406");
  assert.deepEqual(p.defaultModification.values, [
    { code: "102201", key: "0-1", quantity: 1 },
    { code: "120512", key: "0-1", quantity: 1 },
  ]);
});

test("语音必须同时匹配实际编码和名称，规格变化不能沿用旧录音", () => {
  const p = singleProduct(
    { ...fixture.details["4810"], name: "大薯条" },
    candidates.find((c) => c.id === "4810"),
  );
  assert.equal(p.audio, "");
});

test("真实报价按分展示，读取 title 格式的堂食和外带选项", () => {
  const quote = normalizeQuote(
    fixture.quote,
    fixture.quote.productList.map((p) => ({
      productCode: p.productCode,
      quantity: p.quantity,
    })),
    "fen",
  );
  assert.equal(quote.totalFen, 4750);
  assert.deepEqual(quote.takeWays, [
    { code: "eat-in", name: "堂食" },
    { code: "take-in-store", name: "外带" },
  ]);
  assert.equal(
    quote.lines.reduce((sum, p) => sum + p.subtotalFen, 0),
    4750,
  );
});

test("饮料保留官方默认标准冰，无法确认默认值时停止", () => {
  assert.deepEqual(defaultModification(fixture.details["3010"]), {
    values: [{ code: "200002", key: "0-1", quantity: 1 }],
  });
  assert.throws(() => defaultModification({ supportModify: true }), /默认配料/);
  assert.throws(
    () =>
      defaultModification({
        supportModify: true,
        modification: {
          items: [{ values: [{ code: "x", selectedQuantity: null }] }],
        },
      }),
    /默认配料数量/,
  );
});
