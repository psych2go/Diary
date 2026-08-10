# MyDiary

简体中文 | [English](README.md)

MyDiary 是一个极简、自托管的 Markdown 日记应用，主要用于在手机上快速记录日记。
它只保留一条核心流程：打开页面，通过语音输入或键盘输入正文，然后保存。

本仓库只包含应用源码，不包含日记正文、生产环境配置、密码、备份凭据或 Android
签名密钥。

## 功能

- 极简、移动端优先的记录界面
- 支持系统输入法语音转文字
- 圆形开始记录/保存按钮
- 历史日记默认只读
- 月历和连续记录统计
- 单密码登录
- 30 天安全登录会话
- 使用纯 Markdown 文件保存日记
- 支持渐进式 Web 应用（PWA）
- 可选 Android WebView/TWA 外壳
- 可选 Restic 加密 Cloudflare R2 备份

## 项目结构

| 目录或文件 | 用途 |
| --- | --- |
| `server.js` | HTTP 服务、身份验证、安全响应头和 API 路由 |
| `src/` | 密码与会话、日记存储、统计和 Android Asset Links |
| `public/` | 移动端网页、PWA 清单、图标和 Service Worker |
| `backup/` | Restic 备份、保留策略、完整性检查和恢复测试 |
| `android/` | Android 外壳、启动资源、签名工具和构建脚本 |
| `deploy/` | 通用反向代理和证书续期配置模板 |
| `test/` | 身份验证、存储、备份、Android 和服务器安全测试 |

网页应用是主要产品。大多数功能和界面更新只需要重新部署网页，通常不需要重新构建
Android APK。

## 日记格式

日记保存在源码仓库之外：

```text
{YYYY}/{YYYYMMDD}.md
```

每个文件使用以下格式：

```markdown
# YYYY-MM-DD

## HH:MM

日记原文
```

新内容以追加方式写入，不会改写原文。日期和时间默认使用 `Asia/Shanghai` 时区。

## 本地开发

环境要求：

- Node.js 22 或更高版本
- npm

安装依赖并启动开发服务器：

```bash
npm install
npm run dev
```

开发命令会在终端中隐藏输入本地密码，不会在仓库中保存默认密码。

打开：

```text
http://127.0.0.1:3000
```

不要把开发服务器直接暴露到网络。

运行测试：

```bash
npm test
npm audit --omit=dev
```

## 生产部署

### 1. 准备配置

```bash
cp .env.example .env
npm run password:hash
openssl rand -hex 32
openssl rand -base64 48
```

至少配置以下内容：

```dotenv
DIARY_PASSWORD_HASH=generated-scrypt-hash
DIARY_SESSION_SECRET=long-random-session-secret
DIARY_HOST_DATA_DIR=/srv/my-diary/data
DIARY_SECURE_COOKIE=true
DIARY_TRUST_PROXY=true
```

将 `.env` 文件权限设置为 `0600`，并且永远不要把它提交到 Git。

只有在应用位于可信本地反向代理之后，并且代理会覆盖 `X-Real-IP` 或
`X-Forwarded-For` 时，才能启用 `DIARY_TRUST_PROXY`。仓库提供的 Compose 和
OpenResty 模板满足这个条件。

### 2. 准备数据目录

```bash
sudo install -d -m 700 -o "$(id -u)" -g "$(id -g)" /srv/my-diary/data
```

可以把已有日记复制到该目录：

```bash
sudo cp -a /path/to/existing-diary-data/. /srv/my-diary/data/
```

### 3. 启动应用

```bash
docker compose up -d diary
```

容器端口默认只绑定到 `127.0.0.1`。应在它前面配置支持 TLS 的反向代理，不要把
`3000` 端口直接暴露到互联网。

通用 OpenResty 配置示例位于 `deploy/openresty/`。

## R2 加密备份

可选备份容器使用 Restic 和 R2 的 S3 兼容接口。应创建独立的私有 bucket，并在
`.env` 中配置仅对该 bucket 生效的凭据。

首次使用时初始化并验证仓库：

```bash
docker compose --profile backup run --rm diary-backup init
docker compose --profile backup run --rm diary-backup backup
docker compose --profile backup run --rm diary-backup check
docker compose --profile backup run --rm diary-backup restore-test
```

启动定时备份：

```bash
docker compose --profile backup up -d diary-backup
```

默认保留策略：

- 每日备份保留 30 天
- 每月备份保留 12 个月
- 每年备份永久保留
- 每月执行一次仓库完整性检查
- 每年 1 月和 7 月执行恢复测试

R2 中保存的是 Restic 加密对象，而不是可以直接阅读的 Markdown。恢复日记必须同时
拥有 R2 凭据和 Restic 密码。这些凭据必须保存在源码仓库之外。

## Android 应用

Android 工程是托管网页应用的轻量外壳，支持：

- 存在兼容浏览器时使用 Trusted Web Activity
- 没有兼容 TWA 浏览器时使用 WebView
- Digital Asset Links 域名验证
- 在源码仓库之外保存发布签名密钥
- 构建已签名的 APK 和 AAB

构建自己的版本之前，需要检查 `android/` 中的包名、生产域名、清单地址和签名配置。

详细说明：

```text
android/README.md
```

## 安全设计

生产环境包含以下保护：

- 使用带盐 scrypt 哈希保存登录密码
- 使用 `HttpOnly`、`Secure`、`SameSite=Strict` 会话 Cookie
- 对修改数据的请求执行来源检查
- 限制请求大小和超时时间
- 设置 CSP、HSTS、COOP、CORP 等浏览器安全响应头
- 容器使用只读文件系统并移除不需要的权限
- 日记数据保存在源码目录之外
- 上传备份前由 Restic 加密
- Android 签名密钥保存在源码仓库之外

威胁模型、残余风险和安全事件处理清单请参阅 `SECURITY.md`。

## 仓库隐私

禁止提交以下内容：

- 日记 Markdown 文件
- `.env`
- 密码、密码哈希、会话密钥或备份凭据
- Android keystore 或密码文件
- APK、AAB 或签名附属文件
- Restic 仓库或恢复出的日记数据

仓库中的忽略规则会覆盖这些路径。但如果敏感文件已经进入 Git 历史，仅添加忽略规则
并不能删除它们；公开仓库前仍需重写或替换历史。
