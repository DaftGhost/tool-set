# 工具集

本仓库按工具目录组织多个独立项目。每个工具可以使用自己的语言、运行环境和依赖；根目录负责工具目录入口、全量构建和部署编排。

## 本地开发整个站点

需要 Node.js 24.12 或更高的 24.x 版本和 Corepack。根目录通过 `packageManager` 固定使用 pnpm 12.7.0；首次执行时 Corepack 会准备对应版本。首次使用时，在根目录安装目录页和开发服务依赖，并在工具目录安装工具依赖：

~~~sh
corepack pnpm install --frozen-lockfile
cd tools/llm-api-cost-calculator
corepack pnpm install --frozen-lockfile
cd ../..
~~~

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

静态站点访问地址为 <http://localhost:9527/>；`site/` 是构建生成的目录。

运行根目录测试：

~~~sh
corepack pnpm run test
~~~

计算器的功能、配置和其他命令见[工具 README](tools/llm-api-cost-calculator/README.md)。

## 项目结构

~~~text
tool-set/
├── catalog/                         # React、TypeScript 和 Vite 工具目录页
├── tools/
│   └── <browser-tool>/               # 每个工具独立管理源码、依赖和配置
│       ├── README.md                 # 该工具的功能、技术栈和运行说明
│       └── tool.json                 # 目录元数据及该工具的开发、构建命令
├── scripts/
│   ├── build-site.mjs                # 扫描 tool.json，构建并组装完整站点
│   ├── dev-site.mjs                  # 启动目录页并代理所有已登记工具
│   └── *.test.mjs                    # 开发服务、构建器和目录页测试
├── docs/                             # 跨工具的产品与运维资料
├── .github/workflows/                # 测试、全量构建和 Pages 部署流程
├── package.json                      # 根级依赖、命令和开发服务默认地址
└── site/                             # pnpm build 生成的完整静态站点
~~~

根目录开发服务和构建器都会读取每个浏览器工具的 `tool.json`。开发服务按元数据启动各工具的开发命令，并通过一个本地地址代理工具路径；生产构建分别执行构建命令，将工具输出放到 `site/tools/<tool-name>/`，并生成目录页使用的工具清单。新增工具时，在自己的目录维护元数据和 README；目录页会在开发启动或下一次构建时自动收录。

### 开发服务元数据

工具的 `tool.json` 使用 `dev` 描述开发启动方式：

- `command` 是要启动的命令及参数数组。命令可以使用 `{host}`、`{port}`、`{basePath}` 和 `{rootPort}`，分别代表工具绑定地址、动态分配的工具端口、工具页面路径和根开发服务端口。
- `install` 是依赖缺失时显示给开发者的安装命令，不会由根开发服务自动执行。
- `environment` 设置工具进程需要的环境变量，可使用上述占位符。
- `hmr: true` 表示工具支持 HMR；根服务会代理页面和 WebSocket。`hmr: false` 时还需填写 `watch`，列出相对于工具目录的源码路径；这些文件变化会通过自动刷新脚本通知浏览器。
- `readinessPath` 可选，用于指定工具服务通过哪个 URL 路径报告就绪。

例如，Vite 工具可以把 `pnpm run dev` 及其路径、端口参数写在 `dev.command` 中，并用 `environment` 将 `{rootPort}` 传给 Vite 的 HMR 客户端配置。根脚本不需要登记具体工具名称或其端口。

## 工具说明

- [LLM API 成本计算器](tools/llm-api-cost-calculator/README.md)：查看该工具的功能、依赖和独立开发命令。

## 许可

本项目采用 MIT License，完整条款见 [LICENSE](LICENSE)。

## AI 生成内容声明

本仓库的部分文档由 AI 协助编写；后续代码、文档或其他内容也可能由生成式 AI 生成或辅助生成。AI 生成内容可能不准确或不完整，使用者应结合实际情况核验。
