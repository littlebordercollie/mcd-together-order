import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { singleProduct, configureItem, validateItems } from "../lib/domain.mjs";
import { Orders } from "../lib/orders.mjs";
import {
  blankState,
  choose,
  setSelection,
  selected,
  handoff,
  basketSignature,
  restore,
  save,
} from "../web/state.js";
import {
  defaultSelection,
  resolveSelection,
  pickOption,
} from "../web/options.js";
const f = JSON.parse(
  await readFile(new URL("./fixtures/mcp-options.json", import.meta.url)),
);
const cola = singleProduct(f.cola, {
  id: "9900008751",
  name: "可乐",
  category: "drink",
  priceFen: 950,
});
const sprite = singleProduct(f.sprite, {
  id: "3010",
  category: "drink",
  priceFen: 950,
});
const selectedCola = { variantCode: "3071", iceKey: "0-0", needsHelp: false };
test("官方普通可乐选项不再被当套餐过滤，六个规格与四种冰量完整保留", () => {
  assert.equal(cola.variants.length, 6);
  assert.equal(
    cola.variants.find((v) => v.code === "3071").name,
    "无糖可口可乐中杯",
  );
  assert.equal(sprite.variants[0].iceOptions.length, 4);
  assert.deepEqual(defaultSelection(cola), {
    variantCode: "3000",
    iceKey: "0-1",
    needsHelp: false,
  });
  assert.throws(
    () =>
      singleProduct(
        { ...f.cola, rounds: [...f.cola.rounds, ...f.cola.rounds] },
        { id: "9900008751", category: "drink" },
      ),
    /套餐选项/,
  );
});
test("中杯无糖去冰生成已实测的官方 roundList，拒绝未提供的冰量、规格和未确认选择", () => {
  const args = configureItem(cola, {
    productCode: cola.id,
    quantity: 1,
    selection: selectedCola,
  });
  assert.deepEqual(args, f.quote.args.items[0]);
  for (const selection of [
    undefined,
    { ...selectedCola, variantCode: "invented" },
    { ...selectedCola, iceKey: "invented" },
    { ...selectedCola, needsHelp: true },
  ])
    assert.throws(() =>
      configureItem(cola, { productCode: cola.id, quantity: 1, selection }),
    );
  const clean = validateItems([
    {
      productCode: cola.id,
      quantity: 1,
      selection: selectedCola,
      roundList: [{ round: "evil" }],
      modification: { values: [] },
    },
  ])[0];
  assert.equal(clean.roundList, undefined);
  assert.equal(clean.modification, undefined);
});
test("单品去冰替换默认冰量，不叠加标准冰", () => {
  const args = configureItem(sprite, {
    productCode: sprite.id,
    quantity: 1,
    selection: { variantCode: "3010", iceKey: "0-0" },
  });
  assert.deepEqual(args.modification.values, [
    { code: "200002", key: "0-0", quantity: 1 },
  ]);
  assert.equal(args.roundList, undefined);
});
test("换口味保留杯型与冰量，朗读包含所选规格", () => {
  const choice = pickOption(cola, selectedCola, "kind", "regular");
  assert.equal(choice.variantCode, "3050");
  assert.equal(choice.iceKey, "0-0");
  const p = resolveSelection(cola, choice);
  assert.equal(p.displayName, "可乐中杯 · 去冰");
  assert.deepEqual(p.nameAudio, ["name-cola-medium", "ice-none"]);
});
test("原始规格、修改主体、报价失效及刷新恢复独立保留", () => {
  const s = blankState();
  s.menu = [cola];
  s.mode = "live";
  choose(s, cola.id);
  assert.equal(selected(s)[0].needsHelp, true);
  setSelection(s, cola.id, selectedCola);
  handoff(s);
  const before = basketSignature(s);
  s.quote = { id: "old" };
  setSelection(s, cola.id, { ...selectedCola, iceKey: "1-1" }, true);
  assert.equal(s.quote, null);
  assert.notEqual(basketSignature(s), before);
  assert.equal(s.originalSelections[cola.id].iceKey, "0-0");
  assert.equal(s.changes.at(-1).actor, "parent");
  assert.match(s.changes.at(-1).after, /少冰/);
  let data;
  const storage = { setItem: (k, v) => (data = v), getItem: () => data };
  save(s, storage);
  const again = restore(storage);
  assert.equal(again.selections[cola.id].iceKey, "1-1");
  assert.equal(again.originalSelections[cola.id].iceKey, "0-0");
});
test("报价绑定真实规格参数；提交前再次核价仍使用同一份去冰参数", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mcd-options-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = [];
  const mcp = {
    arguments: async () => {},
    call: async (name, args) => {
      calls.push({ name, args: structuredClone(args) });
      if (name === "calculate-price") return structuredClone(f.quote.data);
      if (name === "create-order")
        return { orderId: "mock-only", orderDetail: { orderStatus: "待支付" } };
      throw new Error(name);
    },
  };
  const o = new Orders({
    mcp,
    storeFor: () => ({ storeCode: "1950147" }),
    productFor: () => cola,
    unit: "fen",
    enabled: true,
    file: join(dir, "journal.json"),
  });
  const q = await o.quote("1950147", [
    { productCode: cola.id, quantity: 1, selection: selectedCola },
  ]);
  assert.equal(q.totalFen, 1000);
  assert.equal(q.lines[0].name, "无糖可口可乐中杯 · 去冰");
  assert.equal(q.lines[0].officialName, "可乐");
  await o.create({
    quoteId: q.id,
    confirmedTotalFen: 1000,
    parentConfirmed: true,
    takeWayCode: "take-in-store",
  });
  assert.equal(calls.filter((c) => c.name === "create-order").length, 1);
  for (const c of calls) assert.deepEqual(c.args.items, f.quote.args.items);
});

test("默认杯型或冰量不明确时停止，不替用户任选一个", () => {
  const missing = structuredClone(f.cola);
  missing.rounds[0].choices.forEach((c) => (c.isDefault = 0));
  assert.throws(
    () => singleProduct(missing, { id: "9900008751", category: "drink" }),
    /默认杯型/,
  );
  const ambiguous = structuredClone(f.sprite);
  ambiguous.modification.items[0].values[1].selectedQuantity = 1;
  assert.throws(
    () => singleProduct(ambiguous, { id: "3010", category: "drink" }),
    /默认冰量/,
  );
});
test("未知订单号恢复不能只凭同价餐品认定不同规格是同一单", async () => {
  const { recoveryCandidates } = await import("../lib/order-recovery.mjs");
  assert.throws(
    () =>
      recoveryCandidates(
        { list: [] },
        { snapshot: { requiresOptionVerification: true } },
      ),
    /历史列表不足以核对规格/,
  );
});
