# Phone Radar

一个自用的本地数码资讯面板原型，适合追踪 iPhone 爆料、官方发布、主流安卓手机资讯和参数对比。

## 使用方式

双击 `open-dashboard.bat` 打开面板。它会启动本地服务，并在页面打开后自动更新一次日报。

也可以直接用浏览器打开 `index.html`。

你可以双击 `update-news.bat` 抓取资讯，也可以在右侧手动添加资讯和机型参数。你添加的内容会保存到当前浏览器的 localStorage。

## 第一版包含

- 一眼摘要：自动判断先看、扫一眼、可略过
- 资讯筛选：品牌、类型、可信度、收藏
- 资讯动作：收藏、标为已读、打开来源
- 参数库：传闻参数和官方参数并存
- 机型对比：勾选表格左侧复选框
- 来源清单：官方、爆料、市场报告、拆解评测
- 本地导出：导出你添加过的数据和阅读状态

## 自动抓取

运行：

```powershell
& "C:\Users\许\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\scripts\fetch-news.mjs
```

更简单的方式：双击 `update-news.bat`。

如果想每小时自动更新，双击 `start-hourly-update.bat`，并让窗口保持打开。

脚本会读取 `feeds.config.json`，抓取 RSS / Atom 内容，写入 `generated-news.js`。刷新 `index.html` 后即可看到自动抓取的资讯。

同时会生成 `generated-daily.js`，这是日报页优先读取的成品摘要。

这个流程默认不调用 AI，不消耗模型 token。建议先用标题、来源、可信度和关键词筛选；只有遇到值得深挖的文章时，再单独让 AI 帮你总结。

## 怎么看才不累

日常先看中文源：IT之家、爱范儿、少数派。

英文或付费源不要硬看，例如 Bloomberg、The Information。它们更适合当“信号源”：看到标题里反复出现 iPhone、Gurman、Kuo、供应链、跑分、认证，再把那条链接发给 AI 做中文解释。

每条资讯只判断三件事：

- 这是不是官方确认？
- 这是不是和你关心的机型有关？
- 这条信息会不会影响购买或等待？

## 后续可扩展

- 关键词提醒
- 自动摘要
- 参数表导入/导出
- 可信度规则自动打标签
