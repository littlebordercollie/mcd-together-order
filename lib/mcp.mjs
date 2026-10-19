import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Ajv from "ajv";
import { mkdir, appendFile, writeFile } from "node:fs/promises";
const localDir = new URL("../.local/", import.meta.url);
const allowed = new Set([
  "query-nearby-stores",
  "query-meals",
  "query-meal-detail",
  "calculate-price",
  "create-order",
  "query-order",
  "order-list",
  "now-time-info",
]);
export function unwrap(result) {
  if (result.isError)
    throw new Error("麦当劳工具返回错误，请检查连接或稍后再试。");
  let value = result.structuredContent;
  if (!value) {
    const blocks = result.content?.filter((c) => c.type === "text") || [];
    for (const block of blocks) {
      try {
        value = JSON.parse(
          block.text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
        );
        break;
      } catch {}
    }
  }
  if (!value || typeof value !== "object")
    throw new Error("官方响应格式与预期不同，已停止处理。");
  if (
    value.success === false ||
    (value.code !== undefined && ![0, 200, "0", "200"].includes(value.code))
  )
    throw new Error("官方暂未完成此次请求，请核对门店或餐品后重试。");
  return value.data ?? value;
}
export class McdClient {
  constructor(token) {
    this.token = token;
    this.schemas = new Map();
    this.client = null;
    this.pending = null;
    this.ajv = new Ajv({
      strict: false,
      allErrors: true,
      validateFormats: false,
    });
  }
  async connect() {
    if (this.client) return;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      if (!this.token) throw new Error("请先在本机 .env 配置 MCD_MCP_TOKEN。");
      const client = new Client({
        name: "mcd-together-order",
        version: "0.1.0",
      });
      const transport = new StreamableHTTPClientTransport(
        new URL("https://mcp.mcd.cn"),
        {
          requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
          reconnectionOptions: {
            maxReconnectionDelay: 1000,
            initialReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1,
            maxRetries: 0,
          },
        },
      );
      try {
        await client.connect(transport, { timeout: 20000 });
        let cursor;
        do {
          const result = await client.listTools(
            cursor ? { cursor } : undefined,
            { timeout: 20000 },
          );
          for (const tool of result.tools) {
            if (allowed.has(tool.name))
              this.schemas.set(tool.name, {
                ...tool,
                validate: this.ajv.compile(tool.inputSchema),
              });
          }
          cursor = result.nextCursor;
        } while (cursor);
        this.client = client;
      } catch {
        await client.close().catch(() => {});
        throw new Error("麦当劳 MCP 连接失败，请检查 Token 和网络。");
      }
    })();
    try {
      await this.pending;
    } finally {
      this.pending = null;
    }
  }
  async arguments(name, args) {
    await this.connect();
    const tool = this.schemas.get(name);
    if (!tool) throw new Error(`当前 MCP 没有提供 ${name}。`);
    const properties = tool.inputSchema.properties || {};
    const picked = Object.fromEntries(
      Object.entries(args).filter(
        ([k, v]) => Object.hasOwn(properties, k) && v !== undefined,
      ),
    );
    if (!tool.validate(picked))
      throw new Error(`当前 ${name} 入参规范需要适配，已停止调用。`);
    return picked;
  }
  async call(name, args = {}) {
    if (!allowed.has(name)) throw new Error("此工具不在应用允许范围内。");
    const input = await this.arguments(name, args);
    const started = Date.now();
    let success = false;
    try {
      const raw = await this.client.callTool(
        { name, arguments: input },
        undefined,
        { timeout: 25000 },
      );
      const data = unwrap(raw);
      success = true;
      return data;
    } finally {
      await mkdir(localDir, { recursive: true, mode: 0o700 });
      await appendFile(
        new URL("mcp-calls.jsonl", localDir),
        JSON.stringify({
          at: new Date().toISOString(),
          tool: name,
          success,
          elapsedMs: Date.now() - started,
        }) + "\n",
        { mode: 0o600 },
      );
    }
  }
  async inspect() {
    await this.connect();
    const tools = [...this.schemas.values()].map(
      ({ validate, ...tool }) => tool,
    );
    await mkdir(localDir, { recursive: true, mode: 0o700 });
    await writeFile(
      new URL("mcp-schemas.json", localDir),
      JSON.stringify({ at: new Date().toISOString(), tools }, null, 2),
      { mode: 0o600 },
    );
    return tools.map((t) => ({
      name: t.name,
      required: t.inputSchema.required || [],
    }));
  }
  async close() {
    await this.client?.close();
  }
}
