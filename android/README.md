# Android App

该目录是 `fun.zhuying.diary` 的 Trusted Web Activity（TWA）Android 工程。应用打开：

```text
https://diary.zhuying.fun/
```

网页仍由服务器提供，因此更新网页功能或样式不需要重新构建 APK。只有包名、图标、
权限或其他 Android 配置改变时才需要发布新版本。

## 前置条件

- `https://diary.zhuying.fun` 已经指向日记服务器
- 域名可正常返回 `/manifest.webmanifest`
- JDK 17
- Android SDK
- 项目根目录已经执行 `npm install`

## 工程维护

Android 工程已经生成并提交，不再依赖 Bubblewrap 或其他 Node.js Android 生成器。
`android/app/`、Gradle 文件和 `android/twa-manifest.json` 作为普通 Android 工程维护。

当前加固必须保留：

- `AndroidManifest.xml` 中 `android:allowBackup="false"`
- 仓库只使用 Google Maven 和 Maven Central
- `gradle-wrapper.properties` 中保留 Gradle 下载 SHA-256
- 包名固定为 `fun.zhuying.diary`

网页图标源修改后，可以运行 `npm run android:icons` 更新 PWA 图标。Android 启动图标需要
通过 Android Studio 的 Image Asset 工具更新，或者手动替换各密度资源。

## 创建签名密钥

只执行一次：

```bash
android/create-signing-key.sh
```

如需自定义证书主体，可在首次创建密钥时设置 `ANDROID_KEY_DNAME`。该值会公开出现在签名
证书中，不应包含不希望公开的个人信息。

签名密钥默认保存在：

```text
~/.config/my-diary/android/diary.keystore
```

它不位于源码仓库和日记数据目录中，权限为 `0600`。必须把该文件和密码分别备份到安全
位置。丢失发布密钥后，将无法使用相同签名升级已安装的 APK。

读取 SHA-256 指纹：

```bash
android/fingerprint.sh
```

自动化或本机安全构建时，可以让脚本从权限为 `0600` 的单行密码文件读取密码：

```bash
ANDROID_KEYSTORE_PASSWORD_FILE=/secure/path/password android/fingerprint.sh
ANDROID_KEYSTORE_PASSWORD_FILE=/secure/path/password npm run android:build
```

密码不会放入命令行参数或环境变量值；不设置该变量时，脚本仍会在终端中交互式询问。
如果 Gradle Wrapper 下载受限，可以通过 `GRADLE_EXECUTABLE` 指定已校验的本地 Gradle。

把输出填入服务器 `.env`：

```dotenv
ANDROID_SHA256_FINGERPRINTS=AA:BB:CC:...
```

然后重新启动网页容器：

```bash
docker compose up -d --build diary
```

服务器会在以下地址生成 Digital Asset Links：

```text
https://diary.zhuying.fun/.well-known/assetlinks.json
```

如果使用 Google Play App Signing，需要把 Play Console 提供的应用签名 SHA-256 指纹也
加入变量，多个指纹使用英文逗号分隔。

## 验证域名

```bash
npm run android:verify
```

只有该命令通过后，应用才能以无浏览器地址栏的可信模式运行。

## 构建

```bash
npm run android:build
```

Gradle 先生成未签名产物，然后使用 Android SDK 的 `zipalign`、`apksigner` 和 JDK 的
`jarsigner` 完成签名。密码通过终端提示输入，不放入命令行参数或环境变量。

输出：

```text
android/app-release-signed.apk
android/app-release-bundle.aab
```

- APK 可以直接安装到自己的安卓手机
- AAB 用于上传 Google Play

连接开启 USB 调试的手机后，可以使用：

```bash
adb install -r android/app-release-signed.apk
```

## 发布检查

每次发布前确认：

1. `android/twa-manifest.json` 中的版本号和 `versionCode` 已增加。
2. `npm test` 通过。
3. `npm run android:verify` 通过。
4. 签名密钥和密码已有独立备份。
5. APK 在真实安卓设备上完成登录、语音输入、保存和历史查看测试。
