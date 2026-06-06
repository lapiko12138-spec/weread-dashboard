const app = document.querySelector("#app");
const notice = document.querySelector("#notice");
const statusDot = document.querySelector("#statusDot");
const monthLabel = document.querySelector("#monthLabel");
const tabs = [...document.querySelectorAll(".tab")];

const LOCAL_API_ORIGIN = "http://localhost:8788";
const STATIC_HOSTS = ["github.io"];
const STATIC_PREVIEW_MESSAGE = "当前是 GitHub Pages 静态预览。若要查看真实个人数据，请在本机运行 npm start 后刷新页面。";

const state = {
  view: "dashboard",
  month: currentMonthKey(),
  status: null,
  dashboard: null,
  valuableNotes: null,
  report: null,
  isLoading: true,
  isSyncing: false,
  isNotesLoading: false,
  isReportLoading: false,
  isPrebuildLoading: false,
  error: null,
  isDemoMode: false
};

function currentMonthKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shouldUseLocalApi() {
  return location.protocol === "file:"
    || location.pathname.includes("/weread-dashboard/")
    || STATIC_HOSTS.some((host) => location.hostname.endsWith(host));
}

function apiEndpoint(path) {
  return shouldUseLocalApi() ? `${LOCAL_API_ORIGIN}${path}` : path;
}

function shiftMonth(monthKey, offset) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function formatDateTime(value) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clipText(value = "", maxLength = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function secondsToText(seconds = 0) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours && minutes) return `${hours} 小时 ${minutes} 分钟`;
  if (hours) return `${hours} 小时`;
  return `${minutes} 分钟`;
}

function demoTrend(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const values = [18, 34, 22, 48, 36, 56, 28, 72, 44, 66, 52, 84, 38, 61, 46];
  return values.map((minutes, index) => {
    const date = new Date(year, month - 1, index + 1);
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      seconds: minutes * 60,
      minutes
    };
  });
}

function createDemoDashboard(monthKey = state.month) {
  const categories = [
    ["认知科学", 7.6, 5],
    ["商业与组织", 5.2, 4],
    ["技术与 AI", 4.4, 3],
    ["文学随笔", 3.1, 2],
    ["历史社会", 2.3, 2]
  ].map(([title, hours, readingCount]) => ({
    title,
    readingTime: Math.round(hours * 3600),
    readingTimeText: secondsToText(hours * 3600),
    readingCount
  }));

  const featuredBooks = [
    {
      bookId: "demo-1",
      title: "深度学习",
      author: "Ian Goodfellow 等",
      category: "技术与 AI",
      source: "静态样例",
      reason: "适合拆成概念卡片和公式索引",
      guideUrl: "",
      coverTone: "cover-blue"
    },
    {
      bookId: "demo-2",
      title: "置身事内",
      author: "兰小欢",
      category: "经济与社会",
      source: "静态样例",
      reason: "适合做政策、城市与产业链复盘",
      guideUrl: "",
      coverTone: "cover-amber"
    },
    {
      bookId: "demo-3",
      title: "穷查理宝典",
      author: "彼得·考夫曼",
      category: "商业与组织",
      source: "静态样例",
      reason: "可沉淀多元思维模型清单",
      guideUrl: "",
      coverTone: "cover-green"
    },
    {
      bookId: "demo-4",
      title: "纳瓦尔宝典",
      author: "埃里克·乔根森",
      category: "自我管理",
      source: "静态样例",
      reason: "适合提炼长期主义与杠杆笔记",
      guideUrl: "",
      coverTone: "cover-coral"
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    monthKey,
    monthLabel: formatMonth(monthKey),
    stats: {
      totalReadTime: 22 * 3600 + 40 * 60,
      totalReadTimeText: "22 小时 40 分钟",
      readDays: 18,
      dayAverageReadTime: 75 * 60,
      dayAverageReadTimeText: "1 小时 15 分钟",
      compare: 0.18,
      compareText: "较上期增长 18%",
      readBooks: 14,
      finishedBooks: 5,
      noteCount: 126,
      notebookBooks: 9,
      totalNotes: 318,
      annualReadTimeText: "146 小时"
    },
    trend: demoTrend(monthKey),
    categories,
    readLongest: featuredBooks.slice(0, 3).map((book, index) => ({
      ...book,
      readTime: [6.2, 4.8, 3.9][index] * 3600,
      readTimeText: secondsToText([6.2, 4.8, 3.9][index] * 3600),
      tags: []
    })),
    recentBooks: featuredBooks,
    notebooks: featuredBooks,
    noteTop: featuredBooks.map((book, index) => ({
      ...book,
      totalNotes: [88, 64, 51, 37][index],
      noteCount: [32, 24, 18, 15][index],
      reviewCount: [12, 8, 9, 5][index],
      bookmarkCount: [44, 32, 24, 17][index]
    })),
    featuredBooks,
    insights: [
      "这个月的阅读重心明显向「技术理解 + 现实系统」聚拢，适合把书摘进一步整理成主题卡片。",
      "笔记密度高于阅读时长增长，说明你不只是浏览，而是在主动筛选可复用的观点。",
      "下个月可以保留一本慢读书，同时把高价值笔记转成 3-5 条可执行问题。"
    ],
    ai: {
      configured: false,
      model: "static-preview"
    }
  };
}

function createDemoNotes() {
  const items = [
    {
      book: { title: "深度学习", author: "Ian Goodfellow 等", coverTone: "cover-blue" },
      totalNotes: 88,
      notes: [
        {
          type: "划线",
          createdAt: "6月3日",
          title: "深度学习",
          chapterTitle: "表示学习",
          text: "好的表示会让后续任务变得简单，它把复杂输入转化为更容易处理的结构。",
          content: "可以把每章核心概念整理成「问题 - 直觉 - 公式 - 例子」四格卡片。"
        },
        {
          type: "想法",
          createdAt: "6月8日",
          title: "深度学习",
          chapterTitle: "优化",
          text: "优化不是只追求更低损失，也是在可计算、可泛化和可解释之间做取舍。",
          content: "复盘时不要只记结论，要记录这个结论成立的约束条件。"
        }
      ]
    },
    {
      book: { title: "置身事内", author: "兰小欢", coverTone: "cover-amber" },
      totalNotes: 64,
      notes: [
        {
          type: "划线",
          createdAt: "6月12日",
          title: "置身事内",
          chapterTitle: "地方政府",
          text: "很多经济现象只有放回组织结构和激励机制里，才会显出真正的因果链。",
          content: "适合和产业政策、城市发展案例做交叉笔记。"
        }
      ]
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    source: "静态样例",
    items,
    highlights: items.flatMap((group) => group.notes)
  };
}

function createDemoReport() {
  return {
    monthKey: state.month,
    model: "static-preview",
    generatedAt: new Date().toISOString(),
    cached: true,
    content: `本月阅读状态：
你保持了稳定的阅读频率，阅读时长并不夸张，但笔记密度较高，说明复盘重点已经从“读了多少”转向“留下了什么”。

主题偏好：
本月主题集中在认知科学、商业组织与技术理解。它们之间有共同线索：你在关心复杂系统如何运转，以及个体如何在系统里做更好的判断。

关键书本与笔记洞察：
样例数据里，「深度学习」更适合拆成概念卡片，「置身事内」更适合做案例链路，「穷查理宝典」适合沉淀判断模型。下一步可以把高价值划线转成自己的问题清单。

下月阅读建议：
保留一本慢读书作为主线，再配两本轻量补充阅读。每周挑 3 条笔记改写成自己的话，月底报告会更像一份真正能复用的知识资产。`
  };
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);

  let response;
  try {
    response = await fetch(apiEndpoint(path), {
      headers: { "Content-Type": "application/json" },
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(error.name === "AbortError"
      ? "本地后端连接超时。请确认 npm start 正在运行。"
      : "本地后端未连接。请在本机运行 npm start 后刷新页面。");
  } finally {
    window.clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("本地后端未连接。请在本机运行 npm start 后刷新页面，或访问 http://localhost:8788 查看真实微信读书数据。");
  }
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `请求失败：${response.status}`);
  }
  return payload;
}

function showNotice(message, kind = "info") {
  if (!message) {
    notice.hidden = true;
    notice.textContent = "";
    notice.className = "notice";
    return;
  }
  notice.hidden = false;
  notice.className = `notice ${kind}`;
  notice.textContent = message;
}

function setStatus() {
  const status = state.status;
  const dashboard = state.dashboard;
  if (state.isDemoMode) {
    statusDot.textContent = "静态预览";
    statusDot.className = "status-dot demo";
    return;
  }
  if (!status) {
    statusDot.textContent = "检查中";
    statusDot.className = "status-dot";
    return;
  }
  const ready = status.authReady && Boolean(dashboard);
  statusDot.textContent = ready ? `已同步 ${formatDateTime(status.lastSyncAt)}` : "需要检查";
  statusDot.className = `status-dot ${ready ? "ready" : "warn"}`;
  const prebuildBtn = document.querySelector("#prebuildButton");
  if (prebuildBtn) {
    prebuildBtn.title = state.isPrebuildLoading ? "历史报告生成中，请稍候…" : "预生成所有历史报告";
    prebuildBtn.style.opacity = state.isPrebuildLoading ? "0.5" : "";
    prebuildBtn.textContent = state.isPrebuildLoading ? "⏳" : "⬇";
  }
}

async function loadStatus() {
  try {
    state.status = await api("/api/weread/status");
  } catch (error) {
    state.status = { cliReady: false, authReady: false, lastError: { message: error.message } };
  }
  setStatus();
}

async function loadDashboard() {
  state.isLoading = true;
  state.error = null;
  state.valuableNotes = null;
  state.report = null;
  render();
  try {
    const payload = await api(`/api/weread/dashboard?month=${encodeURIComponent(state.month)}`);
    if (!payload.dashboard) {
      throw new Error("本地微信读书缓存还没有生成 dashboard 数据。请先点击同步。");
    }
    state.dashboard = payload.dashboard;
    state.isDemoMode = false;
    if (payload.lastError?.message) {
      showNotice(`同步异常，正在展示最近缓存：${payload.lastError.message}`, "warn");
    } else {
      showNotice("");
    }
  } catch (error) {
    state.dashboard = createDemoDashboard(state.month);
    state.valuableNotes = createDemoNotes();
    state.report = null;
    state.error = null;
    state.isDemoMode = true;
    state.status = {
      cliReady: false,
      authReady: false,
      lastSyncAt: null,
      ai: { configured: false, model: "static-preview" },
      lastError: { message: error.message }
    };
    showNotice(STATIC_PREVIEW_MESSAGE, "warn");
  } finally {
    state.isLoading = false;
    monthLabel.textContent = formatMonth(state.month);
    setStatus();
    render();
  }
}

async function syncNow() {
  state.isSyncing = true;
  render();
  try {
    const payload = await api("/api/weread/sync", { method: "POST" });
    state.dashboard = payload.dashboard;
    state.isDemoMode = false;
    await loadStatus();
    showNotice("已完成微信读书同步。", "success");
  } catch (error) {
    const connectionIssue = error.message.includes("本地后端") || error.message.includes("连接超时");
    if (connectionIssue) {
      if (!state.dashboard) state.dashboard = createDemoDashboard(state.month);
      state.isDemoMode = true;
      showNotice(`仍在静态预览：${error.message}`, "warn");
    } else {
      showNotice(`同步失败：${error.message}`, "error");
    }
  } finally {
    state.isSyncing = false;
    render();
  }
}

async function loadValuableNotes(force = false) {
  state.isNotesLoading = true;
  render();
  try {
    const params = new URLSearchParams({ month: state.month });
    if (force) params.set("force", "1");
    state.valuableNotes = await api(`/api/weread/notes/valuable?${params}`);
    state.isDemoMode = false;
    showNotice("");
  } catch (error) {
    state.valuableNotes = createDemoNotes();
    showNotice(`正在展示高价值笔记样例：${error.message}`, "warn");
  } finally {
    state.isNotesLoading = false;
    render();
  }
}

async function prebuildAllReports() {
  state.isPrebuildLoading = true;
  render();
  try {
    // Long timeout: batch AI generation can take minutes
    const res = await fetch(`${LOCAL_API_ORIGIN}/api/weread/reports/prebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json();
    const generated = data.results?.filter((r) => r.status === "generated").length || 0;
    const locked = data.results?.filter((r) => r.status === "already_locked").length || 0;
    const errors = data.results?.filter((r) => r.status === "error") || [];
    const msg = `预生成完成：${generated} 份新生成，${locked} 份已锁定${errors.length ? `，${errors.length} 份失败` : ""}`;
    showNotice(msg, errors.length ? "warn" : "success");
  } catch (error) {
    showNotice(`预生成失败：${error.message}`, "warn");
  } finally {
    state.isPrebuildLoading = false;
    render();
  }
}

async function generateReport(force = false) {
  state.isReportLoading = true;
  render();
  if (state.isDemoMode) {
    state.report = createDemoReport();
    state.isReportLoading = false;
    showNotice("已展示静态样例报告。连接本地后端并配置 DeepSeek 后，可生成真实月度复盘。", "warn");
    render();
    return;
  }

  try {
    const payload = await api("/api/weread/report/monthly", {
      method: "POST",
      body: JSON.stringify({ monthKey: state.month, force })
    });
    state.report = payload.report;
    showNotice(payload.report.cached ? "已读取缓存复盘报告。" : "已生成新的复盘报告。", "success");
  } catch (error) {
    if (error.message.includes("本地后端") || error.message.includes("连接超时")) {
      state.isDemoMode = true;
      state.report = createDemoReport();
      showNotice(`已切换为样例报告：${error.message}`, "warn");
    } else {
      showNotice(error.message.includes("AI API Key")
        ? "AI API Key 未配置。设置 ANTHROPIC_API_KEY（Claude）或 DEEPSEEK_API_KEY（DeepSeek）后即可生成复盘。"
        : `报告生成失败：${error.message}`, "error");
    }
  } finally {
    state.isReportLoading = false;
    render();
  }
}

function cardMetric(title, value, sub, tone = "green") {
  return `
    <article class="metric-card ${tone}">
      <span class="metric-label">${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(sub)}</small>
    </article>
  `;
}

function statusStrip(d) {
  const syncText = state.isDemoMode ? "未连接本地后端" : formatDateTime(state.status?.lastSyncAt);
  const sourceText = state.isDemoMode ? "静态样例数据" : "微信读书本地缓存";
  const apiText = shouldUseLocalApi() ? LOCAL_API_ORIGIN : "同源 Node 服务";
  const aiProvider = d.ai?.provider === "anthropic" ? "Claude" : "DeepSeek";
  const aiText = d.ai?.configured ? `已配置 ${aiProvider} · ${d.ai.model}` : (state.isDemoMode ? "静态样例报告" : "AI 待配置（Claude/DeepSeek）");

  return `
    <section class="status-strip" aria-label="数据状态">
      <div>
        <span>页面模式</span>
        <strong>${escapeHtml(sourceText)}</strong>
        <small>${escapeHtml(apiText)}</small>
      </div>
      <div>
        <span>最近同步</span>
        <strong>${escapeHtml(syncText)}</strong>
        <small>${state.isDemoMode ? "真实数据只保存在本机" : "自动缓存到 data/ 目录"}</small>
      </div>
      <div>
        <span>月度报告</span>
        <strong>${escapeHtml(aiText)}</strong>
        <small>${state.isDemoMode ? "公开页面不会暴露个人缓存" : "可基于笔记生成复盘"}</small>
      </div>
    </section>
  `;
}

function chart(trend = []) {
  const values = trend.length ? trend.map((item) => item.minutes) : [0, 0, 0, 0];
  const max = Math.max(...values, 10);
  const width = 760;
  const height = 260;
  const pad = { left: 48, right: 24, top: 22, bottom: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const points = values.map((value, index) => {
    const x = pad.left + (plotW / Math.max(values.length - 1, 1)) * index;
    const y = pad.top + plotH - (value / max) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const fill = `${pad.left},${height - pad.bottom} ${points.join(" ")} ${width - pad.right},${height - pad.bottom}`;
  const grid = [0, 1, 2, 3, 4].map((row) => {
    const y = pad.top + (plotH / 4) * row;
    const label = Math.round(max - (max / 4) * row);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line><text x="10" y="${y + 4}">${label}m</text>`;
  }).join("");
  const labels = trend.map((item, index) => {
    if (index % Math.ceil(trend.length / 6 || 1) !== 0 && index !== trend.length - 1) return "";
    const x = pad.left + (plotW / Math.max(trend.length - 1, 1)) * index;
    return `<text x="${x - 22}" y="${height - 12}">${escapeHtml(item.date.slice(5))}</text>`;
  }).join("");

  const dots = points.map((pt) => {
    const [x, y] = pt.split(",");
    return `<circle class="chart-dot" cx="${x}" cy="${y}" r="4"></circle>`;
  }).join("");

  return `
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="阅读趋势">
      <g class="chart-grid">${grid}</g>
      <polygon class="chart-area" points="${fill}"></polygon>
      <polyline class="chart-line" points="${points.join(" ")}"></polyline>
      <g class="chart-dots">${dots}</g>
      <g class="chart-labels">${labels}</g>
    </svg>
  `;
}

function cover(book, className = "") {
  if (book.cover) {
    return `<img class="book-cover ${className}" src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}封面" loading="lazy" />`;
  }
  const tones = ["cover-green", "cover-blue", "cover-amber", "cover-coral"];
  const seed = [...String(book.title || "书")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const tone = book.coverTone || tones[seed % tones.length];
  return `
    <div class="book-cover empty ${className} ${tone}" aria-hidden="true">
      <span>${escapeHtml((book.title || "书").slice(0, 1))}</span>
      <i></i>
    </div>
  `;
}

function bookCard(book) {
  const guide = book.guideUrl
    ? `<a class="soft-button" href="${escapeHtml(book.guideUrl)}" target="_blank" rel="noreferrer">打开导读</a>`
    : `<span class="muted-chip">待接入导读</span>`;
  return `
    <article class="book-card">
      ${cover(book)}
      <div>
        <span class="source-pill">${escapeHtml(book.source || "重点")}</span>
        <h3>${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(book.author || "未知作者")}</p>
        <small>${escapeHtml(book.reason || "")}</small>
        ${book.category ? `<em>${escapeHtml(book.category)}</em>` : ""}
        ${guide}
      </div>
    </article>
  `;
}

function noteRow(item, index) {
  return `
    <li class="rank-row">
      <span>${index + 1}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.author || "")}</small>
      </div>
      <b>${escapeHtml(String(item.totalNotes || 0))}</b>
    </li>
  `;
}

function valuableNote(note) {
  const quote = clipText(note.text, 200);
  const idea = clipText(note.content, 280);
  const isIdea = note.type === "想法";
  return `
    <article class="note-card${isIdea ? " idea" : ""}">
      <div class="note-meta">
        <span>${escapeHtml(note.type || "笔记")}</span>
        <span>${escapeHtml(note.createdAt || "")}</span>
      </div>
      <h3>${escapeHtml(note.title)}</h3>
      ${note.chapterTitle ? `<small class="chapter-chip">${escapeHtml(note.chapterTitle)}</small>` : ""}
      ${quote ? `<blockquote>${escapeHtml(quote)}</blockquote>` : ""}
      ${idea ? `<p>${escapeHtml(idea)}</p>` : ""}
    </article>
  `;
}

function loadingBlock(text = "正在读取微信读书数据...") {
  return `<section class="empty-state"><div class="spinner"></div><p>${escapeHtml(text)}</p></section>`;
}

function dashboardView() {
  if (state.isLoading) return loadingBlock();
  if (state.error || !state.dashboard) {
    return `<section class="empty-state"><h2>暂时没有数据</h2><p>${escapeHtml(state.error || "请先同步微信读书数据。")}</p><button class="primary-action" data-action="sync" type="button">同步</button></section>`;
  }

  const d = state.dashboard;
  const stats = d.stats;
  const notePreview = state.valuableNotes?.highlights?.slice(0, 3) || [];
  const categoryMax = Math.max(...d.categories.map((item) => item.readingTime), 1);

  return `
    <section class="hero-grid">
      <div class="metric-grid">
        ${cardMetric("本月阅读", stats.totalReadTimeText, `${stats.compareText} · 日均 ${stats.dayAverageReadTimeText}`, "green")}
        ${cardMetric("阅读节奏", `${stats.readDays} 天`, `读过 ${stats.readBooks} · 读完 ${stats.finishedBooks}`, "amber")}
        ${cardMetric("笔记沉淀", stats.noteCount, `笔记本 ${stats.notebookBooks} 本 · 总计 ${stats.totalNotes} 条`, "coral")}
      </div>

      <article class="summary-card">
        <span class="section-kicker">本月总结</span>
        <strong>${escapeHtml(d.categories[0]?.title || "持续积累")}</strong>
        <p>${escapeHtml(d.insights[0] || "数据同步后会展示复盘摘要。")}</p>
        <div class="mini-advice">
          ${d.insights.slice(1).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </div>
      </article>
    </section>

    ${statusStrip(d)}

    <section class="content-grid">
      <article class="panel wide">
        <div class="panel-head">
          <div><span class="section-kicker">趋势</span><h2>阅读时间变化</h2></div>
          <small>${escapeHtml(d.monthLabel)}</small>
        </div>
        ${chart(d.trend)}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div><span class="section-kicker">偏好</span><h2>主题分布</h2></div>
        </div>
        <div class="category-list">
          ${d.categories.slice(0, 5).map((item) => `
            <div class="category-row">
              <span>${escapeHtml(item.title)}</span>
              <div><i style="width:${clamp((item.readingTime / categoryMax) * 100)}%"></i></div>
              <strong>${escapeHtml(item.readingTimeText)}</strong>
            </div>
          `).join("") || `<p class="muted">暂无分类数据</p>`}
        </div>
      </article>

      <article class="panel wide">
        <div class="panel-head">
          <div><span class="section-kicker">重点</span><h2>重点阅读书本</h2></div>
          <button class="ghost-button" type="button" data-view="books">查看全部</button>
        </div>
        <div class="book-strip">
          ${d.featuredBooks.slice(0, 4).map(bookCard).join("")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div><span class="section-kicker">笔记</span><h2>笔记最多</h2></div>
        </div>
        <ol class="rank-list">
          ${d.noteTop.slice(0, 6).map(noteRow).join("")}
        </ol>
      </article>

      <article class="panel wide">
        <div class="panel-head">
          <div><span class="section-kicker">摘录</span><h2>高价值笔记预览</h2></div>
          <button class="ghost-button" type="button" data-action="load-notes">${state.isNotesLoading ? "读取中" : "刷新笔记"}</button>
        </div>
        <div class="note-grid compact">
          ${notePreview.length ? notePreview.map(valuableNote).join("") : `<p class="muted">进入高价值笔记页后，会从笔记最多的 10 本书里抓取个人划线和想法。</p>`}
        </div>
      </article>
    </section>
  `;
}

function booksView() {
  const d = state.dashboard;
  if (!d) return loadingBlock();
  return `
    <section class="page-head">
      <div><span class="section-kicker">Featured Books</span><h2>重点阅读书本</h2></div>
      <p>手动置顶优先；没有配置时，由最近阅读、本月读得最多、笔记最多自动补位。</p>
    </section>
    <section class="book-grid">
      ${d.featuredBooks.map(bookCard).join("")}
    </section>
  `;
}

function notesView() {
  if (!state.valuableNotes && !state.isNotesLoading) {
    queueMicrotask(() => loadValuableNotes(false));
  }
  if (state.isNotesLoading && !state.valuableNotes) return loadingBlock(`正在抓取 ${formatMonth(state.month)} 的个人笔记...`);

  const groups = state.valuableNotes?.items || [];
  const monthLabel = formatMonth(state.month);

  const emptyState = `
    <section class="empty-state">
      <h2>📭 ${monthLabel}暂无笔记记录</h2>
      <p>这个月没有在笔记最多的书中找到划线或想法。<br>切换到其他月份，或在微信读书里多记录一些。</p>
    </section>
  `;

  return `
    <section class="page-head">
      <div><span class="section-kicker">Personal Notes · ${escapeHtml(monthLabel)}</span><h2>高价值笔记</h2></div>
      <button class="primary-action" data-action="reload-notes" type="button">${state.isNotesLoading ? "刷新中" : "重新抓取"}</button>
    </section>
    ${groups.length === 0 ? emptyState : `
    <section class="notes-layout">
      ${groups.map((group) => `
        <article class="panel note-group">
          <div class="book-inline">
            ${cover(group.book, "small")}
            <div>
              <h3>${escapeHtml(group.book.title)}</h3>
              <p>${escapeHtml(group.book.author || "")} · ${escapeHtml(monthLabel)}有 ${group.notes.length} 条笔记</p>
            </div>
          </div>
          ${group.error ? `<p class="muted">读取失败：${escapeHtml(group.error)}</p>` : ""}
          <div class="note-grid">
            ${group.notes.length ? group.notes.map(valuableNote).join("") : `<p class="muted">这本书在 ${escapeHtml(monthLabel)} 暂无划线或想法。</p>`}
          </div>
        </article>
      `).join("")}
    </section>`}
  `;
}

function reportView() {
  const d = state.dashboard;
  const aiConfigured = state.isDemoMode || state.status?.ai?.configured || d?.ai?.configured;
  const nowMonth = new Date().toISOString().slice(0, 7);
  const isPastMonth = state.month < nowMonth;
  const isCurrentMonth = state.month === nowMonth;
  const locked = state.report?.locked;

  let reportButton;
  if (state.isDemoMode) reportButton = "查看样例报告";
  else if (state.isReportLoading) reportButton = "生成中…";
  else if (locked) reportButton = "重新生成（覆盖锁定）";
  else if (isCurrentMonth && state.report?.content) reportButton = "刷新当月报告";
  else reportButton = "生成报告";

  const badgeHtml = locked
    ? `<span class="report-badge locked">历史报告 · 已锁定</span>`
    : isCurrentMonth && state.report?.content
    ? `<span class="report-badge current">当月进行中</span>`
    : "";

  const providerName = state.report?.provider === "anthropic" ? "Claude" : state.report?.provider === "deepseek" ? "DeepSeek" : "";
  const metaHtml = state.report?.content && !state.isReportLoading
    ? `<p class="report-meta">${state.report.generatedAt ? `生成于 ${new Date(state.report.generatedAt).toLocaleString("zh-CN")}` : ""}${providerName ? ` · ${providerName}` : ""}${locked ? " · 数据已冻结" : ""}</p>`
    : "";

  const loadingMsg = isPastMonth
    ? "正在生成历史复盘，完成后将锁定不再重复生成…"
    : "正在分析本月阅读进度，整理新增笔记亮点…";

  return `
    <section class="page-head">
      <div>
        <span class="section-kicker">Monthly Review</span>
        <h2>${formatMonth(state.month)} 复盘报告 ${badgeHtml}</h2>
      </div>
      <button class="primary-action" data-action="generate-report" type="button">${reportButton}</button>
    </section>
    <section class="report-shell">
      <article class="panel report-panel">
        ${!aiConfigured ? `<div class="empty-state compact"><h3>AI 未配置</h3><p>设置 <code>ANTHROPIC_API_KEY</code>（Claude）或 <code>DEEPSEEK_API_KEY</code>（DeepSeek），然后重启后端即可生成 AI 月度复盘。</p></div>` : ""}
        ${state.isReportLoading ? loadingBlock(loadingMsg) : ""}
        ${metaHtml}
        ${state.report?.content ? `<div class="report-content">${renderMarkdownish(state.report.content)}</div>` : (!state.isReportLoading ? `<p class="muted">${isPastMonth ? "历史月份数据已冻结，生成后将永久锁定，无需重复生成。" : "当月报告会突出本月新增笔记和进展亮点。"}</p>` : "")}
      </article>
    </section>
  `;
}

function renderMarkdownish(text) {
  function inlineFormat(s) {
    // **bold** → <strong>
    return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const cleaned = block.trim();
      if (!cleaned) return "";
      // Heading: line starting with ** and ending with ** (section header style)
      if (/^\*\*[^*]+\*\*$/.test(cleaned)) {
        return `<h3>${cleaned.slice(2, -2)}</h3>`;
      }
      // List items
      if (/^[-*]\s/.test(cleaned) || /^\d+\.\s/.test(cleaned)) {
        const items = cleaned.split(/\n/).map((li) => {
          const body = li.replace(/^[-*]\s+|^\d+\.\s+/, "");
          return `<li>${inlineFormat(escapeHtml(body))}</li>`;
        });
        return `<ul>${items.join("")}</ul>`;
      }
      return `<p>${inlineFormat(escapeHtml(cleaned)).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function render() {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.view));
  monthLabel.textContent = formatMonth(state.month);
  setStatus();
  const views = {
    dashboard: dashboardView,
    books: booksView,
    notes: notesView,
    report: reportView
  };
  app.innerHTML = (views[state.view] || dashboardView)();
  bindDynamicEvents();
}

function bindDynamicEvents() {
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });
  app.querySelectorAll("[data-action='sync']").forEach((button) => button.addEventListener("click", syncNow));
  app.querySelectorAll("[data-action='load-notes']").forEach((button) => button.addEventListener("click", () => loadValuableNotes(false)));
  app.querySelectorAll("[data-action='reload-notes']").forEach((button) => button.addEventListener("click", () => loadValuableNotes(true)));
  app.querySelectorAll("[data-action='generate-report']").forEach((button) => button.addEventListener("click", () => generateReport(false)));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.view = tab.dataset.view;
    render();
  });
});

document.querySelector("#prevMonth").addEventListener("click", () => {
  state.month = shiftMonth(state.month, -1);
  loadDashboard();
});

document.querySelector("#nextMonth").addEventListener("click", () => {
  state.month = shiftMonth(state.month, 1);
  loadDashboard();
});

document.querySelector("#syncButton").addEventListener("click", syncNow);
document.querySelector("#prebuildButton").addEventListener("click", () => {
  if (state.isPrebuildLoading) return;
  prebuildAllReports();
});
document.querySelector("#reportShortcut").addEventListener("click", () => {
  state.view = "report";
  render();
});

await loadStatus();
await loadDashboard();
