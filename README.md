# MyDiary

一个只用来记日记的自托管网页。手机打开后，可以直接在正文框里使用豆包、微信输入法
等系统输入法的语音转文字。

核心行为：

- 日记继续保存为 `{年份}/{YYYYMMDD}.md`
- 保存时间由服务端按 `Asia/Shanghai` 生成
- 每次保存按 `## HH:MM` 追加原文
- 第一次点击底部圆圈开始记录，第二次点击保存
- 保存成功后清空输入框并收起键盘，失败时保留本地草稿
- 历史记录只读
- 统计记录天数、当前连续天数、最长连续天数和月历
- 单密码登录，登录状态保持 30 天
- 不执行 Git commit 或 push

## Android App

仓库包含包名为 `fun.zhuying.diary` 的 Android TWA 工程，正式地址固定为：

```text
https://diary.zhuying.fun/
```

Android 应用是网页的轻量外壳，网页更新后不需要重新发布 APK。签名、Digital Asset
Links、APK/AAB 构建和安装步骤见 [android/README.md](android/README.md)。

## 本地运行

需要 Node.js 22 或更高版本。

```bash
DIARY_PASSWORD='你的密码' npm start
```

打开 `http://localhost:3000`。开发环境可以使用：

```bash
npm run dev
```

## 正式部署

### 1. 准备配置

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -base64 48
```

将第一个随机值填入 `DIARY_SESSION_SECRET`，第二个随机值填入
`RESTIC_PASSWORD`。同时：

- 运行 `npm run password:hash`，把输出填入 `DIARY_PASSWORD_HASH`
- 将 `RESTIC_PASSWORD` 保存到 Bitwarden 和离线位置
- 通过 `id -u`、`id -g` 设置 `DIARY_UID`、`DIARY_GID`
- 将 `.env` 权限设为 `0600`，不要提交到 Git

生产环境只保存密码的 scrypt 哈希，不保存登录密码明文。

### 2. 准备独立数据目录

生产容器不能挂载源码仓库。创建一个只存日记的目录：

```bash
sudo install -d -m 700 -o "$(id -u)" -g "$(id -g)" /srv/my-diary/data
sudo cp -a 2026 /srv/my-diary/data/
```

在 `.env` 中设置：

```dotenv
DIARY_HOST_DATA_DIR=/srv/my-diary/data
```

以后新增的年份目录都会写入该位置。源码、`.env`、Git 元数据和 Android 签名密钥不会
出现在应用或备份容器中。

### 3. 准备 Cloudflare R2

在 Cloudflare 中：

1. 创建一个专用于日记备份的 R2 bucket。
2. 创建只对该 bucket 生效的对象读写 R2 API token。
3. 将 Account ID、Access Key ID、Secret Access Key 和 bucket 名填入 `.env`。

应用使用 R2 的 S3 兼容接口。按已确认的风险边界，不启用 Bucket Lock。

### 4. 配置失败邮件

备份容器通过 SMTP 发送失败通知。在 `.env` 中填写：

```dotenv
SMTP_URL=smtps://smtp.example.com:465
SMTP_USERNAME=your-account
SMTP_PASSWORD=your-app-password
SMTP_FROM=diary@example.com
SMTP_TO=you@example.com
```

建议使用邮箱提供商生成的应用专用密码，不要填写邮箱网页登录密码。

### 5. 初始化加密仓库

只在第一次部署时执行：

```bash
docker compose build
docker compose run --rm diary-backup init
docker compose run --rm diary-backup backup
docker compose run --rm diary-backup check
docker compose run --rm diary-backup restore-test
```

`init` 创建 Restic 加密仓库。重复执行 `init` 会失败，不要把它放进自动部署脚本。

### 6. 启动

```bash
docker compose up -d
```

该命令只启动网页。R2 和 SMTP 配置完成后再启动备份 profile：

```bash
docker compose --profile backup up -d diary-backup
```

网页只监听服务器本机的 `127.0.0.1:3000`。请使用 `diary` 独立子域名，并在前面配置
Caddy、Nginx 或现有反向代理。

Caddy 示例：

```caddyfile
diary.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

公网部署必须保留：

```dotenv
DIARY_SECURE_COOKIE=true
```

容器默认使用只读根文件系统、删除 Linux capabilities、禁止提权，并且网页端口只绑定
到服务器本机。不要把 `3000` 端口直接暴露到公网。

如果手机丢失或怀疑登录 Cookie 泄露，立即更换 `DIARY_SESSION_SECRET` 并重启网页容器，
所有现有 30 天登录状态都会失效。修改 `DIARY_PASSWORD_HASH` 也会使旧会话失效。

## 自动备份

`diary-backup` 容器执行以下计划：

- 每天 `03:17`：加密备份全部年份目录并清理过期快照
- 每月 1 日 `04:43`：读取全部仓库数据做完整性检查
- 每年 1 月 1 日和 7 月 1 日 `05:23`：恢复最新快照到临时目录并检查文件

保留策略：

- 每日快照保留 30 天
- 每月快照保留 12 个月
- 每年快照永久保留

每个快照在逻辑上包含当时存在的全部日记，不是只包含最近一年。备份仅包含年份目录和
恢复说明，不包含 `.env`、登录密码、R2 凭据或 Restic 密码。

任务成功时只写一行状态日志。任务失败时写一行失败日志并发送邮件，不记录或发送日记
正文。反向代理访问日志建议最多保留 7 天。

手动运行：

```bash
docker compose run --rm diary-backup backup
docker compose run --rm diary-backup check
docker compose run --rm diary-backup restore-test
```

完整恢复步骤见 [backup/RESTORE.md](backup/RESTORE.md)。

## 手机使用

用 Safari 或 Chrome 打开 HTTPS 地址并登录，再通过浏览器菜单选择“添加到主屏幕”。
输入框会自动保存未提交草稿；离线时不会自动提交，恢复网络后需要再次点击“记下”。
草稿以未加密形式保存在当前设备浏览器的本地存储中，保存成功或退出登录后会删除。

## GitHub 旧仓库

现有 GitHub 私有仓库可以暂时作为只读旧档案保留，但应用不会继续推送明文。完成首次
R2 恢复测试后，再决定是否删除旧仓库。
