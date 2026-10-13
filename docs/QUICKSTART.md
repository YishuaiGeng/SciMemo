# 开发与部署快速开始

## 1. 先启动浏览器开发版

安装 Node.js 22.12+，进入项目根目录：

```bash
npm install
npm run dev
```

默认地址 `http://localhost:1420`。首次安装会生成 package-lock.json；提交它，后续使用 npm ci。

浏览器仅用于开发、预览或自行部署的 Web 使用。IndexedDB 受站点来源隔离，不是一个能直接在文件夹中看到的 SQLite 文件。更换域名、协议、端口或清理站点数据可能切换／清除工作区。代码没有用 localStorage 存科研记录。

当前不是完整 PWA：没有 service worker 或首次加载后的离线页面缓存承诺。页面已经打开时可离线记录；不能据此保证关闭浏览器后断网重新打开 Web 页面。

## 2. 开发检查

```bash
npm run check
npm test
npm run build
```

只想检查无 React 依赖的核心时，npm test 会编译 core 并执行 Node 内置测试。仓库附带的是源码，不是预先打好的 node_modules。

## 3. Windows / macOS 原生壳

按 Tauri 官方前置环境文档安装 Rust 与系统构建工具。Windows 需相应 C++ 构建环境与 WebView2；macOS 需 Xcode 工具。原生构建不是在一个操作系统上自动得到所有平台的完整发行包。

```bash
npm run desktop:dev
npm run desktop:build
```

Windows/macOS 的用户应用数据目录由 Tauri app_data_dir 解析。目录内包含 scimemo.sqlite3、SQLite WAL 等运行文件和 exports/。

开发版导出功能将文件写入该应用数据目录的 exports/，界面返回实际路径；暂未实现原生“另存为”对话框。不要依赖手工复制正在写入的 SQLite 主文件进行备份。

当前 bundle identifier 为 `app.scimemo.desktop`，只是开发默认值，不表示已取得域名或应用商店名称。首次对外发行前选定自己的稳定标识；发布后随意改名可能改变存储路径。

`src-tauri/icons` 是仅供构建的临时占位图标，不代表最终品牌设计。

## 4. Android / iOS 初始化

同一套前端和 Rust library 具有移动入口；生成的原生工程不随包提供，因为应由目标平台工具链初始化。

```bash
npm run tauri -- android init
npm run android:dev
```

iOS 在具备相应 Apple 工具链的 macOS 环境：

```bash
npm run tauri -- ios init
npm run ios:dev
```

先按官方文档配置 Android SDK/NDK 或 Xcode、签名与真机。必须实测键盘遮挡、文件选择、系统返回行为、安全区、HTTPS 证书和后台恢复。首次不应把“能启动模拟器”视为移动版全部完成。

## 5. 本机同步服务

需要 Python 3.11+；本包实际后端测试使用 Python 3.13。

```bash
python -m venv .venv
```

macOS / Linux：

```bash
source .venv/bin/activate
python -m pip install -r server/requirements-dev.txt
export SCIMEMO_SYNC_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export SCIMEMO_DB_PATH="server/data/sync.sqlite3"
python -m uvicorn server.app.main:create_app --factory --host 127.0.0.1 --port 8787
```

Windows PowerShell：

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -r server/requirements-dev.txt
$env:SCIMEMO_SYNC_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:SCIMEMO_DB_PATH = "server/data/sync.sqlite3"
python -m uvicorn server.app.main:create_app --factory --host 127.0.0.1 --port 8787
```

启动前在同一终端安全保存生成的令牌，客户端设置页需要它。不要把令牌粘到 Issue、截图或 GitHub。

运行 uvicorn 不会自动加载 server/.env；以上命令使用真实环境变量。只有下方 Docker Compose 使用 env_file。

客户端进入“设置与数据”，地址填 `http://127.0.0.1:8787`，填写同一个令牌后手动同步。

在另一台设备上，127.0.0.1 指向那台设备自己，不是你的电脑。跨设备应使用可访问的 HTTPS 服务地址；不要关闭传输保护来省略配置。

## 6. Docker 自托管

将 server/.env.example 复制为 server/.env，填写至少 32 字符随机令牌。默认数据库路径 `/data/sync.sqlite3`，根据使用的 Web 来源修改 SCIMEMO_ALLOWED_ORIGINS。

```bash
# macOS / Linux
cp server/.env.example server/.env
# Windows PowerShell 可用 Copy-Item server/.env.example server/.env
# 编辑 server/.env 后：
docker compose up --build -d
```

默认只绑定宿主机 127.0.0.1:8787。把现有 HTTPS 反向代理指向它，并配置访问控制和速率限制。不要直接改成面向公网的明文 HTTP。

Docker 配置随源码提供，但交付环境未实际构建容器。首次部署应检查镜像、目录权限、健康检查、外部 HTTPS、CORS 和备份。

**自托管同步服务不等于已托管 Web UI。** UI 静态部署需先 npm run build，再由自己的静态服务器提供 dist/；客户端仍先写本地 IndexedDB，再主动同步。

## 7. JSON 备份

设置页导出完整 JSON。随笔单独导出 Markdown，稿件列表可导出 CSV，日程导出 ICS。CSV 是概览，不是完整恢复格式。

恢复只允许空的未绑定工作区，避免意外覆盖。浏览器可用全新测试配置文件创建隔离工作区；桌面恢复到新设备／空应用目录前应先保留旧目录副本。

服务端物理备份：

```bash
python server/backup.py server/data/sync.sqlite3 backups/sync-backup.sqlite3
```

源文件必须存在，目标文件必须不存在。脚本使用 SQLite backup API 并校验完整性。它不能被替换成对运行中数据库的普通文件复制。

## 8. 真正的 HTTP 集成测试

仅连接临时测试数据库，不要对真实资料运行此脚本。

启动一个独立测试同步端后，设置：

```bash
export SCIMEMO_TEST_URL="http://127.0.0.1:8787"
export SCIMEMO_TEST_TOKEN="与你的临时测试服务一致的随机令牌"
npm run test:integration
```

脚本会创建虚构笔记，模拟两个设备的并发冲突、解决和删除。Windows 使用 `$env:变量名 = "值"` 的环境变量语法。

## 9. 建立 GitHub 仓库

在本地确认没有数据库、令牌、真实稿件后初始化 Git：

```bash
git init
git add .
git commit -m "chore: bootstrap SciMemo local-first starter"
```

然后在你自己的 GitHub 账号创建空仓库并添加真实 remote。此交付没有替你创建仓库、上传代码或发布 release。

当前 npm 依赖没有生成锁文件；第一次通过完整安装、测试和构建后，应提交 package-lock.json 和原生应用 Cargo.lock，再收紧 CI 为只允许锁文件安装。

## 10. 服务端旧备份恢复到新文件

先停止同步服务；不要覆写活跃数据库。以下操作会创建新数据库并轮换工作区标识，旧客户端会明确停止同步。

```bash
python server/restore.py backups/sync-backup.sqlite3 server/data/restored.sqlite3 --service-stopped
```

然后把服务端 SCIMEMO_DB_PATH 指向新文件再启动，保留原文件作为回退副本。客户端应先导出自己现有数据，再进行显式对账／建立空工作区。当前没有自动合并任意旧备份与新数据的向导。
