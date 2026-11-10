# dsh-token-bubble

**Token 用量气泡** —— [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 bundle 插件。

在 GUI 角落放一颗可拖动的胶囊，实时显示**全部工作区所有会话累计消耗的 token**；点一下展开会话级明细，想知道精确数字就点数值。

```
┌──────────────────────────────┐
│ 累计 Token 用量 · 全部工作区   │
│ 4 个会话 · 输入+输出+缓存合计  │
├──────────────────────────────┤
│ 小肥鱼          E:\deepseek… │
│ 103.3M          3 分钟前     │
│ 大肥鱼          E:\dsh工作区 │
│ 60.1M           1 小时前     │
└──────────────────────────────┘
        └── 角落胶囊 Σ 171.3M
```

## 功能

- **口径**：读取 DSH 会话投影（`$DSH_HOME/storages/session_projcache/sessions/*.json`）里的 `tokenUsage.totals`，把「未命中输入 + 输出 + 缓存读 + 缓存写」四类相加作为该会话累计值，再对所有会话求和——即整条会话日志的累计，不重算、不回填。
- **范围**：所有工作区加总；已归档会话、子代理会话一并计入（只要投影里有非零用量）。
- **悬浮窗**：右下角起点、可拖动；位置与开合状态记在 `localStorage`（`dsh-token-bubble:pos` / `dsh-token-bubble:open`）。
- **自适应面板**：胶囊在上半屏就往下开、在下半屏就往上开；靠左贴左、靠右贴右、居中则居中，空间不够时面板内部滚动。
- **实时**：浏览器端每 10 秒轮询一次 `/dsh-token-bubble/data.json`，窗口重新可见时立刻刷新；宿主端有 2 秒内存快照缓存。
- **主题**：跟随页面深浅色（量 `body` 背景亮度，而非 `prefers-color-scheme`），切换主题时自动换肤。
- **别名**：会话标题可以映射成任意名字（见下文「显示名」）。
- **只读**：不写入任何会话数据，只注册两个 HTTP 路由 + 注入一段脚本。

## 安装

```sh
dsh plugin --profile <你的profile> add https://github.com/Friade/dsh-token-bubble
```

也可以装 Release 里的 tarball：

```sh
dsh plugin --profile <你的profile> add https://github.com/Friade/dsh-token-bubble/releases/download/v0.1.0/dsh-token-bubble-0.1.0.tgz
```

本地源码安装：

```sh
dsh plugin --profile desktop add "link:D:\path\to\dsh-token-bubble"
```

包内声明了 `dsh.bundle`，`dsh plugin add` 会把它自动追加进 profile 的 `dsh.profile.bundles`；桌面端的挂件注入走 `webserver/index-inject`，热加载后通常无需重启宿主。

### 验证

```sh
curl -s http://127.0.0.1:<端口>/dsh-token-bubble/data.json | head -c 300
```

应返回 `{"ok":true,"total":…,"sessionCount":…,"sessions":[…]}`。

### 卸载

```sh
dsh plugin --profile <你的profile> remove dsh-token-bubble
```

## 显示名

默认显示 DSH 里的会话标题（没标题就用工作区目录名）。想换成别的名字，两种写法：

1. 文件（改完 5 秒内生效，不用重启）：`$DSH_HOME/dsh-token-bubble.json`

   ```json
   {
     "aliases": {
       "既白": "小肥鱼",
       "E:\\deepseek工作台": "深海工作台",
       "dsh工作区": "摸鱼区"
     }
   }
   ```

   键可以写会话标题、工作区完整路径，或工作区目录名（优先级按这个顺序）。

2. profile 里给插件配 `config.aliases`（覆盖文件里的同名键）：

   ```yaml
   - id: dsh-token-bubble
     name: dsh-token-bubble
     config:
       aliases:
         既白: 大肥鱼
   ```

## 配置

| 常量 | 默认 | 说明 |
| --- | --- | --- |
| `SESSIONS_DIR` | `$DSH_HOME/storages/session_projcache/sessions` | 投影缓存目录 |
| `ROUTE_BASE` | `/dsh-token-bubble` | 路由前缀 |
| `SNAPSHOT_TTL_MS` | `2000` | 快照缓存（`lib/index.js`） |
| `ALIAS_FILE` | `$DSH_HOME/dsh-token-bubble.json` | 别名文件 |
| `MARGIN` / `GAP` / `PAD` / `PANEL_W` | `18 / 8 / 8 / 300` | 挂件布局（`assets/widget.js`） |

## 结构

```
lib/index.js        # 宿主端 Cordis 插件：扫描投影、聚合、别名、路由、index 注入
assets/widget.js    # 浏览器端挂件（原生 JS，无依赖，IIFE）
cordis.patch.yml    # bundle patch 层
```

数据流：投影 JSON → `totalsOf()` 四类求和 → 别名替换 → `/dsh-token-bubble/data.json` → 挂件 `fetch` 渲染。

## License

MIT —— 见 [LICENSE](LICENSE)。