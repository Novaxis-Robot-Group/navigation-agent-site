# Navigation Agent 官网

面向外部开发者和客户的中英双语产品介绍网站。首页默认英文，右上角可切换中文；重新打开或刷新页面回到英文。包含产品介绍、带关键节点的 MuJoCo 双视角回放，以及项目代码和技术文档入口。

- 在线网站：[Navigation Agent](https://novaxis-robot-group.github.io/navigation-agent-site/)
- 网站源码：[navigation-agent-site](https://github.com/Novaxis-Robot-Group/navigation-agent-site)
- Agent 项目：[navigation-agent](https://github.com/Novaxis-Robot-Group/navigation-agent)

这是独立维护的静态网站，只需浏览器和 Python 3，不依赖 Node.js、Agent 服务或机器人环境。在 Mac 本仓库的 `main` 分支直接开发。

## 本地预览

在本仓库根目录运行：

```bash
python3 preview.py
```

打开 <http://127.0.0.1:4173/#videos>，在首页“视频演示”区域查看任务回放。预览服务支持视频分段读取（HTTP Range），可直接跳转到未播放的节点。普通 `python3 -m http.server` 不支持完整的录像跳转。

首页按“简短介绍 → 真实回放 → 项目原理”组织。顶部横排选择任务。桌面左侧为 VLN 占位，中间为 Agent + VLN 回放，两种方法之间用竖线分隔；右侧常驻 Agent 节点与决策。两个视频等宽、同为16:9。平板将决策放到双视频下方，手机改为上下排列。VLN 尚未录制，“同时播放”暂不可用；倍速仍可控制现有 Agent 录像。Go2 在独立区域展示。回放采用灰白底与少量低饱和灰蓝选中状态，组件统一为圆角白色卡片，标题和卡片边缘对齐，整个对比区桌面最大宽度为 1240px。“关键节点与决策”直接显示，点击节点即可跳转。

确认视频可播放、节点可跳转、切换视角后保留进度，即回放预览成功。修改后刷新浏览器；按 `Ctrl+C` 停止服务。

## 修改内容

前端风格以 [AGENTS.md 的风格基线](AGENTS.md#前端风格基线2026-10-15-用户确认) 为准：白底与低饱和灰蓝、16px 圆角卡片、细边框与轻阴影、统一对齐。后续扩展沿用这版；具体配色、尺寸、回放布局和双语规则集中维护在该约定中。

- `index.html`：英文正文、`data-en` 英文与 `data-zh` 中文文案、GitHub 和技术文档链接。
- `styles.css`：配色、排版与手机布局。
- `site.js`：全站文案切换。
- `favicon.svg`：浏览器标签页图标。
- `replay.css`、`replay.js`：首页内嵌回放的样式与交互。
- `media/replays/sessions.json`：任务目录、双语节点说明和录像时间。

## 任务回放素材

当前示例来自 2026-10-13、2026-10-14 的三段 MuJoCo 已完成任务：找到地上的篮球、走到床边、找到盆栽。完成状态来自原始任务日志，不表示独立人工评测。Go2 独立区域显示待加入状态。

每段素材放在 `media/replays/<slug>/`，包含 `first.mp4`、`third.mp4`、起始画面 `poster.jpg` 和最终观察画面 `cover.jpg`。`sessions.json` 中的 `taskId` 可追溯原始任务。只保留展示需要的节点文字和元数据，不复制原始配置、模型请求或环境信息。

节点的 `time` 使用录像秒数。它由事件时间与 `frames.jsonl` 的 `stamp_ns`、`video_s` 对齐得到；相邻采图间隔不超过 0.5 秒时线性插值，其余位置取前一个已保存帧。不能直接把任务耗时作为视频时间。中文说明取自日志，英文说明是精简翻译；节点标题为展示整理。录像保持原始内容与速度，倍速仅由播放器控制。

新增任务时，添加上述素材，并在 `sessions.json` 添加任务和按时间排序的节点。`goalEn`、`labelEn`、`reasonEn` 与中文同步填写。当前页面展示精选关键节点，不是完整日志。`wallDuration` 是任务实际耗时，页面进度显示录像时长 `duration`，两者可能不同。

前端不连接 Agent 或机器人服务。素材和页面需一起部署到支持 HTTP Range 的静态主机。正式网站通过下方 GitHub Pages 工作流发布。

播放器默认不自动播放，不提前下载视频正文。页面和回放共用右上角的语言切换，选择任务不会改变首页导航锚点。

## 提交和推送

直接在 `main` 修改、预览和检查后，逐项暂存本次文件，再提交并推送到 `origin/main`。网站源码只在本仓库维护，不再同步回 Agent 项目。

## 网站托管

本仓库公开，网站通过 GitHub Pages 托管。推送网站文件到 `main` 后，`.github/workflows/pages.yml` 自动发布；也可以在 GitHub Actions 中手动运行 `Deploy website`。

无需构建。工作流打包首页、对应 CSS/JS、`favicon.svg` 和存在的 `media/`，不将开发说明或本地预览服务作为网页发布。新增运行资源时同步更新工作流的触发路径与打包步骤。

网站仓库公开不改变 Agent 项目仓库的权限。页面中的 GitHub 与文档链接目前指向私有的 Agent 仓库，访问需要权限；Agent 仓库公开后再更新页面提示。网站双语不代表技术文档已翻译。

## 许可证

Apache-2.0，Copyright 2026 Novaxis (智疆启元)。见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
