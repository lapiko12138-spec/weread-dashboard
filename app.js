const app = document.querySelector("#app");
const notice = document.querySelector("#notice");
const statusDot = document.querySelector("#statusDot");
const monthLabel = document.querySelector("#monthLabel");
const tabs = [...document.querySelectorAll(".tab")];

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
  error: null
};

function currentMonthKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("本地后端未连接。请在本机运行 npm start 后访问 http://localhost:8788 查看真实微信读书数据。");
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
  if (!status) {
    statusDot.textContent = "检查中";
    statusDot.className = "status-dot";
    return;
  }
  const ready = status.authReady && Boolean(dashboard);
  statusDot.textContent = ready ? `已同步 ${formatDateTime(status.lastSyncAt)}` : "需要检查";
  statusDot.className = `status-dot ${ready ? "ready" : "warn"}`;
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
  render();
  try {
    const payload = await api(`/api/weread/dashboard?month=${encodeURIComponent(state.month)}`);
    state.dashboard = payload.dashboard;
    if (payload.lastError?.message) {
      showNotice(`同步异常，正在展示最近缓存：${payload.lastError.message}`, "warn");
    } else {
      showNotice("");
    }
  } catch (error) {
    state.error = error.message;
    showNotice(error.message, error.message.includes("本地后端未连接") ? "warn" : "error");
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
    await loadStatus();
    showNotice("已完成微信读书同步。", "success");
  } catch (error) {
    showNotice(`同步失败：${error.message}`, "error");
  } finally {
    state.isSyncing = false;
    render();
  }
}

async function loadValuableNotes(force = false) {
  state.isNotesLoading = true;
  render();
  try {
    state.valuableNotes = await api(`/api/weread/notes/valuable${force ? "?force=1" : ""}`);
    showNotice("");
  } catch (error) {
    showNotice(`高价值笔记读取失败：${error.message}`, "error");
  } finally {
    state.isNotesLoading = false;
    render();
  }
}

async function generateReport(force = false) {
  state.isReportLoading = true;
  render();
  try {
    const payload = await api("/api/weread/report/monthly", {
      method: "POST",
      body: JSON.stringify({ monthKey: state.month, force })
    });
    state.report = payload.report;
    showNotice(payload.report.cached ? "已读取缓存复盘报告。" : "已生成新的复盘报告。", "success");
  } catch (error) {
    showNotice(error.message.includes("DeepSeek API Key")
      ? "DeepSeek API Key 未配置。设置 DEEPSEEK_API_KEY 后即可生成 AI 复盘。"
      : `报告生成失败：${error.message}`, "error");
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

  return `
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="阅读趋势">
      <g class="chart-grid">${grid}</g>
      <polygon class="chart-area" points="${fill}"></polygon>
      <polyline class="chart-line" points="${points.join(" ")}"></polyline>
      <g class="chart-labels">${labels}</g>
    </svg>
  `;
}

function cover(book, className = "") {
  if (book.cover) {
    return `<img class="book-cover ${className}" src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}封面" loading="lazy" />`;
  }
  return `<div class="book-cover empty ${className}" aria-hidden="true">${escapeHtml((book.title || "书").slice(0, 1))}</div>`;
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
  const quote = clipText(note.text, 180);
  const idea = clipText(note.content, 240);
  return `
    <article class="note-card">
      <div class="note-meta">
        <span>${escapeHtml(note.type || "笔记")}</span>
        <span>${escapeHtml(note.createdAt || "")}</span>
      </div>
      <h3>${escapeHtml(note.title)}</h3>
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
  if (state.isNotesLoading && !state.valuableNotes) return loadingBlock("正在抓取笔记最多前 10 本的个人笔记...");

  const groups = state.valuableNotes?.items || [];
  return `
    <section class="page-head">
      <div><span class="section-kicker">Personal Notes</span><h2>高价值笔记</h2></div>
      <button class="primary-action" data-action="reload-notes" type="button">${state.isNotesLoading ? "刷新中" : "重新抓取"}</button>
    </section>
    <section class="notes-layout">
      ${groups.map((group) => `
        <article class="panel note-group">
          <div class="book-inline">
            ${cover(group.book, "small")}
            <div>
              <h3>${escapeHtml(group.book.title)}</h3>
              <p>${escapeHtml(group.book.author || "")} · ${group.totalNotes || 0} 条笔记</p>
            </div>
          </div>
          ${group.error ? `<p class="muted">读取失败：${escapeHtml(group.error)}</p>` : ""}
          <div class="note-grid">
            ${group.notes.length ? group.notes.map(valuableNote).join("") : `<p class="muted">这本书暂时没有可展示的划线或想法。</p>`}
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function reportView() {
  const d = state.dashboard;
  const aiConfigured = state.status?.ai?.configured || d?.ai?.configured;
  return `
    <section class="page-head">
      <div><span class="section-kicker">Monthly Review</span><h2>${formatMonth(state.month)} 复盘报告</h2></div>
      <button class="primary-action" data-action="generate-report" type="button">${state.isReportLoading ? "生成中" : "生成报告"}</button>
    </section>
    <section class="report-shell">
      <article class="panel report-panel">
        ${!aiConfigured ? `<div class="empty-state compact"><h3>DeepSeek 未配置</h3><p>设置 DEEPSEEK_API_KEY 后，可以生成 AI 月度复盘。其他阅读数据不受影响。</p></div>` : ""}
        ${state.isReportLoading ? loadingBlock("正在整理本月阅读数据并请求 DeepSeek...") : ""}
        ${state.report?.content ? `<div class="report-content">${renderMarkdownish(state.report.content)}</div>` : (!state.isReportLoading ? `<p class="muted">报告会基于本地缓存摘要、重点书本和高价值笔记摘选生成。</p>` : "")}
      </article>
    </section>
  `;
}

function renderMarkdownish(text) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((block) => {
      const cleaned = block.trim();
      if (!cleaned) return "";
      if (/^\d+\.\s/.test(cleaned) || /^[-*]\s/.test(cleaned)) {
        return `<p>${cleaned.replace(/\n/g, "<br>")}</p>`;
      }
      if (cleaned.length < 28 && /[：:]?$/.test(cleaned)) return `<h3>${cleaned}</h3>`;
      return `<p>${cleaned.replace(/\n/g, "<br>")}</p>`;
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
document.querySelector("#reportShortcut").addEventListener("click", () => {
  state.view = "report";
  render();
});

await loadStatus();
await loadDashboard();
