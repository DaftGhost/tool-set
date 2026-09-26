# 工具集

本仓库按工具目录组织多个独立项目。每个工具可以使用自己的语言、运行环境和依赖；根目录负责工具目录入口、全量构建和部署编排。

## 本地启动整个站点

需要 Node.js 24.12 或更高的 24.x 版本和 Corepack。根目录通过 `packageManager` 固定使用 pnpm 12.7.0；首次执行时 Corepack 会准备对应版本。

在仓库根目录构建目录页和所有已注册的浏览器工具：

~~~sh
corepack pnpm run build
~~~

构建完成后，使用项目自带的 Node.js 静态服务器启动完整站点：

~~~sh
corepack pnpm run serve
~~~

然后访问 <http://localhost:9527/>。按 `Ctrl+C` 停止服务器。服务器只提供静态文件，不需要额外的运行时依赖；`site/` 是构建生成的目录。

运行根目录测试：

~~~sh
corepack pnpm run test
~~~

## 单独开发现有计算器

根目录命令预览完整站点；单独调试计算器时，在工具目录启动它自己的 Vite 开发服务器：

~~~sh
cd tools/llm-api-cost-calculator
corepack pnpm install
corepack pnpm run dev
~~~

计算器的功能、配置和其他命令见[工具 README](tools/llm-api-cost-calculator/README.md)。

## 项目结构

~~~text
tool-set/
├── catalog/                         # 工具目录页的 HTML、CSS 和 JavaScript
├── tools/
│   └── <browser-tool>/               # 每个工具独立管理源码、依赖和配置
│       ├── README.md                 # 该工具的功能、技术栈和运行说明
│       └── tool.json                 # 目录元数据及该工具的构建命令
├── scripts/
│   ├── build-site.mjs                # 扫描 tool.json，构建并组装完整站点
│   └── *.test.mjs                    # 构建器和目录页测试
├── docs/                             # 跨工具的产品与运维资料
├── .github/workflows/                # 测试、全量构建和 Pages 部署流程
├── package.json                      # 根级 test/build 命令
└── site/                             # 构建生成的完整站点
~~~

根目录构建器读取每个浏览器工具的 `tool.json`，分别执行其构建命令，将工具输出放到 `site/tools/<tool-name>/`，并生成目录页使用的工具清单。新增工具时，在自己的目录维护元数据和 README；目录页会在下一次构建时自动收录。

## 工具说明

- [LLM API 成本计算器](tools/llm-api-cost-calculator/README.md)：查看该工具的功能、依赖和独立开发命令。

## 许可

本项目采用 MIT License，完整条款见 [LICENSE](LICENSE)。

## AI 生成内容声明

本仓库的部分文档由 AI 协助编写；后续代码、文档或其他内容也可能由生成式 AI 生成或辅助生成。AI 生成内容可能不准确或不完整，使用者应结合实际情况核验。
