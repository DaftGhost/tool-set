# 随机人设生成器

从 NVIDIA 的 `nvidia/Nemotron-Personas-USA` 固定版本随机抽取人物，展示姓名、概况、性格、职业、兴趣、文化背景和技能。中文界面按英文源字段整理内容；前端将字段组合为类似 Yoondi 人物档案的 Markdown，供预览和复制。导出是重新排版的文本，保留 NVIDIA 署名、CC BY 4.0 来源及加工说明。随机抽取允许重复。

前端使用 React、TypeScript 和 Vite，后端使用 Cloudflare Worker 与 D1。运行时只读（read-only）数据库，复制在浏览器内完成；首次导入与新版本准备是独立的写入流程。没有语言切换、翻译服务或后端访问历史写入；抽取历史只保存在当前浏览器。

实现已在[功能提交 94bb68b](https://github.com/DaftGhost/tool-set/commit/94bb68b2cc61f8541061981417ea1d1110d24fab)中推送至 `codex/random-persona-generator` 分支，已完成本地数据与浏览器验收。尚未部署，远程 D1 数据库和数据导入仍需单独准备。

## 本地启动

使用 Node.js 24.x、Corepack 和 pnpm 12.7.0。在本目录运行：

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run data:download
corepack pnpm run data:prepare
corepack pnpm run data:import-local
corepack pnpm run dev
```

固定修订版本（revision）是 `5b4cd35ab46490c1da1bd2b5a2324d6f871be180`，共有 11 个文件、100 万条记录，下载约 2.69 GB。完整 SQLite、SQL 批次和下载文件需要数十 GB 本地空间；准备与导入独立于普通构建。`data:download` 校验文件清单中的大小和 SHA-256，已有匹配文件会复用；下载失败后可以重跑。

打开 `http://127.0.0.1:5173/tools/random-persona-generator/`。开发命令启动本地 Worker 和 Vite，停止时关闭两个服务。未导入或未完成校验时抽取返回 503，页面提示重试。根目录的 `corepack pnpm dev` 自动发现本工具，并统一代理其页面和接口。

本地模拟（local emulation）不需要 Cloudflare 登录或付费套餐。数据目录为 `.local-data/<revision>/`，本地 D1 位于仓库根 `.wrangler/state/v3/`，开发服务和导入共用该状态。下载数据、数据库、校验报告、日志和构建输出均被忽略，不进入前端包或 Git。

本地数据准备完成后，从仓库根目录运行 `corepack pnpm run preview:workers --local --persist-to .wrangler/state`，可验证完整构建与本地接口；访问地址以 Wrangler 输出为准。根目录 `corepack pnpm run serve` 只提供静态页面，不能单独验证人设抽取。

## 数据准备与保真

`data:prepare` 校验全部源文件、字段集合及百万条记录，按 Parquet 行组读取。保留全部 23 个源字段、原始空字符串和换行；邮编保持字符串，年龄保持整数，不补写姓名或推测年龄。两个源列表的原始编码保留，另外保存规范数组。

列表解析仅支持普通字符串字面量和相邻字符串，不执行表达式。全量扫描发现一条技能列表多包了一层外部列表：规范数组只去掉这一层包装，原始字段不变，页面及导出注明加工。不能解析、UUID 重复或字段不兼容时终止并记录具体行，不能跳过错误记录。年龄不大于 0 时保留并提示“源字段需核查”，不承诺所有人设均为成年人。

每行写入 SQLite 后回读全部源字段、规范数组和摘要；数据库完成后记录字段摘要、缺失统计、年龄分布、文件与索引总大小、查询计划，写入 `audit.json`。中断时已提交的批次保留，重跑会核对已有记录，内容不一致时终止。全量大小若超过单个 D1 上限，停止导入，先准备经核验的分库映射，不缩减数据量。

SQL 导出保留字符串的 UTF-8 字节，单语句不超过 100,000 字节，批次不超过约 8 MiB。`data:import-local` 只操作本地 D1：逐批校验 SQL 摘要，执行后从 D1 回读并逐字段核对 SQLite。`local-import-progress.json` 保留续跑位置，重跑仍核验已有数据；总数与连续编号全部确认后才执行 `ready.sql`。完整结果写入 `local-import-verification.json`。不能直接将原始 SQLite 文件上传到 D1。

## 接口与复制

`GET /tools/random-persona-generator/api/random` 返回 `schemaVersion: 2`、源 UUID `recordId`、`datasetVersion`、`sourceHash`、`source`、全部源 `fields` 和规范 `lists`。从完整连续行号中等概率抽取，再通过主键读取一行；查询元数据与人物记录，不更新任何表。响应设置 `Cache-Control: no-store`，不返回预拼接档案。

未就绪、版本不匹配、字段或摘要错误、读取失败返回 503；不支持的方法返回 405；未知接口返回 404。前端直接渲染字段，不反解析标题或执行 HTML。请求失败保留上次人物。预览与复制共用 `formatCharacterSheet(snapshot)`，复制确认后才显示成功；剪贴板不可用时展开并选中英文档案文本供手动复制。

源数据没有独立姓名字段。前端从叙述开头取得候选姓名，至少在两个不同叙述字段中出现才采用；单词姓名需三个字段支持，已确认的完整姓名优先于简称，同等支持的不同姓名视为无法确认。姓名集中放在概况顶部和导出的 `Name` 一行；正文中的完整姓名及可识别的简称改用人称代词（personal pronouns）He、She 或 They，不生成 `This character` 称谓。代词依据英文叙述：只有一组代词获得至少两个字段支持时采用该组，冲突或未明确时使用 They，不按 `sex` 推断。处理常见主格、宾格、所有格，以及 They 的直接谓语、简单同位语和 `also` 后的动词变化；保留其他源内容。姓名与代词识别均为有限文本规则，不保证理解全部语法或每个代词的指代。无法确认姓名时显示 `Name not identified`、导出 `Name: Not identified`，并保留源正文。处理只在前端执行，源字段与数据库保持不变，导出注明加工。

## 浏览器本地历史

每次抽取成功保存源快照与抽取时间，保留最近 20 份；相同 UUID 与数据版本重新抽取时移到最前，不重复占位。打开“本地历史记录”可恢复查看，并使用当前人物的复制按钮；恢复不请求后端，也不修改抽取时间。刷新后默认恢复最近一次抽取的人物。清空只删除本工具的历史，当前页面人物仍可查看和复制。

数据使用浏览器本地存储（localStorage），键为 `tool-set:random-persona-generator:history:v1`，包含原字段、数组与来源，不上传 D1 或其他服务。历史限于当前源版本及字段契约；损坏或不兼容条目会提示并保留可用条目。存储被禁止或空间不足时，提示保存失败，当前人物及本次会话的历史仍可使用。它不提供跨浏览器同步；清理站点数据会删除历史，多个标签页并发写入时以最后一次保存为准。

## 检查与构建

```sh
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run build
```

测试覆盖字段验证、姓名与代词处理、英文格式化、源列表解析、等概率抽样、SQLite 与 SQL 往返、失败续跑、未就绪状态、异步交互、复制及本地历史。真实 workerd／D1 测试验证本地导入与只读接口。构建输出为 `dist/`；根目录的测试和构建验证目录接入及全部工具。

修改 Wrangler 绑定后运行 `corepack pnpm run types:generate`，从根配置重新生成 Worker 类型。配置保持当前兼容日期，不隐式升级 Wrangler。

2026-10-05 本地验收结果：根目录 24 项测试、工具 33 项测试、类型检查和全量构建通过；百万条源记录与本地 D1 完整回读核对通过。桌面和手机验证了抽取、刷新恢复、历史选择及复制；实际复制全文与预览逐字一致，手机没有横向溢出。历史选择未发出网络请求。这些结果不代表远程部署或线上性能已经验证。

## 后续部署

部署留待后续，普通构建不上传人设数据。根配置的 D1 `database_id` 是本地占位符，不能当作已创建的远程资源。部署前需核对账号、套餐与权限，创建单独版本数据库并填入真实 ID，导入兼容 SQL，完成远程全量回读后才切换 `PERSONAS_DB` 和 `PERSONA_DATASET_VERSION`。全量数据不能装入免费的 500 MB 单库；实际远程存储、CPU、性能和费用须在目标账号验证。

保留上一个已验证版本的数据与 Worker 配置。Worker 回退不会恢复数据库；回退时同时核对绑定、源版本和就绪状态。本工具只提供本地导入命令，远程操作需在部署阶段另行执行并验收。

来源：[固定版本数据集](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA/tree/5b4cd35ab46490c1da1bd2b5a2324d6f871be180)、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。设计与验收材料位于本地 `docs/random-persona-generator-plan.md`、`docs/random-persona-generator-usa-research.md`，以及同目录的截图和复制全文；这些文件按仓库规则未提交到 Git，克隆仓库不会包含它们，也不影响工具运行。
