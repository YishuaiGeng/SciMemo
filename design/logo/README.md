# SciMemo Logo 设计文件

集中保存 SciMemo 的 Logo 源文件、导出成品、历史版本与参考素材。当前使用 v04：品牌名称仅为英文 **SciMemo**，不含「研笺」和分隔线；视觉规范的说明文字保留中文。

## 目录

```text
design/logo/
├── source/       # 可编辑源文件与不同版本的设计草稿
├── exports/      # 导出的 SVG、透明 PNG、预览图等
├── references/   # 参考图片、设计说明和灵感素材
└── README.md
```

本目录不会自动替换应用内图标。本次仅交付设计资料，未修改应用代码或 `src-tauri/icons/`。完整图标、插画、纹样、亮暗色 tokens 和 8 页规范见 [视觉系统目录](../visual-system/README.md)。

## 当前版本 v04（丝带拐弯连续修复）

- `source/scimemo-logo-master-v04.svg`：当前可编辑矢量母版，修复丝带拐弯与回卷接缝，保留纯英文字标。
- `source/scimemo-logo-master-v04.ai`：原生母版交付路径；本轮需在本机 Adobe Illustrator 另存并核验。英文字标转为轮廓，编辑不依赖字体。
- `exports/scimemo-logo-preview-v04.png`：白底完整预览。
- `exports/scimemo-logo-stacked-v04.*`、`scimemo-logo-horizontal-v04.*`、`scimemo-wordmark-v04.*`：纯英文组合标与字标，提供透明底 SVG／PNG。
- `exports/scimemo-logo-horizontal-v04-dark.svg`：深色背景用的横版组合标。仅把「Sci」字标的 `wordNavy` 渐变由深海军蓝改为近白色（`#F4F8FD`→`#D3E2F4`），图标、「Memo」与金色 i 点不变；README 在深色主题下使用它。
- 应用图标 `src-tauri/icons/` 由 `exports/scimemo-icon-1024-v04.png` 通过 `npx tauri icon` 生成。
- `exports/scimemo-icon-v04.svg` 与 `scimemo-icon-{1024,2048}-v04.png`：独立图标；圆角之外透明。

v04 将左上弯折处的分段边缘描边改为连续、渐细的填充高光，重接右下回卷轮廓与正面丝带的转折点，修整左下卷角高光，并删除上折面独立描边的端头，避免接头出现断层或突出的圆头。修复保留可编辑矢量路径和渐变。

重新生成 v04：运行 `python3 design/logo/source/build_smooth_logo.py`。该脚本以 v03 SVG 为输入，输出 v04 SVG 和抗锯齿 PNG，使用本机 Codex 捆绑的 sharp，不改写历史版本或原生 AI。更新 SVG 后，应在 Illustrator 重新打开并另存 AI。

## 历史版本 v03（纯英文字标）

v03 从 v02 中移除中文与分隔线，保留当时的图标、渐变及英文字标路径；其 SVG、PNG 和已保存的 `source/scimemo-logo-master-v03.ai` 原件保留。重新生成历史 v03 使用 `python3 design/logo/source/build_english_logo.py`，仅生成 SVG 时加 `--svg-only`。v03 不是本轮丝带接缝修复后的当前版本。

## 历史版本 v02（平滑优化）

以 `references/SciMemo Mascot Logo Presentation.png` 为主要依据，重建图标与 “SciMemo / 研笺” 字标。其余三张图用于核对配色与组合形式，没有复刻其中的设备模型、宣传文案或场景。

- `source/scimemo-logo-master-v02.ai`：在本机 Adobe Illustrator 2026 中保存的原生文件，含独立命名的对象分组、可编辑路径与渐变；中英文字标均已转轮廓，不依赖字体。保留 PDF 兼容数据。
- `source/scimemo-logo-master-v02.svg`：同版矢量母版。
- `exports/scimemo-logo-preview-v02.png`：完整组合预览，白底。
- `exports/scimemo-icon-v02.svg` 与 `scimemo-icon-{256,512,1024,2048}-v02.png`：独立图标，方形画布，圆角之外透明。
- `exports/scimemo-logo-stacked-v02.*`、`scimemo-logo-horizontal-v02.*`、`scimemo-wordmark-v02.*`：透明底组合标与字标，提供 SVG / PNG。

v02 平滑了字标轮廓，曲线段从 574 减少至 233，保留全部 21 个轮廓及镂空，并约束长直线笔画；同时修整丝带高光接头和底部卷角接缝。PNG 使用放大渲染后缩小的抗锯齿导出。v01 文件保留用于对照。

源图是位图，复现稿中的柔光、阴影和细微纹理由矢量渐变近似，视觉细节并非逐像素相同。图标及字标没有嵌入参考位图。

仅重新生成历史 v02：先执行 `python3 design/logo/source/trace_wordmark.py`，再执行 `python3 design/logo/source/rebuild_logo.py` 和 `node design/logo/source/render_logo.cjs`。轮廓脚本依赖 Pillow、NumPy、SciPy、OpenCV，导出脚本使用本机 Codex 捆绑的 sharp。v01／v02 保留用于溯源与对照，不代表当前品牌字标。

v02／v03 的原生保存与预览核验属于历史版本记录；本轮 v04 的原生保存、矢量结构和导出检查分别确认，不沿用旧版检查数字。旧版原件未修改。

上轮已执行的网页端 `npm run check`、`npm test`（78 项）、`npm run build` 均通过。服务端 pytest 未能完成：`python` 命令缺失，系统 `python3` 缺 FastAPI，项目 `.venv` 缺 pytest；没有安装依赖。本轮仅更新设计资产，未重新运行应用代码测试。未做原生应用运行测试或设备测试。
