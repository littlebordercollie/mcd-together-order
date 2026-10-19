import { McdClient } from "../lib/mcp.mjs";
const mcp = new McdClient(process.env.MCD_MCP_TOKEN);
try {
  console.log(JSON.stringify(await mcp.inspect(), null, 2));
  console.log(
    "当前工具参数规范已保存在 .local/mcp-schemas.json。此命令未下单。",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
