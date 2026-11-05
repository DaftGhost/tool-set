# 文本格式化

在浏览器里整理 JSON、XML 和 SQL。粘贴文本后按 JSON、XML、SQL 的顺序识别类型，也可以手动指定。选中的格式方案会立刻作用于结果，并可以复制。有结果时可以点「展开」，在居中的大窗口里查看和复制。原文、结果和展开窗口使用同一块编辑底。

留空时列出三种类型和全部方案。写入内容后，方案列表只保留当前类型。每种类型会记住上次使用的方案。自定义方案保存在 `localStorage`，内置方案不可修改或删除。

压缩开启时，对话框只保留压缩开关，输出收成一行。关闭后显示美化选项：三种类型都可以改缩进；JSON 还可以按键名排序；SQL 还可以改大小写。默认不压缩，缩进为 1 个制表符。JSON 默认不排序键。SQL 默认把关键字和未加引号的标识符转成小写，字符串字面量保持原样。

格式化失败时保留原文，并在结果区说明原因。不处理纯文本、YAML、CSV，也不做语法校验或服务端转换。

## 开发

需要 Node.js 24.x 和 Corepack。依赖安装、检查和构建命令：

~~~sh
corepack pnpm install
corepack pnpm run dev
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run build
~~~

独立开发服务器默认地址为 <http://localhost:5173/>。从仓库根目录启动整个站点时，此工具位于 `/tools/text-formatter/`。

## 技术栈

- React、TypeScript、Vite
- JSON 使用语言内置的解析和序列化
- XML 和 SQL 使用本目录里的轻量格式化代码
- `localStorage` 保存自定义方案和每种类型最后一次使用的方案
