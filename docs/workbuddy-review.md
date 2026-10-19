# 原型审查报告：麦麦一起点

- 审查者：WorkBuddy（依据 `skills/mcd-together-order/SKILL.md` 的「原型审查」节执行）
- 审查时间：2026-10-19 18:50–18:55 GMT+8
- 代码快照：以 18:51:48 的文件状态为准（`web/views.js` 18:49、`lib/orders.mjs` 18:47、`test/` 三个文件 18:51 写入）
- 审查方式：静态阅读源码 + 一次本地单元测试执行。**未启动服务、未打开浏览器、未调用任何真实 MCP。**

## 一、审查边界（先说没做什么）

已读：`skills/mcd-together-order/SKILL.md`、`docs/PLAN.md`、`web/state.js`、`web/app.js`、`web/views.js`、`lib/orders.mjs`；为核实语音与订单保护，另读 `web/audio.js`、`web/api.js`、`lib/domain.mjs`、`server.mjs`、`web/demo-data.js`、`test/*.test.mjs`、`package.json`、`scripts/build.mjs`、`CONTEST_DECLARATION.md`。

**未做**：

1. 未读取 `.env`、`.local`、`mcd-config.example.json` 之外的任何账号配置；未读取任何其他项目。
2. 未调用真实 MCP：`query-nearby-stores`、`query-meals`、`query-meal-detail`、`calculate-price`、`create-order`、`query-order` 全部未调用。
3. 未下单、未付款、未打开任何支付链接、未访问 GitHub 仓库确认是否存在。
4. 未做真实浏览器操作：无点击、无双击、无刷新、无语音播放、无桌面/平板/手机渲染核对，也无音频事件检测。
5. 实际执行过的命令仅三类：目录与文件列举、`npm test`（21 条本地单测，全部使用假 MCP 对象，无网络）、`node --test test/*.test.mjs`。

**关于快照漂移**：首次列举时 `test/` 为空，18:51 出现了 `domain.test.mjs`、`orders.test.mjs`、`state.test.mjs`。本报告按复核后的内容判定；若仓库仍在生成中，P2-1 可能已在你读到时被补齐。

## 二、五个检查项的结论

| 检查项 | 结论 | 主要依据 |
| --- | --- | --- |
| 是否忠实保留学生的自主选择 | **部分达成**。单次交接内保留良好；跨交接会丢失原始意愿 | P1-1、P1-2、P2-5 |
| 是否把演示说成真实能力 | **界面与文案层达成**；交付物层有可复核的不一致 | P2-1；`views.js:10,12,19,21,34,36` |
| 重复点击/语音/刷新是否误加数量 | **未发现误加**。三重保护成立；语音存在重复朗读与打断 | P2-2、P2-3 |
| 家长修改能否看见 | **单次可见，跨交接不可见**；孩子的反向改动完全无痕 | P1-1、P1-2 |
| 订单保护是否有明显缺口 | **主链路扎实，缺口在日志定位与解锁路径** | P1-3、P1-4、P2-6、P2-7 |

正面事实（有依据，一并记录）：学生页不显示价格、不计时、不判对错（`views.js:27` 卡片只有名称与描述，`views.js:29` 只显示「已选 N 份」）；同一餐品重复点选由 `choose()` 幂等拦截（`state.js:16`）；家长调整前后差异有专属区块（`views.js:32`）；演示态在四处明示（页头徽标 `views.js:10`、页脚 `views.js:12`、门店条 `views.js:19`、单价与合计 `views.js:21,34`、结束页 `views.js:36` 写明「没有创建订单或扣款」）；静态构建 `config` 直接短路为不可下单（`api.js:3`）。

---

## 三、P1（会影响真实使用或直接违背 SKILL 约定）

### P1-1 第二次交接会把「孩子的原始选择」覆盖成当前清单，并清空家长修改记录

**证据**

`web/state.js:27`
```js
export function handoff(s){s.original=structuredClone(s.basket);s.changes=[];s.quote=null;s.page='review';}
```

`web/views.js:31`（家长页顶部，宣称「孩子刚才选了」）
```js
const origin=s.menu.filter(p=>s.original?.[p.id]);
```

`web/app.js:35`、`:38`、`:56` 三处都会调用 `handoff`：首页「继续上次的选择」、求助弹窗里的「我是家长，查看清单」、孩子页「交给家长确认」。

**触发路径**：孩子选 A×2 → 交给家长 → 家长把 A 改成 1（`changes` 记 `{before:2,after:1}`）→ 家长点「让孩子再选」（`views.js:31` 的 `back-choice`）→ 孩子加一份 B 或再改 A → 再次「交给家长确认」→ `original` 被重写为当前清单（A×1、B×1），`changes` 清空。

**影响**：家长页此时显示「孩子刚才选了 A × 1、B × 1」，而孩子最初要的是 A×2；家长上一轮的调整也再无记录。刷新无法挽回，因为 `save()` 只存最新 state（`app.js:14`）。这直接违背 SKILL「保留学生原始选择」和「家长修改时列出修改前后差异」，也是本原型最核心的伦理承诺。

**建议**：`original` 只在首次交接时写入（`if(!s.original)`）；`changes` 改为按轮次追加并带 `round` 字段，交接只清「本轮未确认」标记，不删历史。

### P1-2 孩子自己的增减不留痕，家长页会出现无法解释的差异

**证据**

`web/state.js:15-18`（`choose` 直接写 1，不写 `changes`）
```js
export function choose(s,id){
 if(!s.menu.some(p=>p.id===id)||s.hidden.includes(id)||s.basket[id])return false;
 s.basket[id]=1;s.quote=null;return true;
}
```

`web/state.js:24`（只有 `byParent=true` 才记录）
```js
if(byParent)s.changes.push({id,before,after:next});
```

`web/app.js:53`（孩子点「不要了」时未传 `byParent`）
```js
case 'remove':changeQuantity(state,id,0);render();...
```

`web/views.js:32`（差异区块只渲染 `s.changes`）
```js
${s.changes.length?`<div class="changes">...`:''}
```

**触发路径**：家长把 A 从 1 改到 2 → 回选页 → 孩子点「不要了」再点「选这个」→ 清单变 1 份。此时 `original[A]=1`、`basket[A]=1`，顶部显示一致，但若孩子是在家长改到 2 之后操作，则顶部仍显示「A × 1」而清单可能为 2，`changes` 为空，页面上没有任何「这一份是谁加的」的说明。

**影响**：家长看到「孩子刚才选了 1 份」，清单却是 2 份，且无差异提示。SKILL 要求「列出修改前后差异，请家长和学生再次确认」，而当前差异只覆盖家长一侧，孩子侧改动是静默的。这条与 P1-1 同源但独立成立：即使 `handoff` 只写一次 `original`，孩子的后续改动依然无痕。

**建议**：把 `changes` 的语义从「家长改动」改为「与 `original` 的偏离」，在 `review` 渲染时用 `original` 与 `basket` 做一次全量 diff，不依赖操作侧打点。

### P1-3 订单日志用相对路径且 ENOENT 视为「无历史」，换启动目录即丢失未核实订单的锁

**证据**

`lib/orders.mjs:5`（默认相对路径）
```js
constructor({mcp,storeFor,productFor,unit,enabled=false,file='.local/order-journal.json',now=()=>Date.now()})
```

`lib/orders.mjs:6`（读不到就当没有历史）
```js
async journal(){try{return JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error('本机订单记录无法读取，请先核实历史订单。');}}
```

`lib/orders.mjs:21-22`（`previous` 为 null 就直接放行）
```js
assert(!previous||previous.state==='closed','上一笔订单尚未核实完成，请先查询官方状态，勿重复创建。');
```

`server.mjs:13`（构造时未传 `file`）
```js
const orders=new Orders({mcp,storeFor:id=>stores.get(id),productFor:(s,p)=>products.get(s)?.find(x=>x.id===p),unit:process.env.MCD_PRICE_UNIT,enabled:orderEnabled});
```

**影响**：`npm start` 从项目根启动时日志在 `<cwd>/.local/order-journal.json`；若用 `node /绝对路径/server.mjs` 从别处启动，cwd 不同 → 读到 ENOENT → `previous=null` → 上一笔 `uncertain`（超时未明）的订单锁失效，可再次 `create-order`。这正好击穿 SKILL「创建结果不明时先核对官方历史订单，禁止盲目重试」的唯一机械保障，而该保障是首版最重要的交易保护。

**测试为何没抓到**：`test/orders.test.mjs:6` 显式传了 `file:join(dir,'journal.json')`，回避了默认路径；`test/orders.test.mjs:14`（「下单超时跨进程重启仍阻止盲目重试」）复用了同一个 `options`，因此并未覆盖「换了目录重启」这一真实场景。

**建议**：`server.mjs` 传入基于 `import.meta.dirname` 的绝对路径；`journal()` 对 ENOENT 的处理改为「仅当目录确实不存在且从未初始化时视为空」，或启动时强制创建并写入哨兵文件。

### P1-4 订单锁只有一条解除路径，且绑定官方中文状态字符串；异常后无人工解锁入口

**证据**

`lib/orders.mjs:43`
```js
const closed=['订单已取消','订单已完成'].includes(result.status);await this.persist({...record,state:closed?'closed':'created',result});return result;
```

`lib/orders.mjs:22` 的门槛：只要 `previous.state !== 'closed'`，后续任何新订单都被拒绝。

`lib/orders.mjs:42`（状态直接取官方返回，不做归一）
```js
const result={...record.result,status:String(data.orderStatus||'订单状态待查询'),pickupCode:String(data.pickupCode||'')};
```

`web/app.js:75`（前端查状态还要求本地已有 `orderId`）
```js
case 'status':await run(button,async()=>{if(!state.order?.orderId)throw new Error('订单结果还不明确，请先核对官方历史订单。');...
```

**影响（两个方向）**

1. 官方若返回「已完成」「订单完成」「Completed」等与这两个字符串不完全一致的值，`closed` 永不成立，用户此后所有真实下单都被「上一笔订单尚未核实完成」挡住。
2. 当 `create` 抛「结果暂不明确」时，`state.order` 未被赋值（`app.js:73` 在 `await api('order')` 抛出时不会写 `state.order`），前端 `status` 分支直接报错、无入口；journal 停在 `uncertain`，后端永久拒绝新单。

两种情况下用户唯一的出路是手工删除或编辑 `.local/order-journal.json`。这比「人工核对后解锁」更危险，且 `docs/PLAN.md` 与 `SKILL.md` 都没有写这条运维路径。

**建议**：①状态归一化到枚举后再判断；②在服务端加一个需显式确认的「我已核对官方历史订单，解除锁」操作，记录时间与操作人，而不是让用户改文件；③`uncertain` 时前端应展示「去麦当劳官方渠道查历史订单」的具体指引，并提供解锁入口。

---

## 四、P2（可用性、可追踪性、可维护性缺口）

### P2-1 `test:browser` 指向不存在的脚本；README 与截图未落地

- `package.json:8`：`"test:browser": "node scripts/browser-test.mjs"`；18:51 复核时 `scripts/` 下无 `browser-test.mjs`（目录内仅 build/capture-docs/capture-food/fetch-food/inspect-mcp/make-audio/preview 七个文件）。任何人执行该命令都会立即失败。
- `docs/PLAN.md:31` 把「README、截图」列为交付物；仓库根无 `README.md`，`docs/screenshots/` 为 0 个文件。
- `docs/PLAN.md:34` 要求「桌面/平板/手机真实浏览器与音频事件检查」；`test-results/` 只有 `welcome-desktop.png`、`choose-desktop.png`、`choose-mobile.png` 三张，无平板、无音频事件证据。

判定：这是「计划 vs 产物」的不一致，不是界面层的虚假宣传（界面层标注是充分的，见第二节）。若提交前未补齐，评审者按 `package.json` 执行即失败，属于可预见的扣分点。

### P2-2 前端状态恢复不校验值域，非法数量可进入界面；非法 category 会白屏

`web/state.js:7`
```js
if(s?.version!==1 || !Array.isArray(s.menu) || !s.basket || !['demo','live'].includes(s.mode))return blankState();
```
只校验存在性，不校验 `basket` 的值是否为 1–5 的整数，也不校验 `page`、`category` 是否属于已知集合。`web/views.js:24` 的 `categories.find(c=>c.id===s.category)` 一旦为 `undefined`，紧接着的 `c.id` 会抛 TypeError，整页空白。

兜底是有效的：`lib/domain.mjs:23` 的 `validateItems` 强制 1–5，真实下单不会超量。因此结论是「不会误加数量、但可能显示非法份数或白屏」，不是交易风险。

### P2-3 语音会被打断、hover 与点击共用一个定时器

`web/audio.js:4`（每次朗读先停上一句）
```js
export function speak(text,key,button){stopAudio();enabled=true;...
```

`web/audio.js:16-19`
```js
let timer;
root.addEventListener('pointerover',...timer=setTimeout(()=>speak(...),450);});
root.addEventListener('pointerout',()=>clearTimeout(timer));
```

`web/views.js:27` 每张卡同时渲染 `food-pick`（`data-action="choose"`）与 `select-button`（`data-action="choose"`）两个入口，点击任一都会走 `app.js:52` 的 `speak(\`你选了，${p.name}。\`)`。

结论：数量安全（`state.js:16` 幂等，两个入口重复点也只加一份，`app.js:51` 会提示「已经选好了，还是一份」）。但语音会有两类问题：①在「听一听」上停留超过 450ms 后移到卡片按钮，`pointerout` 会取消尚未触发的朗读；②点击后确认语音打断正在播放的名称朗读，听觉上像"说了一半"。

### P2-4 家长「收起」餐品会静默删除已在清单里的选择

`web/app.js:41-44`
```js
case 'hide':
 if(state.hidden.includes(id))state.hidden=state.hidden.filter(x=>x!==id);
 else{state.hidden.push(id);delete state.basket[id];state.quote=null;}
```

不写 `changes`、不提示、不可撤销（再点一次只是取消隐藏，份数已丢）。常规流程里 `prepare` 只在选择前进入，触发概率低；但 `restore()` 会把 `basket` 带到 `prepare` 页（刷新后），此时收起即抹掉孩子的已有选择。

### P2-5 没有「今天什么都不选」的出口

`web/app.js:54`：`case 'recap':if(totalCount(state))go('recap');break;`
`web/views.js:30`：`btn('handoff',...,totalCount(s)?'':'disabled')`

SKILL 要求「保留换组和不选的路径」，目前只覆盖了「某一类先不选」（`views.js:28` 的 `skip`）。孩子逐一跳过三类后停在空页面，没有「我不想要」的收尾或交给家长的通道。对以自主表达为核心的原型，这是流程闭环缺口。

### P2-6 「家长确认」是 UI 布尔，`csrf` 由无鉴权的 `/api/config` 下发

`server.mjs:40`（GET，无任何鉴权，本机任何请求都能取到）
```js
if(path==='/api/config'&&req.method==='GET'){json(res,200,{live:!!token,orderEnabled,csrf});return;}
```

`web/app.js:73`（前端硬编码 true）
```js
state.order=await api('order',{quoteId:q.id,confirmedTotalFen:q.totalFen,parentConfirmed:true,takeWayCode:...});
```

`lib/orders.mjs:24` 仅校验 `parentConfirmed===true`。

缓解事实：`server.mjs:38` 的 host 白名单、`:44` 的 origin 校验、`:45` 的 `sec-fetch-site`、`:46` 的 content-type 与 POST-only，使外部网页无法构造下单请求。因此这是「本机其他进程可绕过确认」而非「公网可下单」。但文档与 UI 不应把该勾选描述为安全控制，它只是防误触的交互确认。

### P2-7 下单成功但写盘失败时，用户看到的错误被二次写盘覆盖

`lib/orders.mjs:32-36`
```js
try{
 const data=await this.mcp.call('create-order',args);assert(data.orderId,'官方没有返回订单号。');
 const result={...};
 await this.persist({...attempt,state:'created',result});return result;
}catch{await this.persist({...attempt,state:'uncertain'});throw new Error('下单结果暂不明确。...');}
```

`persist` 本身在 try 内：若订单已创建成功、随后 `persist('created')` 因磁盘问题抛错，会落到 catch 再写 `uncertain`；若这次写也失败，抛给用户的是底层 fs 错误而不是「结果不明确」。`catch{}` 没有保留原始错误，排查时无据可查。状态判断仍偏保守（不会重试），属错误处理质量问题。

### P2-8 报价有效期对用户不可见

`lib/orders.mjs:13` 设 `expiresAt=this.now()+5*60*1000`，`lib/orders.mjs:16` 的 `publicQuote` 只返回 `{...q}`，不含 `expiresAt`；`web/views.js:34` 只写「提交前会再次核价」。家长慢慢核对超过 5 分钟再点下单，会直接收到「报价已过期，请重新核价」，无任何倒计时或提前提示。

### P2-9 菜单归类依赖中文名正则，适配脆弱

`lib/domain.mjs:12` 用 `/套餐|组合|双人|多人|兑换|会员|麦金卡/` 排除、`/堡|麦满分|卷/` 归主食、`/薯条|麦乐鸡|玉米杯|派$/` 归小食；`lib/domain.mjs:15` 再用 `p.discountType||p.withOrder` 过滤。`lib/domain.mjs:18` 的 `rounds.length===0` 断言能兜住「套餐被误当单品」，但名称改版会导致整类餐品消失（`menuCandidates` 返回空 → `server.mjs:27` 报「这家门店当前没有适合首版图卡的单品」）。不构成交易风险，属接入适配风险。

---

## 五、明确未验证项

1. **支付域名白名单实际效果**：`lib/domain.mjs:9` 校验协议与 `mcd.cn / mcdchina.net / mcdonalds.com.cn`，逻辑正确且 `test/domain.test.mjs` 有对应用例（`npm test` 中「付款链接只接受官方 HTTPS 域名，拒绝相似域名和用户名伪装」通过），但**真实 `payH5Url` 长什么样、是否会落在白名单外**，未调用真实接口，无法确认。
2. **真实 MCP 的字段与单位**：`MCD_PRICE_UNIT` 未核实，`normalizeQuote` 对 `productList / takeWayList / price` 的假设未与官方实际响应比对。
3. **浏览器行为**：双击、刷新、语音、hover、`dialog.showModal` 焦点恢复（`app.js:11,16`）均未实测。
4. **桌面/平板/手机渲染与中文断行**：未打开页面，未核对。
5. **`docs/food-sources.json` 与图片权利**：未逐条核对来源。
6. **GitHub 仓库是否存在**：`views.js:12` 链接到 `littlebordercollie/mcd-together-order`，未访问。

## 六、执行留证（本次实际动作）

| 动作 | 结果 |
| --- | --- |
| 阅读 13 个源码/文档/测试文件 | 完成 |
| `npm test` | 21 条通过，0 失败；全部使用假 MCP 对象，无网络、无真实调用 |
| 目录列举（root / test / scripts / docs/screenshots） | 完成，发现 `test/` 在 18:51 被填充、`browser-test.mjs` 缺失、`docs/screenshots/` 为空 |
| 真实 MCP 调用 | **0 次** |
| 下单 / 付款 | **0 次** |
| 浏览器操作 | **0 次** |
| 代码修改 | **0 处**（本文件是新增的审查记录，未改动任何源码） |

---

审查结论一句话：**这条原型在「不催、不判、不替孩子选」和「演示与真实分开」两件事上做得比多数参赛原型扎实；风险集中在交接链条的可追溯性（P1-1、P1-2）和订单锁的定位与解锁（P1-3、P1-4），四处都指向同一个根因——状态只保留「最新一份」，而不是保留「过程」。**
