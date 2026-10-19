import { menuVoice } from "./menu-voice.mjs";

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
export function fen(value, unit = "yuan") {
  assert(
    typeof value === "string" || typeof value === "number",
    "官方金额缺失。",
  );
  assert(
    (unit === "fen" ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(String(value)),
    "官方金额格式无法确认。",
  );
  const n = Math.round(Number(value) * (unit === "fen" ? 1 : 100));
  assert(Number.isSafeInteger(n) && n >= 0, "金额超出可处理范围。");
  return n;
}
export function safeImage(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
export function paymentUrl(url) {
  try {
    const u = new URL(url);
    assert(
      u.protocol === "https:" && !u.username && !u.password,
      "付款链接格式不正确。",
    );
    assert(
      ["mcd.cn", "mcdchina.net", "mcdonalds.com.cn"].some(
        (d) => u.hostname === d || u.hostname.endsWith("." + d),
      ),
      "付款链接不是已知麦当劳官方域名。",
    );
    return u.href;
  } catch {
    throw new Error("付款链接需要人工核实，请到官方渠道查看订单。");
  }
}
export function normalizeStores(data) {
  assert(Array.isArray(data), "门店响应格式变化，请先更新适配。");
  return data
    .filter((s) => s.businessStatus === true && s.storeCode)
    .map((s) => ({
      storeCode: String(s.storeCode),
      name: String(s.storeName),
      address: String(s.address || ""),
      distance: Number.isFinite(s.distance) ? s.distance : null,
    }));
}
export function categoryOf(name) {
  if (/套餐|组合|双人|多人|兑换|会员|麦金卡|乐园餐/.test(name)) return null;
  if (/堡|麦满分|卷/.test(name)) return "main";
  if (/薯条|麦乐鸡|玉米杯|派$/.test(name)) return "side";
  if (/可乐|雪碧|饮用水|阳光橙|牛奶/.test(name)) return "drink";
  return null;
}
export function menuCandidates(data) {
  assert(
    data.meals && typeof data.meals === "object" && !Array.isArray(data.meals),
    "菜单响应格式变化，请先更新适配。",
  );
  const counts = { main: 0, side: 0, drink: 0 };
  return Object.entries(data.meals).flatMap(([id, p]) => {
    const category = categoryOf(p.name || "");
    if (!category || counts[category] >= 6 || p.discountType || p.withOrder)
      return [];
    counts[category]++;
    return [
      {
        id,
        name: p.name,
        category,
        image: safeImage(p.image),
        priceFen: p.currentPrice == null ? null : fen(p.currentPrice),
      },
    ];
  });
}
export function singleProduct(data, candidate) {
  assert(String(data.code) === candidate.id, "餐品编码不一致。");
  assert(
    Array.isArray(data.rounds) &&
      (data.rounds.length === 0 || isDrinkChoice(data, candidate)),
    "此商品需要套餐选项，不在首版范围内。",
  );
  const image = safeImage(data.image);
  assert(image, "此商品没有可用图片。");
  return {
    ...candidate,
    name: String(data.name),
    priceFen: candidate.priceFen ?? null,
    image,
    description: "点图片，可以选它。",
    source: "mcp",
    audio:
      menuVoice.find((p) => p.code === candidate.id && p.name === data.name)
        ?.key || "",
    defaultModification: defaultModification(data),
    variants: productVariants(data, candidate),
  };
}
function isDrinkChoice(data, candidate) {
  const r = data.rounds?.[0];
  return (
    candidate.category === "drink" &&
    data.rounds.length === 1 &&
    r.minQuantity === 1 &&
    r.maxQuantity === 1 &&
    Array.isArray(r.choices) &&
    r.choices.length > 0 &&
    r.choices.every((c) => /可乐.*[小中大]杯$/.test(c.name))
  );
}
function iceChoices(data) {
  const names = {
    标准: ["标准冰", "ice-standard"],
    去冰: ["去冰", "ice-none"],
    少冰: ["少冰", "ice-less"],
    多冰: ["多冰", "ice-more"],
  };
  const group = data.modification?.items?.find(
    (g) =>
      g.minValues === 1 &&
      g.maxValues === 1 &&
      g.values?.length &&
      g.values.every((v) => names[v.name] && v.selectedKey && v.code),
  );
  return group
    ? group.values
        .map((v) => ({
          code: String(v.code),
          key: v.selectedKey,
          name: names[v.name][0],
          audio: names[v.name][1],
          isDefault: v.selectedQuantity === 1,
        }))
        .sort(
          (a, b) =>
            ["ice-none", "ice-less", "ice-standard", "ice-more"].indexOf(
              a.audio,
            ) -
            ["ice-none", "ice-less", "ice-standard", "ice-more"].indexOf(
              b.audio,
            ),
        )
    : [];
}
function productVariants(data, candidate) {
  const round = data.rounds[0];
  if (!round && !iceChoices(data).length) return undefined;
  if (round)
    assert(
      round.choices.filter((c) => c.isDefault === 1).length === 1,
      "官方默认杯型暂时无法确认。",
    );
  return (round ? round.choices : [data]).map((c) => {
    const ice = iceChoices(c);
    if (ice.length)
      assert(
        ice.filter((i) => i.isDefault).length === 1,
        "官方默认冰量暂时无法确认。",
      );
    const size = c.name.match(/([小中大])杯/)?.[1];
    return {
      code: String(c.code),
      name: c.name,
      round: round ? String(round.id) : undefined,
      kind: /无糖/.test(c.name) ? "zero" : "regular",
      size: { 小: "small", 中: "medium", 大: "large" }[size] || "",
      isDefault: round ? c.isDefault === 1 : true,
      audio:
        menuVoice.find((v) => v.code === String(c.code) && v.name === c.name)
          ?.key || "",
      priceFen: round ? null : candidate.priceFen,
      defaultModification: defaultModification(c),
      iceOptions: ice,
    };
  });
}
export function configureItem(product, item) {
  const base = { productCode: item.productCode, quantity: item.quantity };
  if (!product.variants?.length) {
    assert(!item.selection, "该餐品不支持所选规格，请重新加载菜单。");
    return product.defaultModification
      ? { ...base, modification: product.defaultModification }
      : base;
  }
  const v = product.variants.find(
    (v) => v.code === item.selection?.variantCode,
  );
  assert(v && item.selection.needsHelp !== true, "请先确认餐品的大小和冰量。");
  const ice = v.iceOptions.find((i) => i.key === item.selection.iceKey);
  assert(
    ice || (!v.iceOptions.length && !item.selection.iceKey),
    "冰量选项无效，请重新选择。",
  );
  const values = (v.defaultModification?.values || []).filter(
    (x) => !ice || !v.iceOptions.some((option) => option.code === x.code),
  );
  if (ice) values.push({ code: ice.code, key: ice.key, quantity: 1 });
  const modification = values.length ? { values } : undefined;
  return v.round
    ? {
        ...base,
        roundList: [
          {
            round: v.round,
            comboItemList: [
              {
                code: v.code,
                quantity: 1,
                ...(modification ? { modification } : {}),
              },
            ],
          },
        ],
      }
    : { ...base, ...(modification ? { modification } : {}) };
}
export function configuredLabel(product, selection) {
  const v = product.variants?.find((v) => v.code === selection?.variantCode);
  if (!v) return null;
  const ice = v.iceOptions.find((i) => i.key === selection.iceKey);
  return v.name + (ice ? " · " + ice.name : "");
}
export function defaultModification(data) {
  if (!data.supportModify) return undefined;
  assert(Array.isArray(data.modification?.items), "官方默认配料暂时无法确认。");
  const values = [];
  for (const group of data.modification.items) {
    assert(Array.isArray(group.values), "官方默认配料暂时无法确认。");
    for (const value of group.values) {
      const quantity = value.selectedQuantity;
      assert(
        Number.isInteger(quantity) && quantity >= 0,
        "官方默认配料数量无法确认。",
      );
      const key = quantity > 0 ? value.selectedKey : value.unselectedKey;
      if (!key && quantity === 0) continue;
      assert(
        typeof key === "string" && key && value.code,
        "官方默认配料编码无法确认。",
      );
      values.push({ code: String(value.code), key, quantity });
    }
  }
  return values.length ? { values } : undefined;
}
export function validateItems(items) {
  assert(
    Array.isArray(items) && items.length > 0 && items.length <= 12,
    "请先选择 1 至 12 种餐品。",
  );
  const codes = new Set();
  return items
    .map((i) => {
      assert(
        typeof i.productCode === "string" &&
          !i.productCode.startsWith("demo-") &&
          !codes.has(i.productCode),
        "餐品编码无效或重复。",
      );
      assert(
        Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 5,
        "单品数量应在 1 至 5 份之间。",
      );
      codes.add(i.productCode);
      if (i.selection !== undefined)
        assert(
          i.selection &&
            typeof i.selection === "object" &&
            typeof i.selection.variantCode === "string" &&
            typeof i.selection.iceKey === "string",
          "规格选择格式无效。",
        );
      return {
        productCode: i.productCode,
        quantity: i.quantity,
        ...(i.selection
          ? {
              selection: {
                variantCode: i.selection.variantCode,
                iceKey: i.selection.iceKey,
                needsHelp: i.selection.needsHelp === true,
              },
            }
          : {}),
      };
    })
    .sort((a, b) => a.productCode.localeCompare(b.productCode));
}
export function normalizeQuote(data, items, unit) {
  assert(
    ["fen", "yuan"].includes(unit),
    "首次连接请先核实 calculate-price 金额单位，再在本机设置 MCD_PRICE_UNIT。",
  );
  assert(
    Array.isArray(data.productList) && data.productList.length === items.length,
    "官方报价餐品数量与清单不同，请重新选择。",
  );
  const rows = data.productList;
  const seen = new Set();
  const lines = rows.map((p) => {
    const requested = items.find(
      (i) => i.productCode === String(p.productCode),
    );
    assert(
      requested &&
        !seen.has(requested.productCode) &&
        Number(p.quantity) === requested.quantity,
      "官方报价与所选餐品不一致。",
    );
    seen.add(requested.productCode);
    return {
      id: requested.productCode,
      name: String(p.productName),
      quantity: requested.quantity,
      subtotalFen: fen(p.subtotal, unit),
    };
  });
  const takeWays = (data.takeWayList || [])
    .map((t) => ({
      code: String(t.takeWayCode ?? t.code ?? ""),
      name: String(t.title ?? t.takeWayName ?? t.name ?? ""),
    }))
    .filter((t) => t.code && t.name);
  return { totalFen: fen(data.price, unit), lines, takeWays };
}
