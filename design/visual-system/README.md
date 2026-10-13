# SciMemo 视觉系统 v01

围绕 SciMemo 的手稿、独立想法／笔记、期刊／会议、日期四个模块建立视觉规范。当前 v01 规范采用修复丝带拐弯与回卷接缝后的 v04 Logo；品牌名称统一为英文 **SciMemo**，Logo 不含「研笺」与分隔线，规范说明保留中文。

## 交付文件

| 位置 | 内容与用途 |
| --- | --- |
| `source/scimemo-visual-system-master-v01.svg` | 可编辑矢量总图，单画板包含 8 个命名分组区域，说明文字已转轮廓 |
| `source/scimemo-visual-system-master-v01.ai` | 原生总图交付路径；本轮替换为 v04 Logo 后需在 Illustrator 重新保存与核验 |
| `exports/scimemo-visual-system-guide-v01.pdf` | 已生成的 8 页审阅规范；使用每页 2400×1500 的高清页面，便于跨软件查看 |
| `exports/boards/` | 8 页独立 SVG 规范；页序与文件名见 `manifest.json` |
| `exports/previews/` | 各页高清 PNG 和缩略图 |
| `exports/scimemo-visual-system-overview-v01.png` | 全部规范区域的总览 |
| `exports/icons/` | 24 个基础图标与 4 个双色模块图标，含清单和几何定义 |
| `exports/feedback/scimemo-warning.svg` | 独立 warning 三角反馈符号，用于过期等提示；不计入上述 24＋4 个图标 |
| `exports/illustrations/` | 4 个模块空状态插画，320×220 透明底 SVG |
| `exports/patterns/` | 纸页、丝带、灵感光线 3 组辅助纹样，SVG／PNG |
| `exports/tokens/` | 亮／暗色 JSON、CSS tokens 和配色对比度核验说明 |

PDF 用于审阅高清页面；SVG 和 AI 用于编辑矢量路径。转轮廓后的文字可编辑形状，不再是可直接键入的文本。需要改字时，修改 `source/build_system.py` 中的文案并重新生成；`source/board-copy.json` 是脚本导出的文案核对清单，不作为生成输入。

8 个区域依次为：总览、标志与色彩、字体与几何、图标家族、状态语义、插画与纹样、应用概念、暗色与交付。总图采用单画板中的 8 个分组区域，并非 8 个独立 Illustrator 画板；PDF 则拆为 8 页。

## 使用约定

基础图标采用统一圆端点与圆连接；空状态插画使用 2.5 单位描边。插画中的光线沿用 Logo 的两根胶囊形光线，不使用四角星。导出的图形不依赖字体或嵌入参考位图。

品牌蓝、天蓝与金色用于标志和装饰。界面文字与按钮采用 tokens 中的语义角色色，详细适用背景和对比度见 `exports/tokens/CONTRAST.md`；该计算不代表完成了全部无障碍测试。稿件工作阶段与投稿状态分别映射，不把「完成」等同于「录用」，日期图标也不暗示记录含有时间。

应用页面是视觉概念稿。本次没有改动应用代码、替换运行中的图标或接入主题 tokens，也没有新增产品功能。

## 重新生成

先运行 `python3 design/visual-system/source/build_symbols.py` 和 `python3 design/visual-system/source/build_illustrations.py`，再运行 `python3 design/visual-system/source/build_system.py`、`node design/visual-system/source/render_system.cjs`、`python3 design/visual-system/source/build_guide.py`。脚本使用 fontTools、本机 Avenir Next／Hiragino Sans GB 字体、Codex 捆绑的 sharp，以及 Pillow／ReportLab；不会联网下载依赖。

更新 SVG 后，需要在本机 Illustrator 中重新打开并保存原生 AI；生成脚本不会自动更新 AI。Logo 源文件与历史版本单独保存在 `../logo/`。

交付压缩包命名为 `exports/scimemo-visual-system-v01.zip`，打包范围为当前 v04 Logo、视觉系统源文件／导出与说明文档。上一轮含 v03 Logo 的完整交付包保存在 `archive/scimemo-visual-system-v01-logo-v03.zip`；历史 Logo 原件继续留在工作目录，不纳入当前交付包。

## 已执行检查

本轮仅将 `source/build_system.py` 的 Logo 输入替换为 v04，重新生成规范 SVG、PNG 与 PDF，其余页面内容不变。9 个重新生成的 SVG（8 页与总图）通过 XML、重复 ID、内部引用检查，均无位图或文本节点。8 张高清页面均为 2400×1500，已检查全部页面预览；PDF 实际核对为 8 页，每页 960×600 pt。原生 AI 需单独重新保存和核验，不沿用上轮 v03 的母版检查数字。

上轮已执行的 `npm run check`、`npm test`（78 项）和 `npm run build` 均通过。服务端 pytest 未能完成：`python` 命令不存在，系统 `python3` 缺 FastAPI，项目 `.venv` 缺 pytest；没有安装依赖。本轮仅更新设计资产，未重新运行应用代码测试；原生应用运行测试与设备测试均未执行。设计文件的矢量结构及预览核验不替代产品运行测试。
