# MyDiary 恢复说明

R2 中的备份由 Restic 加密。恢复需要以下信息：

- R2 Account ID
- R2 bucket 名称
- R2 Access Key ID 和 Secret Access Key
- Restic 仓库密码

密钥不存放在备份中，应从可信密码管理器或离线恢复副本取得。

在项目目录配置好 `.env` 后，先检查仓库：

```bash
docker compose run --rm diary-backup check
```

查看快照：

```bash
docker compose run --rm diary-backup snapshots
```

恢复最新快照到临时 `restore/` 目录：

```bash
mkdir -p restore
docker compose run --rm \
  -v ./restore:/restore \
  diary-backup restore
```

恢复出的日记位于 `restore/data/{年份}/`。确认内容后，再复制到
`DIARY_HOST_DATA_DIR` 指向的正式数据目录。
