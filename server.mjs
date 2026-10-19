import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { McdClient } from "./lib/mcp.mjs";
import {
  assert,
  normalizeStores,
  menuCandidates,
  singleProduct,
} from "./lib/domain.mjs";
import { Orders } from "./lib/orders.mjs";
const port = Number(process.env.PORT || 3741),
  host = "127.0.0.1",
  csrf = randomBytes(32).toString("hex");
const root = resolve(import.meta.dirname, "web"),
  token = process.env.MCD_MCP_TOKEN || "",
  mcp = new McdClient(token);
const stores = new Map(),
  products = new Map();
const orderEnabled = process.env.MCD_ALLOW_ORDER === "true";
const orders = new Orders({
  mcp,
  storeFor: (id) => stores.get(id),
  productFor: (s, p) => products.get(s)?.find((x) => x.id === p),
  unit: process.env.MCD_PRICE_UNIT,
  enabled: orderEnabled,
  file: resolve(import.meta.dirname, ".local/order-journal.json"),
});
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".json": "application/json; charset=utf-8",
};
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": mime[".json"],
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    assert(data.length < 32768, "请求内容过大。");
  }
  return JSON.parse(data || "{}");
}
async function withQR(order) {
  return {
    ...order,
    qr: order.payUrl
      ? await QRCode.toDataURL(order.payUrl, { margin: 2, width: 260 })
      : "",
  };
}
async function route(path, b) {
  switch (path) {
    case "/api/stores": {
      assert(
        typeof b.city === "string" &&
          b.city.trim().length > 0 &&
          b.city.length <= 40,
        "请填写城市。",
      );
      assert(
        typeof b.keyword === "string" &&
          b.keyword.trim().length > 0 &&
          b.keyword.length <= 80,
        "请填写附近地标。",
      );
      const found = normalizeStores(
        await mcp.call("query-nearby-stores", {
          searchType: 2,
          beType: 1,
          city: b.city.trim(),
          keyword: b.keyword.trim(),
        }),
      );
      for (const s of found) stores.set(s.storeCode, s);
      return { stores: found };
    }
    case "/api/menu": {
      const store = stores.get(b.storeCode);
      assert(store, "请先查询并选择门店。");
      const args = {
        storeCode: store.storeCode,
        orderType: 1,
        beType: 1,
      };
      const candidates = menuCandidates(await mcp.call("query-meals", args));
      const menu = [];
      for (const c of candidates) {
        try {
          const d = await mcp.call("query-meal-detail", {
            ...args,
            code: c.id,
          });
          menu.push(singleProduct(d, c));
        } catch (error) {
          if (/套餐选项|没有可用图片/.test(error.message)) continue;
          throw error;
        }
      }
      assert(
        menu.length > 0,
        "这家门店当前没有适合首版图卡的单品，请换一家门店。",
      );
      products.set(store.storeCode, menu);
      return { store, menu };
    }
    case "/api/quote":
      return orders.quote(b.storeCode, b.items);
    case "/api/order":
      return withQR(await orders.create(b));
    case "/api/order-recovery": {
      const result = await orders.recovery();
      if (result.order) result.order = await withQR(result.order);
      return result;
    }
    case "/api/order-recover":
      return withQR(await orders.recover(b));
    case "/api/order-status":
      return withQR(await orders.status(b.orderId));
    default:
      throw new Error("请求地址不存在。");
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https: data:; media-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  try {
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)
    ) {
      json(res, 403, { error: "仅允许本机访问。" });
      return;
    }
    const url = new URL(req.url, `http://${host}:${port}`),
      path = decodeURIComponent(url.pathname);
    if (path === "/api/config" && req.method === "GET") {
      const journal = await orders.journal();
      json(res, 200, {
        live: !!token,
        orderEnabled,
        csrf,
        hasPendingOrder: !!journal && journal.state !== "closed",
      });
      return;
    }
    if (path.startsWith("/api/")) {
      assert(req.method === "POST", "此接口仅接受 POST。");
      assert(
        req.headers["x-app-token"] === csrf,
        "页面连接已过期，请刷新页面。",
      );
      assert(
        !req.headers.origin ||
          [`http://${host}:${port}`, `http://localhost:${port}`].includes(
            req.headers.origin,
          ),
        "请求来源无效。",
      );
      assert(
        req.headers["sec-fetch-site"] !== "cross-site",
        "不允许跨站请求。",
      );
      assert(
        req.headers["content-type"]?.startsWith("application/json"),
        "请求格式不正确。",
      );
      assert(token, "尚未配置麦当劳 MCP Token，当前可以体验演示。");
      json(res, 200, await route(path, await body(req)));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      json(res, 405, { error: "不支持该请求。" });
      return;
    }
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(root + sep) || !mime[extname(file)]) {
      json(res, 404, { error: "文件不存在。" });
      return;
    }
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)],
      "Cache-Control": "no-cache",
      "Content-Length": bytes.length,
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch (error) {
    if (error.code === "ENOENT") json(res, 404, { error: "文件不存在。" });
    else
      json(res, 400, {
        error:
          error instanceof SyntaxError ? "请求格式不正确。" : error.message,
        code: error.code === "ORDER_RECOVERY_REQUIRED" ? error.code : undefined,
      });
  }
});
server.listen(port, host, () =>
  console.log(
    `麦麦一起点 http://${host}:${port} · ${token ? "已配置 MCP，尚需实测" : "演示模式"} · ${orderEnabled ? "下单开关已启用" : "下单开关关闭"}`,
  ),
);
process.on("SIGINT", async () => {
  await mcp.close();
  server.close();
});
