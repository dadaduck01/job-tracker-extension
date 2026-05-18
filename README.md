# 📋 求职投递追踪

一键将招聘网站的投递信息自动记录到 SeaTable 在线表格，AI 自动提取页面内容，告别手动整理。

<p align="center">
  <img src="icons/icon.png" width="128" height="128" alt="icon">
</p>

## ✨ 功能

- **一键提取** — 在任意招聘页面点击插件图标，AI 自动识别公司、岗位、状态、地点等信息
- **弹窗确认** — 提取结果在弹窗中展示，可手动修改后再保存
- **SeaTable 同步** — 数据直接写入 SeaTable 在线表格，随时随地查看求职进度
- **通用抓取** — 不绑定特定网站，依赖 LLM 理解任意页面内容
- **状态下拉** — 预设 6 种状态（简历初筛/部门评估/笔试中/面试中/挂/offer），支持自定义
- **重复检测** — 保存前检查同一链接是否已记录，避免重复
- **自动计算** — 泡池子时间由 SeaTable 公式列自动计算，无需手动维护

## 🚀 安装

1. 下载本仓库或 `git clone`
2. 打开 Chrome → 地址栏输入 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序** → 选择项目目录
5. 安装完成

## ⚙️ 配置

右键点击插件图标 → **选项**，填写以下信息：

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| DeepSeek API Key | AI 提取用的 Key | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| SeaTable 服务器 | 默认 cloud.seatable.cn | 自部署用户填写自定义地址 |
| SeaTable API Token | 表格读写凭证 | 表格 → ⋮ → 高级 → API Token |
| SeaTable 表名 | 默认"投递记录" | 自定义表名 |

## 📊 SeaTable 表格设置

在 SeaTable 中创建表，列名和类型如下：

| 列名 | 类型 | 说明 |
|------|------|------|
| 公司 | 文本 | 企业名称 |
| 岗位 | 文本 | 职位名称 |
| 状态 | 单选 | 简历初筛 / 部门评估 / 笔试中 / 面试中 / 挂 / offer |
| 地点 | 文本 | 工作城市 |
| 链接 | URL | 投递页面链接 |
| 投递日期 | 日期 | 格式 YYYY-MM-DD |
| 自我介绍 | 长文本 | 初始为空 |
| 更新日期 | 最后修改时间 | **SeaTable 自动管理，无需插件写入** |
| 泡池子时间 | 公式 | `DATETIME_DIFF(TODAY(), {投递日期}, 'days')` |

## 🖱 使用

1. 在招聘网站完成投递后，点击浏览器工具栏的插件图标
2. 插件自动分析当前页面 → 填充表单
3. 核对/修改字段 → 点击 **保存到 SeaTable**
4. 打开 SeaTable 查看记录

### 异常处理

- **未配置** → 引导跳转设置页
- **LLM 提取失败** → 展示空表单，可手动填写
- **重复链接** → 弹窗确认是否继续保存
- **保存失败** → 显示错误详情，可重试

## 🏗 技术架构

```
Chrome Extension (Manifest V3)
├── popup/          # 弹窗 UI + 核心逻辑
│   ├── popup.html  # 5 种状态视图
│   ├── popup.css   # 样式
│   └── popup.js    # 页面提取 → LLM → 表单 → 保存
├── options/        # API Key 配置页
├── lib/
│   ├── seatable.js # SeaTable REST API 封装 (api-gateway v2)
│   └── deepseek.js # DeepSeek API 封装 (deepseek-v4-flash)
└── icons/
    └── icon.png    # 插件图标
```

**技术栈：** Vanilla JS · Chrome Manifest V3 · DeepSeek v4 Flash · SeaTable API v5.2+

**API 调用链：**
```
页面文本 → DeepSeek API (JSON提取) → 表单展示 → SeaTable API (写入行)
```

## 📁 项目结构

```
job-tracker-extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── lib/
│   ├── seatable.js
│   └── deepseek.js
├── icons/
│   └── icon.svg
└── README.md
```

## 📝 License

MIT
