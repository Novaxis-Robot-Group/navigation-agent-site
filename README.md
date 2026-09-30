# Navigation Agent 官网

面向外部开发者和客户的中英双语产品介绍网站。以文字介绍产品，预留视频位置，并链接到项目代码和技术文档。

- 网站源码：[navigation-agent-site](https://github.com/Novaxis-Robot-Group/navigation-agent-site)
- Agent 项目：[navigation-agent](https://github.com/Novaxis-Robot-Group/navigation-agent)

这是独立维护的静态网站，只需浏览器和 Python 3，不依赖 Node.js、Agent 服务或机器人环境。在 Mac 本仓库的 `main` 分支直接开发。

## 本地预览

在本仓库根目录运行：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

打开 <http://127.0.0.1:4173>。看到产品介绍、能切换中英文并访问链接，即预览成功。修改后刷新浏览器；按 `Ctrl+C` 停止服务。

## 修改内容

- `index.html`：中文正文、`data-en` 英文翻译、GitHub 和技术文档链接。
- `styles.css`：配色、排版与手机布局。
- `site.js`：语言偏好与视频配置。
- `favicon.svg`：浏览器标签页图标。

三个视频位置目前只显示文字介绍。准备好素材后，在 `site.js` 的 `videos` 对象中替换对应的 `null`：

```javascript
main: { src: "./media/task.mp4", poster: "./media/task.jpg" },
simulation: { src: "./media/mujoco.mp4", poster: "./media/mujoco.jpg" },
robot: { src: "./media/go2.mp4", poster: "./media/go2.jpg" },
```

有素材后再创建 `media/`，或填写 HTTPS 托管地址。播放器默认不自动播放，不提前下载视频正文；有讲解的素材应提供字幕。

## 提交和推送

直接在 `main` 修改、预览和检查后，逐项暂存本次文件，再提交并推送到 `origin/main`。网站源码只在本仓库维护，不再同步回 Agent 项目。

## 网站托管

目前 GitHub 仓库为私有，仅保存和发布网站代码，尚未上线网站。组织的 GitHub Free 套餐不支持从私有仓库发布 GitHub Pages。

将来启用静态托管时，无需构建，发布网站运行文件 `index.html`、`styles.css`、`site.js`、`favicon.svg` 及实际媒体文件即可，不发布 `.git`、本地记录或开发说明。网站支持部署到子路径。

页面中的 GitHub 与文档链接目前指向私有的 Agent 仓库，访问需要权限。上线前核对这些链接；仓库公开后更新页面中的访问提示。网站双语不代表技术文档已翻译。

## 许可证

Apache-2.0，Copyright 2026 Novaxis (智疆启元)。见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
