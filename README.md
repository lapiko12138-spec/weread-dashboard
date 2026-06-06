# 阅读驾驶舱

本地微信读书复盘网站：静态前端 + Node 后端，通过本机 `weread` CLI 同步微信读书数据，并可按需调用 DeepSeek 生成月度复盘。

## 运行

```bash
cd /Users/zhangjiahui/Documents/weread-dashboard
npm start
```

打开：

```text
http://localhost:8788
```

## GitHub Pages

GitHub Pages 只能展示静态前端。真实微信读书数据依赖本机 Node 后端、`weread` CLI 和本地凭据，因此公网 Pages 链接不会暴露个人阅读缓存，也不会直接显示真实数据。

## 环境变量

```bash
DEEPSEEK_API_KEY=sk-... npm start
```

可选：

```bash
WEREAD_DASHBOARD_PORT=8788
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## 本地配置

复制示例文件后编辑：

```bash
cp config/featured-books.example.json config/featured-books.json
```

`config/featured-books.json` 用来维护重点书本和导读链接：

```json
[
  {
    "bookId": "22651317",
    "title": "深度学习",
    "guideUrl": "https://github.com/your/repo",
    "priority": 100
  }
]
```
