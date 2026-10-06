# 隐私替代资料生成器

按中国大陆、美国、英国、日本或韩国的地区表达生成一份合成资料。每份资料包含姓名、出生日期、地址、邮政编码、邮箱和手机号；中文、日本和韩国资料的可转换字段同时提供英语形式，并可分别复制。

中国大陆地址池覆盖 31 个省级地区，地址与邮编成组选择，手机号从 32 个前缀中随机生成。核验来源和生成边界见[中国大陆数据说明](docs/research/mainland-profile-data.md)。

生成值不代表经过核验的身份，不保证唯一、可投递或会被第三方接受。中国大陆、日本和韩国生成的手机号可能属于真实用户，不要用于联系或短信、语音验证。邮箱固定使用 `.invalid` 保留域名。

资料生成和历史记录都在当前浏览器中处理。应用不上传资料、不连接生成服务，也不采集用户输入。历史记录可能受浏览器容量或清理影响；在共用设备上使用后可清除全部记录。

## 开发

需要 Node.js 24.x 和 Corepack。依赖安装、检查和构建命令：

~~~sh
corepack pnpm install
corepack pnpm run dev
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run build
~~~

独立开发服务器默认地址为 <http://localhost:5173/>。从仓库根目录启动整个站点时，此工具位于 `/tools/privacy-profile-generator/`。

## 技术栈

- React、TypeScript、Vite
- Faker 地区数据、`pinyin-pro`、WanaKana 与韩文罗马化规则
- `libphonenumber-js` 仅用于本地号码格式化
- IndexedDB 保存历史；Clipboard API 按用户点击逐值复制

生成和转换不调用在线服务，也不读取或适配目标表单的校验方式。
