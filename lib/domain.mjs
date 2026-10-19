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
    .filter((s) => s.businessStatus === true && s.storeCode && s.beCode)
    .map((s) => ({
      storeCode: String(s.storeCode),
      beCode: String(s.beCode),
      name: String(s.storeName),
      address: String(s.address || ""),
    }));
}
export function categoryOf(name) {
  if (/套餐|组合|双人|多人|兑换|会员|麦金卡/.test(name)) return null;
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
    return [{ id, name: p.name, category, image: safeImage(p.image) }];
  });
}
export function singleProduct(data, candidate) {
  assert(String(data.code) === candidate.id, "餐品编码不一致。");
  assert(
    Array.isArray(data.rounds) && data.rounds.length === 0,
    "此商品需要套餐选项，不在首版范围内。",
  );
  const image = safeImage(data.image);
  assert(image, "此商品没有可用图片。");
  return {
    ...candidate,
    name: String(data.name),
    priceFen: fen(data.price),
    image,
    description: "点图片，可以选它。",
    source: "mcp",
    audio: "",
  };
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
      return { productCode: i.productCode, quantity: i.quantity };
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
      name: String(t.takeWayName ?? t.name ?? ""),
    }))
    .filter((t) => t.code && t.name);
  return { totalFen: fen(data.price, unit), lines, takeWays };
}
