# 发布自己的主页

## 选择发布范围

推荐只发布选中的模板：

```bash
node tools/export.mjs traveler
# 创作者用 creator
python3 -m http.server 8090 --bind 127.0.0.1 --directory dist/traveler
```

输出目录 `dist/traveler` 或 `dist/creator` 是站点根目录。Node 22+ 是导出工具要求，不是线上运行依赖。导出目录已存在时会拒绝覆盖；使用新的输出目录保存新版本。

也可把完整 `public/` 当作发布目录；首页是模板选择页，两个内容文件都会公开。选择哪种范围，取决于你想公开自己的主页，还是演示两套模板。

## 托管

模板是普通静态文件，可交给支持静态目录的托管服务。本项目不自动连接你的账号、不购买域名，也不替你启用部署。

以 Cloudflare Workers 静态资源为例，官方支持一个 assets directory。你可以让 AI 依据 [Cloudflare 官方文档](https://developers.cloudflare.com/workers/static-assets/) 为选中的导出目录配置当前版本的部署命令，或在服务的网页界面完成上传。仓库没有保留任何作者的部署账号或项目绑定。

GitHub Pages 的官方入口是 [Getting started with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages)。若采用它，需要按当前指南选择分支/目录或配置发布工作流。`dist/` 被忽略，导出并不会自动上传它。

不要把“公开代码仓库”当作“网站已上线”。发布地址实际可以打开，才算完成。自定义域名、费用和网络可达性按你选的平台核实；模板本身不保证某个地区的网络可达性。

## 地址与分享

发布地址确定后，填写 `site.url`，末尾带 `/`，例如 `https://example.com/`。如果是子路径，填写完整地址，例如 `https://example.com/me/`。准备 PNG/JPG 分享图并填写 `site.shareImage`。

重新运行导出，分享标题、简介、canonical URL 和图片地址会写入静态 HTML。不用导出工具时，运行 `node tools/sync-meta.mjs` 同步源码中的 HTML。

## 上线后的检查

打开主页、切换语言、点开旅行和作品、复制详情地址、刷新、用浏览器返回。检查自己的照片、项目链接和邮箱；有视频就用真实手机播放一次。

源码预览和部署后的行为可能有差异，特别是视频 Range 请求、HLS MIME 类型和缓存。视频兼容性见媒体指南，不能用本地能打开代替线上验证。

## 放到手机桌面

这是网站快捷入口，不要求做成原生 App。用手机浏览器打开已发布地址，按浏览器菜单里的“添加到主屏幕”或相应操作保存。不同浏览器/系统入口可能不同。模板没有 service worker，不保证离线加载。

## 日后更新

修改选中模板的 YAML 或公开媒体，运行校验和导出，再按自己的托管流程重新发布。不要上传项目文档、资料清单、原始素材或输入目录。
