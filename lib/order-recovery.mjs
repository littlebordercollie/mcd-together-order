import { assert, fen, validateItems } from "./domain.mjs";

function chinaTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
  )
    return NaN;
  return Date.parse(value.replace(" ", "T") + "+08:00");
}

export function recoveryCandidates(data, attempt) {
  assert(
    Array.isArray(data.list),
    "官方历史订单格式无法确认，请到官方渠道核对。",
  );
  if (!attempt?.snapshot) return [];
  assert(
    !attempt.snapshot.requiresOptionVerification,
    "这笔订单含大小或冰量选择，历史列表不足以核对规格。请在麦当劳官方小程序确认这笔订单；不要再次下单。",
  );
  const { storeCode, items, totalFen } = attempt.snapshot;
  const start = Date.parse(attempt.startedAt);
  assert(Number.isFinite(start), "本机下单时间无法确认，请到官方渠道核对。");
  const expected = JSON.stringify(validateItems(items));
  return data.list.flatMap((row) => {
    try {
      const time = chinaTime(row.createTime);
      if (
        !row.orderId ||
        String(row.storeCode) !== storeCode ||
        String(row.orderType) !== "1" ||
        String(row.beType) !== "1"
      )
        return [];
      if (
        !Number.isFinite(time) ||
        time < start - 120000 ||
        time > start + 900000
      )
        return [];
      if (fen(row.realTotalAmount) !== totalFen) return [];
      const actual = validateItems(
        row.orderProductList.map((p) => ({
          productCode: String(p.productCode),
          quantity: Number(p.quantity),
        })),
      );
      if (JSON.stringify(actual) !== expected) return [];
      if (
        row.orderProductList.some(
          (p) => typeof p.productName !== "string" || !p.productName.trim(),
        )
      )
        return [];
      return [
        {
          orderId: String(row.orderId),
          storeName: String(row.storeName || attempt.snapshot.storeName),
          status: String(row.orderStatus || "订单状态待查询"),
          createdAt: row.createTime,
          totalFen,
          items: row.orderProductList.map((p) => ({
            name: String(p.productName),
            quantity: Number(p.quantity),
          })),
        },
      ];
    } catch {
      return [];
    }
  });
}

export function verifyRecoveredDetail(data, candidate) {
  assert(
    String(data.orderId) === candidate.orderId,
    "官方订单号与所选记录不一致。",
  );
  assert(
    fen(data.realTotalAmount) === candidate.totalFen,
    "订单金额发生变化，请到官方渠道核对。",
  );
  assert(Array.isArray(data.orderProductList), "官方订单餐品信息不完整。");
  const normalize = (rows) =>
    rows
      .map((p) => ({
        name: String(p.productName ?? p.name),
        quantity: Number(p.quantity),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  assert(
    JSON.stringify(normalize(data.orderProductList)) ===
      JSON.stringify(normalize(candidate.items)),
    "官方订单餐品与历史记录不一致，请到官方渠道核对。",
  );
}
