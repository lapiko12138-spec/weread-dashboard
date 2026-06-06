import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const SNAPSHOT_DIR = path.join(DATA_DIR, "snapshots");
const REPORT_DIR = path.join(DATA_DIR, "reports");
const CACHE_FILE = path.join(DATA_DIR, "weread-cache.json");
const VALUABLE_NOTES_FILE = path.join(DATA_DIR, "valuable-notes.json");
const FEATURED_CONFIG_FILE = path.join(ROOT_DIR, "config", "featured-books.json");

const PORT = Number(process.env.WEREAD_DASHBOARD_PORT || 8788);
const HOST = process.env.WEREAD_DASHBOARD_HOST || "0.0.0.0";
const SYNC_INTERVAL_MS = Number(process.env.WEREAD_SYNC_INTERVAL_MS || 15 * 60 * 1000);
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const WEREAD_TIMEOUT_MS = Number(process.env.WEREAD_TIMEOUT_MS || 25000);
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key"
};

let syncPromise = null;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(body, null, 2));
}

function sendText(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error("请求体过大");
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

async function ensureDirs() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayKey() {
  return localDateKey(new Date());
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function monthBaseTime(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return Math.floor(new Date(year, month - 1, 1, 0, 0, 0).getTime() / 1000);
}

function dateFromUnix(seconds) {
  return localDateKey(new Date(Number(seconds) * 1000));
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function secondsToText(seconds = 0) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours && minutes) return `${hours} 小时 ${minutes} 分钟`;
  if (hours) return `${hours} 小时`;
  return `${minutes} 分钟`;
}

function numberText(value = 0) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

async function runCli(args, options = {}) {
  const { stdout, stderr } = await execFileAsync("weread", args, {
    timeout: options.timeout || WEREAD_TIMEOUT_MS,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024
  });

  if (stderr?.trim() && options.includeStderr) {
    return { stdout, stderr };
  }
  return stdout;
}

async function runWereadJson(args, options = {}) {
  const stdout = await runCli(["--json", ...args], options);
  return JSON.parse(stdout);
}

function unwrapItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  if (Array.isArray(payload.data?.books)) return payload.data.books;
  if (Array.isArray(payload.data?.updated)) return payload.data.updated;
  if (Array.isArray(payload.data?.reviews)) return payload.data.reviews;
  return [];
}

function normalizeBook(input = {}) {
  const source = input.book || input.bookInfo || input.albumInfo || input;
  return {
    bookId: String(input.bookId || source.bookId || ""),
    title: source.title || input.title || "未命名书籍",
    author: source.author || input.author || source.albumAuthor || "未知作者",
    cover: source.cover || input.cover || "",
    category: source.category || source.categories?.[0]?.title || input.category || "",
    intro: source.intro || ""
  };
}

function compactNotebook(item = {}) {
  const book = normalizeBook(item);
  const noteCount = Number(item.noteCount || 0);
  const reviewCount = Number(item.reviewCount || 0);
  const bookmarkCount = Number(item.bookmarkCount || 0);
  return {
    ...book,
    noteCount,
    reviewCount,
    bookmarkCount,
    totalNotes: Number(item.totalNotes || noteCount + reviewCount + bookmarkCount),
    readingProgress: Number(item.readingProgress || 0),
    sort: Number(item.sort || 0)
  };
}

function compactRecent(item = {}) {
  return {
    ...normalizeBook(item),
    type: item.type || "book",
    readUpdateTime: Number(item.readUpdateTime || 0),
    updateTime: Number(item.updateTime || 0)
  };
}

function compactReadLongest(item = {}) {
  const book = normalizeBook(item);
  return {
    ...book,
    readTime: Number(item.readTime || 0),
    readTimeText: secondsToText(item.readTime || 0),
    tags: Array.isArray(item.tags) ? item.tags : []
  };
}

function readStatValue(readStat = [], name) {
  const item = readStat.find((entry) => entry.stat === name);
  return item?.counts || "0";
}

function compareText(compare) {
  if (typeof compare !== "number" || Number.isNaN(compare)) return "暂无上期对比";
  const percent = Math.abs(compare * 100).toFixed(0);
  return compare >= 0 ? `较上期增长 ${percent}%` : `较上期下降 ${percent}%`;
}

function buildTrend(readTimes = {}) {
  return Object.entries(readTimes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([timestamp, seconds]) => ({
      date: dateFromUnix(timestamp),
      seconds: Number(seconds) || 0,
      minutes: Math.round((Number(seconds) || 0) / 60)
    }));
}

async function loadFeaturedConfig() {
  const config = await readJson(FEATURED_CONFIG_FILE, []);
  return Array.isArray(config)
    ? config
        .filter((item) => item?.bookId || item?.title)
        .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    : [];
}

function mergeBookData(book, maps = {}) {
  const fromNotes = maps.notes.get(book.bookId) || maps.notesByTitle.get(book.title);
  const fromRecent = maps.recent.get(book.bookId) || maps.recentByTitle.get(book.title);
  const fromLongest = maps.longest.get(book.bookId) || maps.longestByTitle.get(book.title);
  return {
    ...book,
    ...fromRecent,
    ...fromLongest,
    ...fromNotes,
    title: book.title || fromRecent?.title || fromLongest?.title || fromNotes?.title,
    author: book.author || fromRecent?.author || fromLongest?.author || fromNotes?.author,
    cover: book.cover || fromRecent?.cover || fromLongest?.cover || fromNotes?.cover
  };
}

function addMapEntries(map, byTitle, books) {
  for (const book of books) {
    if (book.bookId) map.set(book.bookId, book);
    if (book.title) byTitle.set(book.title, book);
  }
}

async function buildFeaturedBooks({ recentBooks, readLongest, noteTop }) {
  const manual = await loadFeaturedConfig();
  const recentMap = new Map();
  const recentByTitle = new Map();
  const notesMap = new Map();
  const notesByTitle = new Map();
  const longestMap = new Map();
  const longestByTitle = new Map();
  addMapEntries(recentMap, recentByTitle, recentBooks);
  addMapEntries(notesMap, notesByTitle, noteTop);
  addMapEntries(longestMap, longestByTitle, readLongest);

  const maps = {
    recent: recentMap,
    recentByTitle,
    notes: notesMap,
    notesByTitle,
    longest: longestMap,
    longestByTitle
  };

  const output = [];
  const seen = new Set();
  const push = (book, source, extra = {}) => {
    const merged = mergeBookData(book, maps);
    const key = merged.bookId || merged.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push({
      ...merged,
      source,
      guideUrl: extra.guideUrl || merged.guideUrl || "",
      priority: Number(extra.priority || 0),
      reason: extra.reason || source
    });
  };

  for (const item of manual) {
    push({ bookId: item.bookId || "", title: item.title || "", author: "" }, "手动置顶", {
      guideUrl: item.guideUrl || "",
      priority: item.priority,
      reason: "已配置导读入口"
    });
  }

  for (const item of readLongest) push(item, "本月读得最多", { reason: item.readTimeText });
  for (const item of recentBooks) push(item, "最近阅读", { reason: item.readUpdateTime ? dateFromUnix(item.readUpdateTime) : "" });
  for (const item of noteTop) push(item, "笔记最多", { reason: `${item.totalNotes || 0} 条笔记` });

  return output.slice(0, 8);
}

function localInsights(monthly, noteTop) {
  const categories = (monthly.preferCategory || []).filter((item) => Number(item.readingTime || 0) > 0);
  const topCategory = categories[0]?.categoryTitle || "暂无分类";
  const topNoteBook = noteTop[0]?.title || "暂无笔记排行";
  const totalReadTime = secondsToText(monthly.totalReadTime || 0);
  return [
    `本月累计阅读 ${totalReadTime}，${compareText(monthly.compare)}。`,
    `当前偏好集中在「${topCategory}」，可以顺手把同类书沉淀成一个主题阅读清单。`,
    `笔记最密集的书是「${topNoteBook}」，适合作为本月复盘报告的核心素材。`
  ];
}

async function buildDashboard(raw) {
  const monthly = raw.monthly?.data || {};
  const annually = raw.annually?.data || {};
  const recentBooks = unwrapItems(raw.recent).map(compactRecent);
  const notebooksRaw = unwrapItems(raw.notebooks).map(compactNotebook);
  const noteTop = unwrapItems(raw.noteTop).map(compactNotebook);
  const readLongest = (monthly.readLongest || []).map(compactReadLongest);
  const featuredBooks = await buildFeaturedBooks({ recentBooks, readLongest, noteTop });
  const categories = (monthly.preferCategory || []).filter((item) => Number(item.readingTime || 0) > 0);

  return {
    generatedAt: new Date().toISOString(),
    monthKey: raw.monthKey,
    monthLabel: monthLabel(raw.monthKey),
    stats: {
      totalReadTime: Number(monthly.totalReadTime || 0),
      totalReadTimeText: secondsToText(monthly.totalReadTime || 0),
      readDays: Number(monthly.readDays || 0),
      dayAverageReadTime: Number(monthly.dayAverageReadTime || 0),
      dayAverageReadTimeText: secondsToText(monthly.dayAverageReadTime || 0),
      compare: typeof monthly.compare === "number" ? monthly.compare : null,
      compareText: compareText(monthly.compare),
      readBooks: readStatValue(monthly.readStat, "读过"),
      finishedBooks: readStatValue(monthly.readStat, "读完"),
      noteCount: readStatValue(monthly.readStat, "笔记"),
      notebookBooks: Number(raw.notebooks?.data?.totalBookCount || notebooksRaw.length || 0),
      totalNotes: Number(raw.notebooks?.data?.totalNoteCount || 0),
      annualReadTimeText: secondsToText(annually.totalReadTime || 0)
    },
    trend: buildTrend(monthly.readTimes || {}),
    categories: categories.map((item) => ({
      title: item.categoryTitle,
      readingTime: Number(item.readingTime || 0),
      readingTimeText: secondsToText(item.readingTime || 0),
      readingCount: Number(item.readingCount || 0)
    })),
    readLongest,
    recentBooks: recentBooks.slice(0, 10),
    notebooks: notebooksRaw.slice(0, 24),
    noteTop: noteTop.slice(0, 10),
    featuredBooks,
    insights: localInsights(monthly, noteTop),
    ai: {
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
      model: DEEPSEEK_MODEL
    }
  };
}

async function fetchSummaryData(monthKey = currentMonthKey()) {
  const monthlyArgs = ["readdata", "detail", "--mode", "monthly"];
  if (monthKey !== currentMonthKey()) monthlyArgs.push("--base-time", String(monthBaseTime(monthKey)));

  const [monthly, annually, recent, notebooks, noteTop] = await Promise.all([
    runWereadJson(monthlyArgs, { maxBuffer: 24 * 1024 * 1024 }),
    runWereadJson(["readdata", "detail", "--mode", "annually"], { maxBuffer: 24 * 1024 * 1024 }),
    runWereadJson(["--compact", "shelf", "recent", "--limit", "12"]),
    runWereadJson(["notes", "notebooks", "--count", "100"], { maxBuffer: 24 * 1024 * 1024 }),
    runWereadJson(["--compact", "notes", "top", "--limit", "10"], { maxBuffer: 24 * 1024 * 1024 })
  ]);

  return { monthKey, monthly, annually, recent, notebooks, noteTop };
}

async function refreshData({ force = false } = {}) {
  if (syncPromise && !force) return syncPromise;

  syncPromise = (async () => {
    await ensureDirs();
    const previous = await readJson(CACHE_FILE, null);
    try {
      const raw = await fetchSummaryData(currentMonthKey());
      const dashboard = await buildDashboard(raw);
      const cache = {
        ok: true,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        monthKey: currentMonthKey(),
        raw,
        dashboard
      };
      await writeJson(CACHE_FILE, cache);
      await writeJson(path.join(SNAPSHOT_DIR, `${todayKey()}.json`), cache);
      return cache;
    } catch (error) {
      const cache = previous || {
        ok: false,
        lastSyncAt: null,
        monthKey: currentMonthKey(),
        dashboard: null
      };
      cache.ok = Boolean(cache.dashboard);
      cache.lastError = {
        message: error.message,
        at: new Date().toISOString()
      };
      await writeJson(CACHE_FILE, cache);
      if (!cache.dashboard) throw error;
      return cache;
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

async function getDashboardForMonth(monthKey) {
  const cache = await readJson(CACHE_FILE, null);
  if (cache?.dashboard && (!monthKey || monthKey === cache.monthKey)) return cache;

  const raw = await fetchSummaryData(monthKey || currentMonthKey());
  return {
    ok: true,
    lastSyncAt: cache?.lastSyncAt || null,
    lastError: cache?.lastError || null,
    monthKey: raw.monthKey,
    raw,
    dashboard: await buildDashboard(raw)
  };
}

async function statusPayload() {
  let doctor = "";
  let cliReady = false;
  let authReady = false;
  try {
    doctor = await runCli(["doctor"], { timeout: 8000 });
    cliReady = true;
    authReady = doctor.includes("Auth: configured") && doctor.includes("Ready");
  } catch (error) {
    doctor = error.message;
  }

  const cache = await readJson(CACHE_FILE, null);
  return {
    cliReady,
    authReady,
    doctor: doctor.split("\n").filter(Boolean),
    lastSyncAt: cache?.lastSyncAt || null,
    lastError: cache?.lastError || null,
    hasCache: Boolean(cache?.dashboard),
    ai: {
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
      model: DEEPSEEK_MODEL,
      baseUrl: DEEPSEEK_BASE_URL
    },
    syncIntervalMs: SYNC_INTERVAL_MS
  };
}

function compactBookmark(item = {}, book = {}) {
  const text = item.markText || item.text || item.abstract || "";
  return {
    id: item.bookmarkId || `${book.bookId}-${item.chapterUid || "x"}-${item.range || text.slice(0, 12)}`,
    type: "划线",
    bookId: book.bookId,
    title: book.title,
    author: book.author,
    chapterUid: item.chapterUid,
    chapterTitle: item.chapterTitle || item.chapterName || "",
    text,
    content: "",
    createdAt: item.createTime ? dateFromUnix(item.createTime) : "",
    range: item.range || "",
    valueScore: scoreNote(text, "")
  };
}

function compactReview(item = {}, book = {}) {
  const review = item.review || item;
  const content = review.content || "";
  const abstract = review.abstract || review.markText || "";
  return {
    id: review.reviewId || `${book.bookId}-${review.createTime || content.slice(0, 12)}`,
    type: "想法",
    bookId: book.bookId,
    title: book.title,
    author: book.author,
    chapterUid: review.chapterUid,
    chapterTitle: review.chapterName || "",
    text: abstract,
    content,
    createdAt: review.createTime ? dateFromUnix(review.createTime) : "",
    range: review.range || "",
    valueScore: scoreNote(abstract, content)
  };
}

function scoreNote(text = "", content = "") {
  const length = `${text}${content}`.replace(/\s/g, "").length;
  const hasIdea = content ? 30 : 0;
  const hasLongQuote = text.length > 80 ? 15 : 0;
  return Math.min(100, Math.round(length / 4) + hasIdea + hasLongQuote);
}

async function fetchBookNotes(book) {
  const [bookmarks, reviews] = await Promise.all([
    runWereadJson(["--compact", "notes", "bookmarks", book.bookId, "--limit", "40"], { maxBuffer: 18 * 1024 * 1024 }),
    runWereadJson(["--compact", "notes", "mine", book.bookId, "--count", "40"], { maxBuffer: 18 * 1024 * 1024 })
  ]);
  const bookmarkItems = unwrapItems(bookmarks).map((item) => compactBookmark(item, book));
  const reviewItems = unwrapItems(reviews).map((item) => compactReview(item, book));
  return [...bookmarkItems, ...reviewItems]
    .filter((item) => item.text || item.content)
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 8);
}

async function valuableNotes({ force = false } = {}) {
  const cached = await readJson(VALUABLE_NOTES_FILE, null);
  const cacheAge = cached?.generatedAt ? Date.now() - new Date(cached.generatedAt).getTime() : Infinity;
  if (!force && cached?.items?.length && cacheAge < 60 * 60 * 1000) return cached;

  const cache = await refreshData();
  const books = (cache.dashboard?.noteTop || []).slice(0, 10);
  const groups = [];

  for (const book of books) {
    try {
      const notes = await fetchBookNotes(book);
      groups.push({
        book,
        notes,
        totalNotes: book.totalNotes || notes.length
      });
    } catch (error) {
      groups.push({
        book,
        notes: [],
        totalNotes: book.totalNotes || 0,
        error: error.message
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "笔记最多前 10 本",
    items: groups,
    highlights: groups.flatMap((group) => group.notes.slice(0, 2)).slice(0, 12)
  };
  await writeJson(VALUABLE_NOTES_FILE, payload);
  return payload;
}

function reportPrompt(dashboard, notes) {
  const payload = {
    month: dashboard.monthLabel,
    stats: dashboard.stats,
    categories: dashboard.categories,
    readLongest: dashboard.readLongest.slice(0, 5),
    featuredBooks: dashboard.featuredBooks.slice(0, 6),
    noteTop: dashboard.noteTop.slice(0, 8),
    highValueNotes: notes.highlights.slice(0, 10).map((item) => ({
      book: item.title,
      type: item.type,
      text: item.text,
      idea: item.content
    }))
  };

  return `请基于以下微信读书本地缓存，生成一份私人月度阅读复盘。要求中文、克制、具体，不要编造未给出的事实。输出四段：1. 本月阅读状态；2. 主题偏好；3. 关键书本与笔记洞察；4. 下月阅读建议。\n\n${JSON.stringify(payload, null, 2)}`;
}

async function generateMonthlyReport({ monthKey, force = false } = {}) {
  const targetMonth = monthKey || currentMonthKey();
  const reportFile = path.join(REPORT_DIR, `${targetMonth}.json`);
  const cached = await readJson(reportFile, null);
  if (!force && cached?.content) return { ...cached, cached: true };

  if (!process.env.DEEPSEEK_API_KEY) {
    const error = new Error("DeepSeek API Key 未配置，请设置 DEEPSEEK_API_KEY");
    error.statusCode = 503;
    throw error;
  }

  const cache = await getDashboardForMonth(targetMonth);
  const notes = await valuableNotes();
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content: "你是一个高级阅读复盘产品里的私人阅读教练。你只根据输入数据总结，不夸张，不鸡汤。"
        },
        {
          role: "user",
          content: reportPrompt(cache.dashboard, notes)
        }
      ],
      max_tokens: 1800
    })
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`DeepSeek 请求失败：${response.status} ${text.slice(0, 300)}`);
    error.statusCode = response.status;
    throw error;
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || "";
  const report = {
    monthKey: targetMonth,
    model: DEEPSEEK_MODEL,
    generatedAt: new Date().toISOString(),
    content,
    usage: json.usage || null
  };
  await writeJson(reportFile, report);
  return report;
}

function staticPath(urlPath) {
  const route = urlPath === "/" ? "/index.html" : urlPath;
  const resolved = path.resolve(ROOT_DIR, `.${route}`);
  return resolved.startsWith(ROOT_DIR) ? resolved : path.join(ROOT_DIR, "index.html");
}

async function serveStatic(urlPath, response) {
  const filePath = staticPath(urlPath);
  if (!existsSync(filePath)) {
    sendText(response, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  sendText(response, 200, await readFile(filePath), contentTypes[ext] || "application/octet-stream");
}

async function handleApi(request, response, url) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, jsonHeaders);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/weread/status") {
    sendJson(response, 200, await statusPayload());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/weread/dashboard") {
    const month = url.searchParams.get("month") || currentMonthKey();
    const cache = await getDashboardForMonth(month);
    sendJson(response, 200, {
      ok: Boolean(cache.dashboard),
      lastSyncAt: cache.lastSyncAt,
      lastError: cache.lastError,
      dashboard: cache.dashboard
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/weread/sync") {
    const cache = await refreshData({ force: true });
    sendJson(response, 200, {
      ok: Boolean(cache.dashboard),
      lastSyncAt: cache.lastSyncAt,
      lastError: cache.lastError,
      dashboard: cache.dashboard
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/weread/books/featured") {
    const cache = await refreshData();
    sendJson(response, 200, { ok: true, items: cache.dashboard.featuredBooks });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/weread/notes/valuable") {
    const force = url.searchParams.get("force") === "1";
    sendJson(response, 200, { ok: true, ...(await valuableNotes({ force })) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/weread/report/monthly") {
    const body = await readJsonBody(request);
    try {
      sendJson(response, 200, { ok: true, report: await generateMonthlyReport(body) });
    } catch (error) {
      if (error.statusCode === 503) {
        sendJson(response, 200, { ok: false, needsConfig: true, error: error.message });
        return;
      }
      throw error;
    }
    return;
  }

  sendJson(response, 404, { ok: false, error: "Unknown API route" });
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message,
      at: new Date().toISOString()
    });
  }
}

await ensureDirs();
refreshData().catch((error) => {
  console.error(`Initial sync failed: ${error.message}`);
});
setInterval(() => {
  refreshData({ force: true }).catch((error) => {
    console.error(`Scheduled sync failed: ${error.message}`);
  });
}, SYNC_INTERVAL_MS);

http.createServer(handleRequest).listen(PORT, HOST, () => {
  console.log(`Reading dashboard listening on http://${HOST}:${PORT}`);
  console.log(`Open http://localhost:${PORT}`);
});
