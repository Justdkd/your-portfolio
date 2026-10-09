# 内容编辑指南

选中自己的 `public/traveler/content.yaml` 或 `public/creator/content.yaml`。YAML 用空格缩进，不用 Tab；年月、链接和容易误判为数字的值放在引号内。中文和英文支持写成 `{ zh: "文字", en: "Text" }`。

## 关闭和排序

```yaml
sections:
  - { id: projects, title: { zh: "作品", en: "Work" } }
  - { id: about, title: { zh: "关于我", en: "About" } }
  - { id: trips, enabled: false, title: { zh: "旅行", en: "Travel" } }
  - { id: contact, title: { zh: "联系", en: "Contact" } }
```

列表顺序就是页面顺序。可用 id：`about`、`trips`、`projects`、`experience`、`interests`、`now`、`contact`。同一 id 只出现一次。除了首屏，没有内容的模块自动隐藏。

## 新增一次旅行

先在 `trips.places` 添加新城市；已经有的城市复用 id。

```yaml
places:
  porto:
    name: { zh: "波尔图", en: "Porto" }
    country: { zh: "葡萄牙", en: "Portugal" }
    lat: 41.16
    lon: -8.63
```

再在 `trips.episodes` 添加一项：

```yaml
- id: porto-2027
  date: "2027-04"
  stops: [porto]
  title: { zh: "在河边走走", en: "A walk by the river" }
  text: { zh: "替换成你的真实记录。", en: "Replace with your own memory." }
  photos:
    - src: "../assets/media/porto.webp"
      alt: { zh: "我的波尔图旅行照片", en: "My photograph from Porto" }
      caption: { zh: "可选说明", en: "Optional caption" }
```

id 用小写字母、数字和短横线，必须唯一。`date` 必须是 `YYYY-MM`；晚于当前月份就是计划中，未计入已完成统计。同一地点可以有多次旅行，多站行程的 stops 按先后排序。详情地址为 `#trips/porto/porto-2027`。

## 新增一个作品

在 `projects.items` 添加：

```yaml
- id: my-project
  date: "2026"
  title: { zh: "我的项目", en: "My project" }
  summary: { zh: "一句话概括。", en: "A one-line summary." }
  text: { zh: "项目背景、你的贡献、结果。", en: "Context, your contribution and the outcome." }
  tags: [{ zh: "设计", en: "Design" }]
  cover: "../assets/media/my-project.webp"
  photos:
    - { src: "../assets/media/my-project.webp", alt: { zh: "作品展示", en: "Project image" } }
  link: "https://example.com/my-project"
```

封面、更多图片、标签和外部链接均可省略。作品支持文字、图片和可选视频；添加 `video` 与可选 `hls`，写法见媒体指南。视频系列也可以使用外部项目链接。

`interests.items` 使用 id/title/text；`experience.items` 使用 date/title/text；`now.items` 使用 date/text。换一张介绍照片，在 `person.photo` 填路径，在 `person.photoAlt` 写双语说明。不填生日。

## 改完检查

```bash
node tools/check-content.mjs
node tools/sync-meta.mjs
```

校验会指出具体字段与缺失文件。页面出错时会显示原因；通过 HTTP 预览，检查中文、英文和手机宽度。不要把 HTML 标签写进内容；它们会按文字显示。
