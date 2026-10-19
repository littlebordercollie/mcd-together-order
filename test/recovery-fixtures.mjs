// Synthetic API fixtures. These are never production MCP evidence.
export const attempt = {
  quoteId: "fixture-quote",
  state: "uncertain",
  startedAt: "2026-10-19T10:00:00.000Z",
  snapshot: {
    storeCode: "fixture-store",
    storeName: "模拟门店",
    totalFen: 1400,
    items: [{ productCode: "123", quantity: 1 }],
  },
};
export const historyRow = {
  orderId: "fixture-order",
  orderType: "1",
  beType: "1",
  storeCode: "fixture-store",
  storeName: "模拟门店",
  orderStatus: "待支付",
  createTime: "2026-10-19 18:00:03",
  realTotalAmount: "14.00",
  orderProductList: [
    { productCode: "123", productName: "模拟单品", quantity: 1 },
  ],
};
export const detail = {
  orderId: historyRow.orderId,
  orderStatus: "待支付",
  realTotalAmount: "14.00",
  orderProductList: [{ productName: "模拟单品", quantity: 1 }],
  pickupCode: "",
};
