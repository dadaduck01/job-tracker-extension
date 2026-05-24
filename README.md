# 求职投递追踪

一个 Chrome 插件，帮你把招聘网站上的投递信息自动写到 SeaTable 表格里。页面内容交给 AI 提取，不用手动敲。

<p align="center">
  <img src="icons/icon.png" width="128" height="128" alt="icon">
</p>

## 功能

**记录投递** — 在招聘网站的投递状态页使用，AI 自动提取公司、岗位、状态、地点，确认后直接写入 SeaTable。

**解读 JD** — 在职位描述页使用。AI 会先把真正的职位描述从杂乱的网页里拣出来，然后解释这份工作到底在做什么、适合什么人、需要哪些能力。

**个性化投递建议** — 在设置页填上你的教育背景、实习经历和技能，插件就能帮你分析某个 JD 值不值得认真投。它会判断这份工作能不能沉淀能力、有没有变成"包装过的杂活"的风险、未来好不好写进简历。

**不绑定特定网站** — 靠 LLM 理解页面内容，不对某个招聘平台做适配规则。

**重复检测** — 保存前自动检查同一个链接是不是已经记录过，发现重复会弹窗确认。

**泡池子时间自动算** — 由 SeaTable 公式列 `DATETIME_DIFF(TODAY(), {投递日期}, 'days')` 自动计算，插件不管这个。

## 安装

1. 下载仓库或 `git clone`
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 打开右上角**开发者模式**
4. 点**加载已解压的扩展程序**，选项目目录就行

## 配置

点击插件图标后右下角有设置入口，或者右键图标 → 选项：

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| DeepSeek API Key | AI 提取和分析用的 Key | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| 个人信息 | 教育经历、实习经历、技能描述 | 可选。填了之后才能用 JD 投递建议功能 |
| SeaTable 服务器 | 默认 cloud.seatable.cn | 自部署的话填自己的地址 |
| SeaTable API Token | 表格读写凭证 | 表格 → ⋮ → 高级 → API Token |
| SeaTable 表名 | 默认"投递记录" | 可以改成别的名字 |

## SeaTable 表格结构

在 SeaTable 里建一个表，列名和类型按下面来：

| 列名 | 类型 | 说明 |
|------|------|------|
| 公司 | 文本 | 企业名称 |
| 岗位 | 文本 | 职位名称 |
| 状态 | 单选 | 简历初筛 / 部门评估 / 笔试中 / 面试中 / 挂 / offer，也支持自定义输入 |
| 地点 | 文本 | 工作城市 |
| 链接 | URL | 投递页面地址 |
| 投递日期 | 日期 | YYYY-MM-DD 格式 |
| 自我介绍 | 长文本 | 初始为空，可以手动补充 |
| 更新日期 | 最后修改时间 | SeaTable 自动维护，插件不写这个列 |
| 泡池子时间 | 公式 | `DATETIME_DIFF(TODAY(), {投递日期}, 'days')` |

## 使用

点击插件图标会从侧边栏打开。首页有两个入口：

- **记录投递** — 在投递确认页面用，AI 提取信息 → 你核对修改 → 保存到 SeaTable
- **解读 JD** — 在职位描述页用，AI 拆解岗位内容，看完还能点"获取投递建议"让 AI 结合你填过的背景信息判断值不值得投

提取失败时会给你一个空表单，手动填也不耽误。LLM 提取不到的内容会留空，不会编造。

## 项目结构

```
job-tracker-extension/
├── manifest.json       # Chrome 插件配置（Manifest V3）
├── background.js       # Service worker，点击图标打开侧边栏
├── popup/
│   ├── popup.html      # 侧边栏 UI：首页、表单、JD 分析、结果展示
│   ├── popup.css
│   └── popup.js        # 核心逻辑：页面提取 → AI 调用 → 表单确认 → 保存
├── options/
│   ├── options.html    # 设置页：API Key + 个人信息
│   ├── options.css
│   └── options.js
├── lib/
│   ├── seatable.js     # SeaTable REST API 封装（api-gateway v2）
│   └── deepseek.js     # DeepSeek API 封装（deepseek-v4-flash）
├── icons/
│   └── icon.png
└── README.md
```

技术栈：Vanilla JS / Chrome Manifest V3 / DeepSeek v4 Flash / SeaTable API v5.2+

API 链路：页面文本 → DeepSeek（提取或分析）→ 表单确认 → SeaTable（写入行）

## License

MIT
