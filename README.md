# Claude Code Codex Edition

这个仓库是一个可本地运行的 Claude Code 改造版。默认目标不是继续走 Anthropic API，而是把底层模型请求桥接到你本机已经可用的 `codex` CLI，再由 `codex` 使用你自己的 GPT / OpenAI 配置完成实际推理。

仓库地址：

- [https://github.com/lixin9063/cc-codex](https://github.com/lixin9063/cc-codex)

适合的场景：

- 你想保留 Claude Code 这套终端 UI / 交互体验
- 你已经在本机装好了 `codex`
- 你希望 Claude Code 底层改走本机 Codex 的模型配置

## 当前实现

当前链路是：

```text
Claude Code UI
  -> 本仓库 query 层
  -> 本机 codex exec --json
  -> ~/.codex/config.toml 中配置的 provider / model
```

也就是说，这个项目本身不会直接硬编码 OpenAI HTTP 请求；它调用的是你机器上的 `codex` CLI。

## 前置条件

在本地安装和运行前，请先确保下面几项已经成立。

### 1. 安装 Bun

要求：

- `bun >= 1.2.0`

检查：

```bash
bun --version
```

如果没有安装，可参考 [https://bun.sh](https://bun.sh)。

### 2. 安装 Codex CLI

检查：

```bash
codex --version
codex exec --help
```

如果命令不存在，先把 `codex` 安装好，并确保它在你的 `PATH` 里。

### 3. Codex 已完成登录并可实际调用模型

至少要保证下面命令能跑通：

```bash
codex exec --json "Reply with exactly OK"
```

如果这一步不通，这个仓库也不会通。

### 4. `~/.codex/config.toml` 已配置好模型提供方

推荐至少确认这些字段：

```toml
model = "gpt-5.4"
model_provider = "openai"
```

如果你用的是别的 provider，也可以，但前提是 `codex exec` 本身已经工作正常。

## 安装

### 1. 获取代码

```bash
git clone https://github.com/lixin9063/cc-codex.git
cd cc-codex
```

### 2. 安装依赖

```bash
bun install
```

### 3. 安装一键启动命令

这一步会在你的 `~/.local/bin` 里生成几个全局命令，并自动绑定到你当前 clone 的仓库路径。

```bash
bun run codex-install-launchers
```

安装后会生成：

- `cc-codex`
- `cc-codex-debug`
- `cc-codex-bypass`

如果当前 shell 还找不到这些命令，执行：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

或者直接重开终端。

## 运行

### 方式 1：直接在项目目录运行

```bash
cd /path/to/cc-codex
bun run codex-dev
```

跳过权限确认：

```bash
cd /path/to/cc-codex
bun run codex-dev-bypass
```

### 方式 2：使用全局命令

安装 launcher 之后，任何目录都可以直接运行：

```bash
cc-codex
```

调试模式：

```bash
cc-codex-debug
```

跳过权限确认：

```bash
cc-codex-bypass
```

## 常用环境变量

### 指定模型

默认模型是 `gpt-5.4`。如果想临时切换：

```bash
CLAUDE_CODE_CODEX_MODEL=gpt-5.4 cc-codex
```

或者：

```bash
CLAUDE_CODE_CODEX_MODEL=gpt-5.4 bun run codex-dev
```

### 开启底层调试

```bash
CLAUDE_CODE_CODEX_DEBUG=1 cc-codex
```

或者直接：

```bash
cc-codex-debug
```

调试模式会输出类似：

```text
[codex-debug] dispatch model=gpt-5.4 cwd=/path/to/repo
[codex-debug] ok model=gpt-5.4 thread=... duration_ms=...
[codex-debug] cmd=codex exec --json ...
```

这可以直接证明当前请求确实是通过本机 `codex exec` 发出去的。

## 如何确认底层真的走了 Codex

推荐用下面几个方式验证。

### 1. 看调试输出

```bash
cc-codex-debug -p "say hi briefly" 2>&1
```

如果看到：

```text
[codex-debug] cmd=codex exec --json ...
```

说明底层确实走的是 `codex`。

### 2. 看子进程

开一个终端跑：

```bash
cc-codex
```

另一个终端执行：

```bash
ps -ax -o pid=,command= | rg "codex exec --json"
```

只要你在会话里发起请求，就应该能看到 `codex exec` 子进程。

### 3. 用随机副作用验证

在 `cc-codex` 里让它创建一个带随机名的文件，再去本地确认文件确实存在。这能证明不是固定字符串伪造。

## 构建

```bash
bun run build
```

产物在：

```text
dist/
```

## 关键入口

- CLI 入口：`src/entrypoints/cli.tsx`
- Codex 桥接：`src/utils/codex.ts`
- 主查询分支：`src/services/api/claude.ts`
- 全局 launcher 安装脚本：`scripts/install-codex-launchers.sh`

## 故障排查

### `bun: command not found`

先确认 Bun 已安装，并且在 PATH 中。如果你的 Bun 在默认位置，可以执行：

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

### `codex: command not found`

说明本机 Codex CLI 没装好，或者 PATH 没带上。先单独修好：

```bash
codex --version
```

### 启动了但回答不像 Codex

先直接跑调试模式：

```bash
cc-codex-debug
```

确认有没有这行：

```text
[codex-debug] cmd=codex exec --json ...
```

如果没有，说明环境变量或 launcher 没生效。

### 欢迎页模型名不对

当前欢迎页会优先显示 `CLAUDE_CODE_CODEX_MODEL`。如果你希望固定成别的值，可以：

```bash
export CLAUDE_CODE_CODEX_MODEL=gpt-5.4
cc-codex
```

## 许可与说明

这个仓库基于逆向 / 还原思路进行本地改造，请自行评估使用风险、兼容性和后续维护成本。最关键的运行前提始终是：

`codex exec` 本身必须先在你的机器上可用。
