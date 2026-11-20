# 在 DeepSeek Harness 中配置 Numes — 完整指南

**目标：** 通过内置适配器 `llm-pi-ai` 在 DeepSeek Harness（DSH）中添加 Numes，将免费调用严格锁定在 **`author/model:free`** 路由上。

**作为捆绑包安装（推荐新装机使用）：**
```sh
dsh plugin --profile desktop add github:wwewtech/numes-deepseek-harness
```
接着启动代理（`node tools/numes-free-failover.mjs`），在模型选择框中选择预注册的 `numes-free` 即可。下面的手动步骤与该方式等价，只是更繁琐。

**验证捆绑确实应用了提供方注册（无需手动修改 profile）：**

```sh
dsh --profile desktop --dump-config | grep -A 4 "numes-free"
```

若看到如下 Loader 合并视图即证明 bundle 的 `cordis.patch.yml` 行已作用于现有 `llm-pi-ai`，与手编辑等同：

```yaml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      numes-free:
        ...
```

如果没有输出，请重复 `dsh plugin add` 以干净 profile 重试。

> **⚠️ Override 语义提示：** DSH 加载器的 patch 规则，`id: llm-pi-ai` + `config:` 会**整段替换**该插件的 `config`，不做深层合并。对于全新默认 profile 这是预期的（不会替换任何东西）。**如果你已经在该 profile 手改过其他 provider**（其他自定义 `providers.xxx`），bundle先会替换整个块。使用下方的 merge 辅助工具来保留它们。

**Merge 辅助工具（保留现有 provider）：**

若该 profile 上已有自定义 provider，生成一个 `--patch` overlay 来保留它们并追加 `numes-free`：

```sh
node tools/merge-providers.mjs --profile <你的-profile> > numes-merge.yml
dsh --profile <你的-profile> --patch numes-merge.yml web
```

该 overlay 落在 user patch layer（位于 bundle 之上），后续 bundle 更新不会覆盖你的自定义 provider。工具通过 `dsh --dump-config` 读取当前组合视图，并重新输出追加 `numes-free` 后的完整 `providers`。

本指南验证过：2026 年 11 月 17 日于 DSH Desktop 0.2.2-rc.3、Windows、Numes 美金密钥。2026 年 11 月 18 日再次复查：DSH rc.4/rc.5 仅调整服务端搜索与错误修复，本文档所述模型配置流程及密钥处理方式未变化。本指南为配置说明，**不是 DSH 插件**，也不会对你的 profile 运行安装器。本项目独立于两项服务。

> 已有 DSH 与密钥？直接跳到[步骤 3](#3-创建-inference-密钥)。
> 已配置但仍报 `QUOTA` / `402`？跳到[步骤 5：选 `:free`](#5-选择免费模型)。
> 想快速上手？`dsh plugin add github:wwewtech/numes-deepseek-harness`，启动代理，选 `numes-free`。搞定。

## 0. 前置条件

- 安装好 DSH Desktop 或可运行的 `dsh web`，能进入 **Settings → Models**。
- 你在 [numes.ai](https://numes.ai) 上的自己的账号。免费请求需已验证邮箱；若收到 `403 verified_email_required`，请访问 [Profile](https://numes.ai/dashboard/profile) 完成验证。
- 一把个人的 Numes **inference 密钥**。请勿在截图、prompt、issue、commit 中泄露它。
- 可联网。免费额度足够时无需充值。

**不需要** `our-free-model`、第三方下载器、Python、本地中继、token 收集工具或重复账号。

## 1. 启动 DSH

### 现成 Desktop 应用

打开你已经在运行的安装。使用其真实的 Settings 界面及版本信息，不要假定它和本文测试版本一致。

### 通过官方 Web UI 启动

按当前 [DSH 根目录 README](https://github.com/deepseek-ai/deepseek-harness#run) 操作，在撰写时大致是：

```sh
npx @deepseek-ai/dsh web
```

需要受支持的 Node.js 运行时；以当前 README 要求为准。请在你想作为工作目录的文件夹中启动：DSH 把调用目录作为默认文件系统位置。本地 Web UI 通常开在 `http://127.0.0.1:3080`，若打印出不同地址，以你的命令输出为准。

不要因为已有 DSH 实例就再启一个：直接配置已经在跑的那个。参见官方 [Web UI 指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md)。要进行真实 agent 任务时还需选择 **Choose workspace**；也可以先把模型配好。

## 2. 在 Numes 完成注册并验证邮箱

在 [numes.ai](https://numes.ai) 正常注册或登录，并点击发到邮箱的验证邮件完成验证。

## 3. 创建 inference 密钥

进入 [Numes → Keys](https://numes.ai/dashboard/keys) → **Create key** → 选择 **Inference**（不是 manage/token），选择币种（例如 USD），创建后系统**只显示一次**，请复制保存到本地密码管理器，切勿粘贴到聊天/issue/commit。

## 4. 在 DSH 中添加自定义模型提供方

DSH → **Settings → Models → Add model provider → Custom model API**。

| 字段 | 直连接 Numes（推荐先用） | 接本地代理（自动故障转移） |
|---|---|---|
| Provider ID | `numes` | `numes-free` |
| Base URL | `https://api.numes.ai/api/v1` | `http://127.0.0.1:8787/v1` |
| Protocol | **OpenAI Chat Completions** | **OpenAI Chat Completions** |
| API key | 你的 inference 密钥 | 任何占位符（真实密钥由代理持有） |

> 代理模式：`numes-free-failover.mjs` 监听 `127.0.0.1:8787`，做故障转移、5 秒到 5 分钟指数重试、自动发现免费模型、`Retry-After` 感知等。见下方[第 7 步](#7-可选运行本地代理)。

点击 **Fetch available models** 获取目录，再从返回的列表里**仅挑 ID 带 `:free` 后缀的项**，点击 **Update list** 保存。

## 5. 选择免费模型

**这是最关键的一步。** Numes 中的同一个模型可能既有付费端点也有免费端点：

- `moonshotai/kimi-k3.1-pro` — **付费**。零余额会立刻 `402 insufficient_credits`。
- `moonshotai/kimi-k3.1-pro:free` — **免费**，永不回退到付费端点。

**为什么知道 `:free` 不会扣费？** 来自官方文档的保证：`:free` 标识硬路由到免费端点，**永不 fallback 到付费**。没有人 `accepts-paid` 路径。当且仅当所有免费端点都无容量时返回 `503 provider_unavailable`，按 Numes 的 "no output, no charge" 原则，失败请求零净费。

如果你的朋友 repo 里看到无 `:free` 后缀的 ID 还能跑，那是该运营方拿自己余额兜底的（或该账号已充值）。**不要选这些**。每跳一次都是你的额度或可能的钱。

## 6. 第一次调用

在 DSH 输入模型选择器中切到刚添加的 provider 的 `:free` 模型。发送：

```
Reply with exactly one word: PONG
```

预期响应 `PONG`，并在响应头里见到：`X-Request-Id`，forums/help 里贴这个而不是 secret。`usage.cost` 应为 `0`。

遇到问题？继续读对应步骤：

| 症状 | 处理方式 |
|---|---|
| `402` "insufficient_credits" | **不是要你充值。** 你选中的 ID 没有 `:free` 后缀，改选带 `:free` 的，或先删掉 `numes / kimi-...-pro` 之类的付费路由。 |
| `503` "Service Unavailable" | **不是 bug。** 当前免费端点无容量，几秒到几分钟后自动恢复；我们的代理会自动重试。直连模式可手动换一个 `:free` ID 再发。 |
| `429` "Too Many Requests" | 免费层有独立限流；响应头 `Retry-After: <秒>` 给出冷却时间，**严格遵守**，不要太早重试。我们的代理自动遵守该值（取 `Retry-After` 与退避表的较大者）。 |
| `401` "invalid_credentials" | KEY 错、过期、被撤销或类型不对（管理 key、未完成的 key）。重新创建一把 inference 类型的 key。 |
| `403` "verified_email_required" | 邮箱未验证，请到 Profile 完成验证。 |
| 模型列表为空 | 关键页面 **Fetch available models** 再点一遍；选择 `:free` 项；保存。上游目录不断变，`moonshotai/...:free` 可能消失、其他 ID 冒出来。 |
| 内容为空，`finish_reason: length` | 你给 `max_tokens` 太小（推理 token 也吃这个上限）。改成 ≥1500，或在请求体里加 `reasoning: { "effort": "none" }`。 |

## 7. 可选：运行本地代理

代理文件：`tools/numes-free-failover.mjs`。零 runtime 依赖，Node 18+。

```bash
NUMES_API_KEY=sk-... node tools/numes-free-failover.mjs
```

它监听 `127.0.0.1:8787`。DSH provider 的 API key 字段填任意占位符即可（真实 KEY 注入到代理，不进 DSH UI）。

行为：
- 链内轮询（sticky 选上次成功的模型）；
- 全链失败：等待 5s → 10s → 15s → 30s → 1m → 2m → 5m → 5m…，Retry-After 感知；
- `401/402/403` 立即终止，无意义等待被打断；
- 每隔 5 分钟从 `GET /models` 自动发现新免费 ID，移除已下线的；
- 每个请求都附加 `provider.max_price {prompt:0,completion:0}`，二次确保永不付费。

## 8. 测试与详查

```bash
# 代理里查看当前选中的链与护卫标志
curl http://127.0.0.1:8787/status | jq .free,.retry

# 走代理发一次调用
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"auto","max_tokens":1500,"reasoning":{"effort":"none"},
       "messages":[{"role":"user","content":"Say PONG"}]}'
# 响应头：X-Numes-Free-Model: <实际命中的模型>
# 响应体：usage.cost = 0
```

`examples/` 目录里有完整 curl/Python/Node/PowerShell 脚本。

## 9. 卸载

### GUI

Settings → Models → 打开 Numes 卡片 → 删除，按提示清除本地 credential 记录。**删除路由不会吊销 Numes key**，请到 [Numes → Keys](https://numes.ai/dashboard/keys) 单独吊销/停用。

### YAML 回滚

编辑 profile 的 `cordis.patch.yml`，把新增的 `- id: llm-pi-ai providers.numes-free` 节点删掉，并清掉 `.credentials.yaml` 中该 provider 的 `refs.NUMES_API_KEY` 与 records 条目。请勿用别人的 YAML 覆盖你整个 profile。

## 10. 完整命令序列（速用）

```text
DSH 安装 / 启动
  → Numes 完成邮箱验证
  → Numes Keys → Create inference key
  → DSH Settings → Models → Add model provider → Custom model API
  → ID numes, API https://api.numes.ai/api/v1, protocol OpenAI Chat Completions
  → 粘贴 KEY 一次
  → Fetch available models → 仅选 ID 带 :free 后缀 → Update list → 保存
  → 在输入框选择模型 → 发送 PONG
```

或一键加捆绑：

```sh
dsh plugin --profile desktop add github:wwewtech/numes-deepseek-harness
NUMES_API_KEY=sk-... node tools/numes-free-failover.mjs
# DSH → model picker → 选 numes-free
```

## 参考来源

- [DSH 官方 run guide](https://github.com/deepseek-ai/deepseek-harness#run)
- [DSH 官方 provider guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)
- [Numes API Keys](https://numes.ai/docs/account/api-keys)
- [Numes `:free` 后缀与零扣费保证](https://numes.ai/docs/models#free-models)
- [Numes 错误参考](https://numes.ai/docs/api-reference/errors)

本指南基于 2026 年 11 月 17–18 日的实测，未来批准的可用性、配额、速率、隐私策略可能改变。请同时查阅上游文档，并对照自己账号验证实际成本。