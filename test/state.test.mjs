import test from "node:test";
import assert from "node:assert/strict";
import {
  blankState,
  choose,
  changeQuantity,
  handoff,
  save,
  restore,
  selected,
  basketSignature,
} from "../web/state.js";
test("重复点餐品保持一份，取消后可以重新选择", () => {
  const s = blankState();
  assert.equal(choose(s, "demo-chicken"), true);
  assert.equal(choose(s, "demo-chicken"), false);
  assert.equal(s.basket["demo-chicken"], 1);
  changeQuantity(s, "demo-chicken", 0);
  assert.equal(choose(s, "demo-chicken"), true);
});
test("隐藏、未知的餐品不进入清单", () => {
  const s = blankState();
  s.hidden.push("demo-chicken");
  assert.equal(choose(s, "demo-chicken"), false);
  assert.equal(choose(s, "fake"), false);
  assert.equal(selected(s).length, 0);
});
test("家长修改保留孩子原始选择并使报价失效", () => {
  const s = blankState();
  choose(s, "demo-chicken");
  handoff(s);
  s.quote = { totalFen: 1400 };
  changeQuantity(s, "demo-chicken", 2, true);
  assert.equal(s.original["demo-chicken"], 1);
  assert.deepEqual(s.changes, [
    { id: "demo-chicken", before: 1, after: 2, actor: "parent" },
  ]);
  assert.equal(s.quote, null);
});
test("刷新恢复选择和修改记录，但丢弃过期报价", () => {
  const memory = new Map();
  const storage = {
    getItem: (k) => memory.get(k),
    setItem: (k, v) => memory.set(k, v),
  };
  const s = blankState();
  choose(s, "demo-fish");
  handoff(s);
  changeQuantity(s, "demo-fish", 2, true);
  s.quote = { id: "old" };
  save(s, storage);
  const r = restore(storage);
  assert.equal(r.basket["demo-fish"], 2);
  assert.equal(r.original["demo-fish"], 1);
  assert.equal(r.changes.length, 1);
  assert.equal(r.quote, null);
});
test("份数非法或超过范围不会改变原清单", () => {
  const s = blankState();
  choose(s, "demo-fish");
  for (const n of [NaN, Infinity, -1, 1.2, 6])
    assert.equal(changeQuantity(s, "demo-fish", n), false);
  assert.equal(s.basket["demo-fish"], 1);
});
test("门店和份数都进入报价对应的清单签名", () => {
  const s = blankState();
  choose(s, "demo-fish");
  const original = basketSignature(s);
  changeQuantity(s, "demo-fish", 2);
  assert.notEqual(basketSignature(s), original);
  const withQty = basketSignature(s);
  s.store.storeCode = "changed";
  assert.notEqual(basketSignature(s), withQty);
});

test("重复交接保留最初选择及每次调整的主体", () => {
  const s = blankState();
  choose(s, "demo-chicken");
  handoff(s);
  changeQuantity(s, "demo-chicken", 2, true);
  choose(s, "demo-fish");
  handoff(s);
  assert.equal(s.original["demo-chicken"], 1);
  assert.equal(s.original["demo-fish"], undefined);
  assert.deepEqual(
    s.changes.map((c) => c.actor),
    ["parent", "child"],
  );
});
test("损坏的本机分类或数量会恢复为可操作初始页", () => {
  for (const bad of [
    { category: "broken" },
    { basket: { "demo-chicken": 100 } },
  ]) {
    const s = { ...blankState(), ...bad };
    assert.equal(restore({ getItem: () => JSON.stringify(s) }).page, "welcome");
    assert.deepEqual(restore({ getItem: () => JSON.stringify(s) }).basket, {});
  }
});
