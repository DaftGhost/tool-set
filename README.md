# 工具集

本仓库按工具目录组织多个独立项目。每个工具可以使用自己的语言、运行环境和依赖；根目录负责工具目录入口、全量构建和部署编排。

## 本地开发整个站点

需要 Node.js 24.12 或更高的 24.x 版本和 Corepack。根目录通过 `packageManager` 固定使用 pnpm 12.7.0；首次执行时 Corepack 会准备对应版本。首次使用时，在根目录安装目录页和开发服务依赖，并在工具目录安装工具依赖：

~~~sh
corepack pnpm install --frozen-lockfile
cd tools/llm-api-cost-calculator
corepack pnpm install --frozen-lockfile
cd ../privacy-profile-generator
corepack pnpm install --frozen-lockfile
cd ../random-persona-generator
corepack pnpm install --frozen-lockfile
cd ../..
~~~

随机人设工具还需首次下载、准备并导入本地 D1 数据，具体命令见[本地启动说明](tools/random-persona-generator/README.md#本地启动)。数据准备不由根开发服务或普通构建自动执行；未导入时页面可以打开，抽取接口返回 503。

在仓库根目录启动目录页和所有在 `tools/*/tool.json` 登记的浏览器工具：

~~~sh
corepack pnpm dev
~~~

默认访问 <http://localhost:5173/>，工具页面使用 `/tools/<工具目录名>/` 路径。根开发服务的默认地址配置在 `package.json` 的 `toolSet.devServer` 中，也可用 `TOOL_SET_DEV_PORT=5174 pnpm dev` 覆盖端口。计算器通过 Vite HMR 更新组件和样式；不支持 HMR 的工具可在元数据中声明 `dev.watch` 路径，文件变化时页面会自动刷新。按 `Ctrl+C` 会停止目录页和所有工具开发服务。

开发模式不需要先生成构建目录。首次生产构建前，先完成上方的根目录依赖安装；构建器会按各工具 `tool.json` 中的 `build.install` 安装工具依赖。生产构建和静态预览命令如下：

~~~sh
corepack pnpm run build
corepack pnpm run serve
~~~

静态站点访问地址为 <http://localhost:9527/>；`site/` 是构建生成的目录。`serve` 只提供静态页面，随机人设的抽取接口需要 Worker；验证完整功能时使用下方的[本地 Worker 预览](#部署到-cloudflare-workers)，或运行开发服务。

运行根目录测试：

~~~sh
corepack pnpm run test
~~~

各工具的功能、配置和独立运行命令见[工具说明](#工具说明)。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `catalog/` | React、TypeScript 和 Vite 工具目录页 |
| `tools/<browser-tool>/` | 每个工具独立管理源码、依赖和配置；`README.md` 说明运行方式，`tool.json` 声明目录元数据及开发、构建命令 |
| `tools/random-persona-generator/` | 人设前端、只读接口、D1 迁移及本地数据准备和导入脚本 |
| `worker/` | 站点 Worker 入口与绑定类型，连接人设接口和静态资源 |
| `scripts/build-site.mjs` | 扫描 `tool.json`，构建并组装完整站点 |
| `scripts/dev-site.mjs` | 启动目录页并代理所有已登记工具 |
| `scripts/*.test.mjs` | 开发服务、构建器和目录页测试 |
| `docs/` | 跨工具的产品与运维资料；多数文件按仓库规则仅保存在本地 |
| `.test-result/` | 一次性测试文件、临时测试脚本及验收输出，仅保存在本地 |
| `wrangler.json` | Worker 入口、静态资源、源数据版本，以及独立的本地 D1 环境配置 |
| `package.json` | 根级依赖、命令和开发服务默认地址 |
| `site/` | `pnpm run build` 生成的完整静态站点 |

根目录开发服务和构建器都会读取每个浏览器工具的 `tool.json`。开发服务按元数据启动各工具的开发命令，并通过一个本地地址代理工具路径；生产构建分别执行构建命令，将工具输出放到 `site/tools/<tool-name>/`，并生成目录页使用的工具清单。新增工具时，在自己的目录维护元数据和 README；目录页会在开发启动或下一次构建时自动收录。

### 开发服务元数据

工具的 `tool.json` 使用 `dev` 描述开发启动方式：

- `command` 是要启动的命令及参数数组。命令可以使用 `{host}`、`{port}`、`{basePath}` 和 `{rootPort}`，分别代表工具绑定地址、动态分配的工具端口、工具页面路径和根开发服务端口。
- `install` 是依赖缺失时显示给开发者的安装命令，不会由根开发服务自动执行。
- `environment` 设置工具进程需要的环境变量，可使用上述占位符。
- `hmr: true` 表示工具支持 HMR；根服务会代理页面和 WebSocket。`hmr: false` 时还需填写 `watch`，列出相对于工具目录的源码路径；这些文件变化会通过自动刷新脚本通知浏览器。
- `readinessPath` 可选，用于指定工具服务通过哪个 URL 路径报告就绪。

例如，Vite 工具可以把 `pnpm run dev` 及其路径、端口参数写在 `dev.command` 中，并用 `environment` 将 `{rootPort}` 传给 Vite 的 HMR 客户端配置。根脚本不需要登记具体工具名称或其端口。

## 部署到 Cloudflare Workers

站点通过 Workers 的静态资源托管（Static Assets）发布整个 `site/` 目录，目录页位于 `/`，各工具位于 `/tools/<工具目录名>/`。目录地址会自动补齐末尾斜杠；不存在的路径返回 404。

首次部署时，用 Wrangler 登录 Cloudflare 账号：

~~~sh
corepack pnpm exec wrangler login
corepack pnpm exec wrangler whoami
~~~

构建目录页和全部已登记工具后发布：

~~~sh
corepack pnpm run deploy
~~~

`deploy` 会先执行全量构建；构建失败时不会上传。Workers 名称为 `tool-set`，部署成功后 Wrangler 会输出该账号下的 `workers.dev` 地址。需要自定义域名时，在 Cloudflare 的 Workers 设置中为该 Worker 添加域名。

默认发布配置没有 `PERSONAS_DB` D1 绑定，网站可以独立发布；线上随机人设接口在数据库未配置时返回 503。人设功能上线前需完成该工具 [README](tools/random-persona-generator/README.md#后续部署) 中的账号、容量和数据核验条件，再添加真实的 D1 绑定。普通构建及部署命令不会上传人设数据。本地占位 ID 只在 `env.local` 和工具的本地配置中使用，不进入默认发布。

完成本地数据导入后，验证 Worker 的静态资源路由和人设抽取接口：

~~~sh
corepack pnpm run preview:workers --persist-to .wrangler/state
~~~

按 Wrangler 输出的本地地址打开目录页和 `/tools/random-persona-generator/`。这条命令先构建，再用 `--env local --local` 启动本地 Worker，复用数据导入时的 D1 状态，不执行远程部署。不要发布 `local` 环境，它的数据库 ID 只用于本地模拟。Cloudflare 的绑定与变量不会从默认配置继承到命名环境，因此本地环境单独声明了 D1 及数据版本；参见[环境配置官方文档](https://developers.cloudflare.com/workers/wrangler/environments/#non-inheritable-keys-and-environments)。

### 推送后自动部署

自动部署使用 Cloudflare 的仓库构建服务（Workers Builds）。在 `tool-set` Worker 的 **Settings → Builds → Connect** 中连接 GitHub 仓库 `DaftGhost/tool-set`，使用以下设置：

| 设置 | 值 |
| --- | --- |
| 生产分支（Production branch） | `main` |
| 根目录（Root directory） | 仓库根目录 |
| 构建命令（Build command） | `pnpm run test && pnpm run build` |
| 部署命令（Deploy command） | `pnpm exec wrangler deploy` |
| 构建环境变量 | `NODE_VERSION=24.18.0`、`PNPM_VERSION=12.7.0` |

连接后，每次推送到 `main` 都会触发测试、全量构建和部署；测试或构建失败时不会更新线上站点。其他分支的预览构建（Preview builds）保持关闭。测试、构建和生产发布均由 Workers Builds 执行，仓库不保留 GitHub Actions 工作流，本地 Wrangler 命令仍可用于手动发布。

配置保存后，推送一次提交，并在 Cloudflare 构建记录中核对提交标识和部署结果，确认触发链路实际运行。自动部署配置参考 [Workers Builds 官方文档](https://developers.cloudflare.com/workers/ci-cd/builds/)。

迁移旧站点时，除移除 Pages 工作流，还需在仓库的 **Settings → Pages** 中取消发布，并将发布来源改为 **Deploy from a branch**、分支设为 **None** 后保存。确认页面显示 **GitHub Pages is currently disabled**，避免只删除工作流文件，却留下已发布的旧站点。

配置和锁文件可以提交到 Git；Cloudflare 登录凭据及 `.wrangler/` 本地状态不应提交。静态资源配置参考 [Cloudflare 官方文档](https://developers.cloudflare.com/workers/static-assets/)。

## 工具说明

- [LLM API 成本计算器](tools/llm-api-cost-calculator/README.md)：查看该工具的功能、依赖和独立开发命令。
- [隐私替代资料生成器](tools/privacy-profile-generator/README.md)：按地区生成双语的合成资料，并在浏览器本地管理历史。
- [随机人设生成器](tools/random-persona-generator/README.md)：通过 Worker 与 D1 从 NVIDIA 的 `nvidia/Nemotron-Personas-USA` 数据集抽取人物，集中展示姓名、正文使用人称代词（personal pronouns），支持英文结构化档案复制和最近 20 份浏览器本地历史。

## 全局设计风格

工具目录页与各工具页面的设计以[鼠尾草绿分析工作台规范](docs/frontend-design-style.md)为准，统一配色、字体、视觉层次与交互表达。

## 许可

本项目采用 MIT License，完整条款见 [LICENSE](LICENSE)。

随机人设使用的 NVIDIA 数据集采用 CC BY 4.0；展示和复制保留数据来源、许可及加工说明。数据集许可独立于本项目代码许可，详见[工具说明](tools/random-persona-generator/README.md)。

## AI 生成内容声明

本仓库的部分文档由 AI 协助编写；后续代码、文档或其他内容也可能由生成式 AI 生成或辅助生成。AI 生成内容可能不准确或不完整，使用者应结合实际情况核验。
