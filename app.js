(function () {
  const seed = window.phoneRadarSeed;
  const storageKeys = {
    news: "phoneRadar.customNews",
    devices: "phoneRadar.customDevices",
    itemState: "phoneRadar.itemState",
    notificationsEnabled: "phoneRadar.notificationsEnabled",
    alertItemIds: "phoneRadar.alertItemIds",
    lastRefreshAt: "phoneRadar.lastRefreshAt"
  };

  const state = {
    view: "digest",
    query: "",
    brand: "全部",
    type: "全部",
    trust: "全部",
    favoriteOnly: false,
    sourceGroup: "全部",
    deviceStatus: "全部",
    compareIds: new Set()
  };

  let autoUpdateTimer = null;
  let autoUpdateStartedAt = 0;
  let backgroundUpdateInProgress = false;

  const elements = {
    searchInput: document.querySelector("#searchInput"),
    brandFilter: document.querySelector("#brandFilter"),
    typeFilter: document.querySelector("#typeFilter"),
    trustFilter: document.querySelector("#trustFilter"),
    favoriteOnly: document.querySelector("#favoriteOnly"),
    sourceShortcuts: document.querySelector("#sourceShortcuts"),
    digestList: document.querySelector("#digestList"),
    digestGroups: document.querySelector("#digestGroups"),
    emptyDigest: document.querySelector("#emptyDigest"),
    heroStats: document.querySelector("#heroStats"),
    digestCount: document.querySelector("#digestCount"),
    digestUpdatedAt: document.querySelector("#digestUpdatedAt"),
    lastRefreshTime: document.querySelector("#lastRefreshTime"),
    newsList: document.querySelector("#newsList"),
    emptyFeed: document.querySelector("#emptyFeed"),
    totalCount: document.querySelector("#totalCount"),
    officialCount: document.querySelector("#officialCount"),
    savedCount: document.querySelector("#savedCount"),
    deviceStatusFilter: document.querySelector("#deviceStatusFilter"),
    deviceTable: document.querySelector("#deviceTable"),
    compareShelf: document.querySelector("#compareShelf"),
    sourceGrid: document.querySelector("#sourceGrid"),
    focusList: document.querySelector("#focusList"),
    notifyButton: document.querySelector("#notifyButton"),
    notifyStatus: document.querySelector("#notifyStatus"),
    addNewsForm: document.querySelector("#addNewsForm"),
    addDeviceForm: document.querySelector("#addDeviceForm"),
    exportButton: document.querySelector("#exportButton")
  };

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function canUseLocalUpdateApi() {
    const localHosts = ["127.0.0.1", "localhost"];
    return window.location.protocol === "http:" && window.location.port === "8765" && localHosts.includes(window.location.hostname);
  }

  function canPollStaticData() {
    return ["http:", "https:"].includes(window.location.protocol);
  }

  function latestDataUpdatedAt(autoData = window.phoneRadarAuto, report = window.phoneRadarDaily) {
    const values = [autoData?.updatedAt, report?.updatedAt].filter(Boolean).sort();
    return values[values.length - 1] || "";
  }

  function maybeAutoUpdateFromLocalServer() {
    if (!canUseLocalUpdateApi()) return;
    const updatedKey = "phoneRadar.justAutoUpdatedAt";
    const justUpdatedAt = Number(sessionStorage.getItem(updatedKey) || 0);
    const reloadGuard = 8 * 1000;

    if (Date.now() - justUpdatedAt < reloadGuard) {
      const lastDuration = sessionStorage.getItem("phoneRadar.lastUpdateDuration");
      const durationText = lastDuration ? `，用时 ${lastDuration} 秒` : "";
      setAutoUpdateStatus(`已完成${durationText}。以后刷新这个网页，就会重新抓取并整理一次。`);
      maybeNotifyTopStories("打开后已更新");
      return;
    }

    startAutoUpdateTimer("正在自动更新日报");

    fetch("/api/update", { method: "POST" })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) {
          const seconds = stopAutoUpdateTimer();
          setAutoUpdateStatus(`自动更新失败，已等待 ${seconds} 秒，保留上次日报。`);
          return;
        }
        const seconds = stopAutoUpdateTimer();
        sessionStorage.setItem("phoneRadar.lastUpdateDuration", String(seconds));
        localStorage.setItem(storageKeys.lastRefreshAt, result.updatedAt || new Date().toISOString());
        sessionStorage.setItem(updatedKey, String(Date.now()));
        setAutoUpdateStatus(`已完成，用时 ${seconds} 秒，正在刷新日报。`);
        window.location.reload();
      })
      .catch(() => {
        const seconds = stopAutoUpdateTimer();
        setAutoUpdateStatus(`自动更新失败，已等待 ${seconds} 秒，保留上次日报。`);
      });
  }

  function setAutoUpdateStatus(message) {
    const intro = document.querySelector("#dailyIntro");
    if (intro) intro.textContent = message;
  }

  function startAutoUpdateTimer(prefix) {
    stopAutoUpdateTimer();
    autoUpdateStartedAt = Date.now();
    setAutoUpdateStatus(`${prefix}，已等待 0 秒。`);
    autoUpdateTimer = window.setInterval(() => {
      const seconds = elapsedAutoUpdateSeconds();
      setAutoUpdateStatus(`${prefix}，已等待 ${seconds} 秒。`);
    }, 1000);
  }

  function stopAutoUpdateTimer() {
    if (autoUpdateTimer) {
      window.clearInterval(autoUpdateTimer);
      autoUpdateTimer = null;
    }
    const seconds = elapsedAutoUpdateSeconds();
    autoUpdateStartedAt = 0;
    return seconds;
  }

  function elapsedAutoUpdateSeconds() {
    if (!autoUpdateStartedAt) return 0;
    return Math.max(1, Math.round((Date.now() - autoUpdateStartedAt) / 1000));
  }

  function notificationSupported() {
    return "Notification" in window;
  }

  function notificationsEnabled() {
    return localStorage.getItem(storageKeys.notificationsEnabled) === "true";
  }

  function setNotificationsEnabled(enabled) {
    localStorage.setItem(storageKeys.notificationsEnabled, enabled ? "true" : "false");
  }

  function updateNotificationUi() {
    if (!elements.notifyButton || !elements.notifyStatus) return;
    if (!notificationSupported()) {
      elements.notifyButton.disabled = true;
      elements.notifyStatus.textContent = "当前浏览器不支持提醒";
      return;
    }

    const enabled = notificationsEnabled() && Notification.permission === "granted";
    elements.notifyButton.classList.toggle("is-enabled", enabled);
    elements.notifyButton.textContent = enabled ? "提醒已开启" : "开启提醒";
    if (enabled) {
      elements.notifyStatus.textContent = "只提醒新增重点爆料";
      return;
    }
    if (Notification.permission === "denied") {
      elements.notifyStatus.textContent = "浏览器已拦截提醒，请在地址栏权限里放开";
      return;
    }
    elements.notifyStatus.textContent = "授权后只提醒新增重点爆料";
  }

  async function requestNotifications() {
    if (!notificationSupported()) {
      updateNotificationUi();
      return;
    }

    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationsEnabled(false);
        updateNotificationUi();
        return;
      }
    }

    setNotificationsEnabled(true);
    rememberAlertItems(getDailyReport());
    updateNotificationUi();
    if (elements.notifyStatus) elements.notifyStatus.textContent = "提醒已开启，刷新不会重复弹";
    startBackgroundAlertScan();
  }

  function maybeNotifyTopStories(reason) {
    if (!notificationsEnabled() || !notificationSupported() || Notification.permission !== "granted") {
      updateNotificationUi();
      return false;
    }

    const report = getDailyReport();
    if (!report) return false;
    return notifyTopStories(report, reason);
  }

  function notifyTopStories(report, reason) {
    const items = topAlertItems(report);
    if (!items.length) return false;

    const knownIds = readAlertItemIds();
    const freshItems = items.filter((item) => !knownIds.has(alertItemId(item)));
    rememberAlertItems(report);
    if (!freshItems.length) return false;

    const firstItem = freshItems[0];
    const title = freshItems.length === 1 ? `重点爆料：${firstItem.title}` : `发现 ${freshItems.length} 条新重点爆料`;
    const body = freshItems.length === 1 ? alertBody(firstItem) : alertListBody(freshItems);
    const notification = new Notification(title, {
      body: `${reason}\n${body}`,
      tag: "phone-radar-digest",
      renotify: true
    });

    notification.onclick = () => {
      window.focus();
      window.location.reload();
    };
    return true;
  }

  function topAlertItems(report) {
    const prioritySection = (report.sections || []).find((section) => section.id === "leaks");
    return (prioritySection?.items || []).slice(0, 8);
  }

  function alertItemId(item) {
    return String(item.id || item.url || item.title || "");
  }

  function readAlertItemIds() {
    const raw = localStorage.getItem(storageKeys.alertItemIds) || localStorage.getItem("phoneRadar.lastNotifiedDigest");
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      return new Set(raw.split("|").slice(1).filter(Boolean));
    }
  }

  function rememberAlertItems(report) {
    const items = report ? topAlertItems(report) : [];
    const ids = items.map(alertItemId).filter(Boolean);
    const knownIds = readAlertItemIds();
    ids.forEach((id) => knownIds.add(id));
    localStorage.setItem(storageKeys.alertItemIds, JSON.stringify(Array.from(knownIds).slice(-200)));
  }

  function alertBody(item) {
    const meta = [item.source, item.date].filter(Boolean).join(" · ");
    const line = item.impact || item.takeaway || "打开日报查看详情。";
    return `${meta}\n${line}`;
  }

  function alertListBody(items) {
    return items
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.title}（${item.source || "来源未知"}）`)
      .join("\n");
  }

  function startBackgroundAlertScan() {
    startBackgroundAutoUpdate();
  }

  function startBackgroundAutoUpdate() {
    if (!canPollStaticData()) return;
    if (window.phoneRadarBackgroundTimer) return;
    const interval = 15 * 60 * 1000;
    window.phoneRadarBackgroundTimer = window.setInterval(() => {
      if (canUseLocalUpdateApi()) {
        runBackgroundUpdate();
        return;
      }
      refreshFromDeployedFiles("后台自动检查发现新部署");
    }, interval);
  }

  async function runBackgroundUpdate() {
    if (!canUseLocalUpdateApi()) {
      await refreshFromDeployedFiles("后台自动检查发现新部署");
      return;
    }

    if (backgroundUpdateInProgress) return;
    backgroundUpdateInProgress = true;
    const startedAt = Date.now();

    try {
      setAutoUpdateStatus("正在进行 15 分钟自动更新，完成后会刷新页面内容。");
      if (elements.notifyStatus) elements.notifyStatus.textContent = "正在自动更新资讯";

      const response = await fetch("/api/update", { method: "POST" });
      const result = await response.json();
      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

      if (!result.ok) {
        setAutoUpdateStatus(`15 分钟自动更新失败，已等待 ${seconds} 秒，保留上次日报。`);
        if (elements.notifyStatus) elements.notifyStatus.textContent = "自动更新失败，保留上次日报";
        return;
      }

      const [autoData, report] = await Promise.all([fetchLatestAutoNews(), fetchLatestDailyReport()]);
      if (autoData) window.phoneRadarAuto = autoData;
      if (report) window.phoneRadarDaily = report;

      const refreshAt = result.updatedAt || report?.updatedAt || autoData?.updatedAt || new Date().toISOString();
      localStorage.setItem(storageKeys.lastRefreshAt, refreshAt);
      renderAll();
      updateLastRefreshTime(refreshAt);
      setAutoUpdateStatus(`已自动更新，用时 ${seconds} 秒。下次会在 15 分钟后继续检查。`);

      const didNotify = report && notificationsEnabled() && notificationSupported() && Notification.permission === "granted"
        ? notifyTopStories(report, "后台自动更新发现新增")
        : false;
      if (elements.notifyStatus) {
        elements.notifyStatus.textContent = didNotify ? "已推送新增重点爆料" : "已自动更新，暂无新增重点爆料";
      }
    } catch (error) {
      setAutoUpdateStatus("15 分钟自动更新失败，稍后会再试。");
      if (elements.notifyStatus) elements.notifyStatus.textContent = "自动更新失败，稍后再试";
    } finally {
      backgroundUpdateInProgress = false;
    }
  }

  async function scanForAlerts() {
    if (!notificationSupported() || !notificationsEnabled() || Notification.permission !== "granted") return;
    if (!canUseLocalUpdateApi()) {
      const didRefresh = await refreshFromDeployedFiles("后台扫描发现新部署");
      if (!didRefresh && elements.notifyStatus) elements.notifyStatus.textContent = "暂时没有新的已部署日报";
      return;
    }

    try {
      if (elements.notifyStatus) elements.notifyStatus.textContent = "正在后台扫描重点爆料";
      const response = await fetch("/api/update", { method: "POST" });
      const result = await response.json();
      if (!result.ok) {
        if (elements.notifyStatus) elements.notifyStatus.textContent = "后台扫描失败，保留上次日报";
        return;
      }

      const report = await fetchLatestDailyReport();
      const didNotify = report ? notifyTopStories(report, "后台扫描发现新增") : false;
      if (elements.notifyStatus) elements.notifyStatus.textContent = didNotify ? "已推送新增重点爆料" : "暂无新增重点爆料";
    } catch (error) {
      if (elements.notifyStatus) elements.notifyStatus.textContent = "后台扫描失败，稍后再试";
    }
  }

  async function refreshFromDeployedFiles(reason) {
    if (!canPollStaticData()) return false;

    try {
      const [autoData, report] = await Promise.all([fetchLatestAutoNews(), fetchLatestDailyReport()]);
      const nextUpdatedAt = latestDataUpdatedAt(autoData, report);
      const currentUpdatedAt = latestDataUpdatedAt();
      if (!nextUpdatedAt || (currentUpdatedAt && nextUpdatedAt <= currentUpdatedAt)) return false;

      if (autoData) window.phoneRadarAuto = autoData;
      if (report) window.phoneRadarDaily = report;
      localStorage.setItem(storageKeys.lastRefreshAt, nextUpdatedAt);
      renderAll();
      updateLastRefreshTime(nextUpdatedAt);

      const didNotify = report && notificationsEnabled() && notificationSupported() && Notification.permission === "granted"
        ? notifyTopStories(report, reason)
        : false;
      if (elements.notifyStatus) {
        elements.notifyStatus.textContent = didNotify ? "已提醒新部署的重点爆料" : "已加载最新部署的日报";
      }
      return true;
    } catch (error) {
      if (elements.notifyStatus) elements.notifyStatus.textContent = "检查已部署日报失败，稍后再试";
      return false;
    }
  }

  async function fetchLatestDailyReport() {
    const response = await fetch(`./generated-daily.js?t=${Date.now()}`);
    if (!response.ok) return null;
    const script = await response.text();
    const json = script.replace(/^window\.phoneRadarDaily\s*=\s*/, "").replace(/;\s*$/, "");
    return JSON.parse(json);
  }

  async function fetchLatestAutoNews() {
    const response = await fetch(`./generated-news.js?t=${Date.now()}`);
    if (!response.ok) return null;
    const script = await response.text();
    const json = script.replace(/^window\.phoneRadarAuto\s*=\s*/, "").replace(/;\s*$/, "");
    return JSON.parse(json);
  }

  function getCustomNews() {
    return readJson(storageKeys.news, []);
  }

  function getCustomDevices() {
    return readJson(storageKeys.devices, []);
  }

  function getItemState() {
    return readJson(storageKeys.itemState, {});
  }

  function allNews() {
    return [...getAutoNews(), ...getCustomNews()].map((item) => {
      const savedState = getItemState()[item.id] || {};
      return { ...item, ...savedState };
    });
  }

  function getAutoNews() {
    return Array.isArray(window.phoneRadarAuto?.news) ? window.phoneRadarAuto.news : [];
  }

  function getDailyReport() {
    return window.phoneRadarDaily && Array.isArray(window.phoneRadarDaily.sections) ? window.phoneRadarDaily : null;
  }

  function canUseSavedDailyReport() {
    return Boolean(
      getDailyReport() &&
        !state.query &&
        state.brand === "全部" &&
        state.type === "全部" &&
        state.trust === "全部" &&
        !state.favoriteOnly &&
        state.sourceGroup === "全部"
    );
  }

  function allDevices() {
    return [...(seed.devices || []), ...getCustomDevices()];
  }

  function fillSelect(select, values) {
    select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function matchesQuery(item) {
    if (!state.query) return true;
    const haystack = [
      item.title,
      item.source,
      item.brand,
      item.model,
      item.type,
      item.trust,
      item.summary,
      ...(item.tags || [])
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.query);
  }

  function filteredNews() {
    return allNews()
      .filter(matchesQuery)
      .filter((item) => state.brand === "全部" || item.brand === state.brand)
      .filter((item) => state.type === "全部" || item.type === state.type)
      .filter((item) => state.trust === "全部" || item.trust === state.trust)
      .filter((item) => state.sourceGroup === "全部" || sourceGroupFor(item) === state.sourceGroup)
      .filter((item) => !state.favoriteOnly || item.favorite)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function sourceGroupFor(itemOrSourceName) {
    const sourceName = typeof itemOrSourceName === "string" ? itemOrSourceName : itemOrSourceName.source;
    const brand = typeof itemOrSourceName === "string" ? "" : itemOrSourceName.brand;
    if (typeof itemOrSourceName !== "string" && isLeakPriority(itemOrSourceName)) return "爆料";
    const source = seed.sources.find((entry) => entry.name === sourceName || sourceName.includes(entry.name));
    if (!source && ["iPhone", "Samsung", "Pixel"].includes(brand)) return brand;
    if (!source && brand === "行业") return "行业";
    return source ? source.group : "其他";
  }

  function trustClass(trust) {
    if (trust === "官方确认") return "tag-green";
    if (trust === "监管/跑分") return "tag-blue";
    if (trust === "高可信爆料") return "tag-amber";
    if (trust === "媒体汇总") return "tag-gray";
    return "tag-red";
  }

  function renderDigest() {
    if (canUseSavedDailyReport()) {
      renderSavedDailyReport(getDailyReport());
      return;
    }

    const list = filteredNews()
      .map((item) => ({ item, score: scoreNews(item) }))
      .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
      .filter(uniqueDigestStory())
      .slice(0, 18);

    const visualList = list.filter(({ item }) => hasDigestImage(item));
    elements.digestList.innerHTML = renderDailySections(visualList);
    elements.digestGroups.innerHTML = renderDigestGroups(filteredNews());
    elements.emptyDigest.hidden = list.length > 0;
    elements.digestCount.textContent = list.length;
    const issueDate = getIssueDate(list.map(({ item }) => item));
    elements.digestUpdatedAt.textContent = issueDate;
    updateLastRefreshTime(window.phoneRadarAuto?.updatedAt);
    updateHeroStats(statsFromItems(list.map(({ item }) => item)));
    document.querySelector("#dailyIssue").textContent = `VOL.${issueDate.replaceAll("-", "").slice(2)}`;
    document.querySelector("#dailyIntro").textContent = makeDailyIntro(list.map(({ item }) => item));
  }

  function renderSavedDailyReport(report) {
    const sections = cleanDailySections(report.sections || []);
    const items = sections.flatMap((section) => section.items || []);
    const visualSections = sections
      .map((section) => ({
        ...section,
        items: section.items.filter(hasDigestImage)
      }))
      .filter((section) => section.items.length);
    const reportDate = reportDisplayDate(report);
    elements.digestList.innerHTML = visualSections.map(renderSavedDailySection).join("");
    elements.digestGroups.innerHTML = sections
      .map(
        (section) => `
          <div class="digest-group">
            <strong>${escapeHtml(section.title)}</strong>
            <span>${section.items.length} 条</span>
            <small>${escapeHtml(section.items[0]?.source || "已整理")}</small>
          </div>
        `
      )
      .join("");
    elements.emptyDigest.hidden = items.length > 0;
    elements.digestCount.textContent = report.stats?.total || items.length;
    elements.digestUpdatedAt.textContent = reportDate || "未更新";
    updateLastRefreshTime(report.updatedAt);
    updateHeroStats(statsFromItems(items, sections, report.stats));
    document.querySelector("#dailyIssue").textContent = reportDate ? `VOL.${reportDate.replaceAll("-", "").slice(2)}` : "VOL.000";
    document.querySelector("#dailyIntro").textContent = makeCleanReportIntro(items, sections);
  }

  function updateHeroStats(stats) {
    if (!elements.heroStats) return;
    const tiles = [
      ["重点", stats.total],
      ["爆料", stats.leaks],
      ["iPhone", stats.iphone],
      ["官方", stats.official]
    ];
    elements.heroStats.innerHTML = tiles
      .map(([label, value]) => `<span><strong>${Number(value || 0)}</strong>${label}</span>`)
      .join("");
  }

  function statsFromItems(items, sections = [], savedStats = {}) {
    return {
      total: savedStats.total || items.length,
      leaks: savedStats.leaks || sections.find((section) => section.id === "leaks")?.items.length || items.filter((item) => classifySection(item) === "leaks").length,
      iphone: savedStats.iphone || items.filter((item) => item.brand === "iPhone").length,
      official: savedStats.official || items.filter((item) => item.trust === "官方确认").length
    };
  }

  function updateLastRefreshTime(value) {
    if (!elements.lastRefreshTime) return;
    const refreshAt = value || localStorage.getItem(storageKeys.lastRefreshAt);
    elements.lastRefreshTime.textContent = refreshAt ? `上次刷新：${localDateTime(refreshAt)}` : "上次刷新：--";
  }

  function makeCleanReportIntro(items, sections) {
    if (!items.length) return "已更新，但这次没有筛到值得展示的手机资讯。";
    const leakCount = sections.find((section) => section.id === "leaks")?.items.length || 0;
    const iphoneCount = items.filter((item) => item.brand === "iPhone").length;
    const officialCount = items.filter((item) => item.trust === "官方确认").length;
    const specCount = sections.find((section) => section.id === "specs")?.items.length || 0;
    return `今日筛出 ${items.length} 条重点，其中 ${leakCount} 条是重点爆料，包含 ${iphoneCount} 条 iPhone 相关、${officialCount} 条官方确认、${specCount} 条参数线索。`;
  }

  function cleanDailySections(sections) {
    return sections
      .map((section) => ({
        ...section,
        items: (section.items || []).filter(isUsefulDisplayItem).map(cleanDailyItem)
      }))
      .filter((section) => section.items.length);
  }

  function isUsefulDisplayItem(item) {
    const text = `${item.title || ""} ${item.originalTitle || ""} ${item.detail || ""} ${item.takeaway || ""}`.toLowerCase();
    return !/(卫星互联网|卫星发射|发射.*卫星|长征.*火箭|天地网络融合|西昌|youtube music|google icon|icon redesign|gradient google|headphones?|earbuds?|buds\b|tws\b|\bpad\b|tablet|tab s\d|giztop|available on giztop|now available on|starting at \$)/i.test(text);
  }

  function cleanDailyItem(item) {
    const title = cleanDailyTitle(item);
    return {
      ...item,
      title,
      originalTitle: "",
      detail: cleanDailyText(item.detail || item.takeaway || item.summary || title, title),
      takeaway: cleanDailyText(item.takeaway || item.summary || title, title)
    };
  }

  function cleanDailyTitle(item) {
    const rawTitle = String(item.title || "");
    const original = String(item.originalTitle || rawTitle);
    if (!rawTitle.includes("英文资讯：") && /[\u3400-\u9fff]/.test(rawTitle)) return rawTitle;
    if (!rawTitle.includes("英文资讯：") && !/^[A-Za-z0-9]/.test(rawTitle)) return rawTitle;
    const comparisonTitle = localComparisonTitle(original);
    if (comparisonTitle) return `${comparisonTitle}：差异整理`;
    if (/fold|foldable|crease/i.test(original)) return `${item.brand || "手机"} 折叠屏相关消息`;
    if (/camera|photo|video|telephoto|aperture/i.test(original)) return `${item.brand || "手机"} 影像相关消息`;
    if (/battery|charging|magsafe|qi2/i.test(original)) return `${item.brand || "手机"} 电池 / 充电相关消息`;
    if (/display|screen|oled|brightness|refresh/i.test(original)) return `${item.brand || "手机"} 屏幕相关消息`;
    if (/chip|processor|modem|tensor|snapdragon|exynos|ram/i.test(original)) return `${item.brand || "手机"} 芯片 / 性能相关消息`;
    if (/price|pricing|cost|money/i.test(original)) return `${item.brand || "手机"} 价格 / 成本相关消息`;
    return `${item.brand || "手机"} 相关消息`;
  }

  function localComparisonTitle(title) {
    const match = String(title || "").match(/([A-Za-z0-9][A-Za-z0-9+.\-\s]*(?:\d|Pro|Ultra|Lite|Power|Fold|Flip|Max|Air))\s+vs\.?\s+([A-Za-z0-9][A-Za-z0-9+.\-\s]*(?:\d|Pro|Ultra|Lite|Power|Fold|Flip|Max|Air))/i);
    if (!match) return "";
    return `${match[1].trim()} 对比 ${match[2].trim()}`;
  }

  function cleanDailyText(value, title) {
    const text = String(value || title);
    if (!text.includes("英文资讯：") && !isMostlyEnglish(text)) return text;
    return `${title}。已转成中文摘要展示，详细内容可打开原文核对。`;
  }

  function isMostlyEnglish(value) {
    const letters = (String(value).match(/[A-Za-z]/g) || []).length;
    const cjk = (String(value).match(/[\u3400-\u9fff]/g) || []).length;
    return letters > 20 && letters > cjk * 1.5;
  }

  function reportDisplayDate(report) {
    if (report?.updatedAt) return localIsoDate(report.updatedAt);
    return report?.issueDate || "";
  }

  function localIsoDate(value = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function localDateTime(value = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const datePart = localIsoDate(date);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${datePart} ${hours}:${minutes}:${seconds}`;
  }

  function renderSavedDailySection(section) {
    const priorityClass = section.id === "leaks" ? " daily-section-priority" : "";
    return `
      <section class="daily-section${priorityClass}">
        <div class="daily-section-head">
          <span>${escapeHtml(section.id.toUpperCase())}</span>
          <div>
            <h3>${escapeHtml(section.title)}</h3>
            <p>${escapeHtml(section.hint)}</p>
          </div>
        </div>
        <div class="daily-items">
          ${section.items.map((item, index) => renderSavedDailyItem(item, index + 1)).join("")}
        </div>
      </section>
    `;
  }

  function renderSavedDailyItem(item, index) {
    const link = item.url
      ? `<a class="link-button" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">打开原文</a>`
      : "";

    return `
      <article class="digest-card ${item.image ? "has-media" : ""}">
        <div class="digest-card-grid">
          ${renderDigestMedia(item)}
          <div class="digest-card-main">
            <div class="news-card-top">
              <div>
                <p class="card-kicker">#${String(index).padStart(2, "0")} · ${escapeHtml(item.source)} · ${escapeHtml(item.date)}</p>
                <h3>${escapeHtml(item.title)}</h3>
              </div>
              <span class="digest-verdict">${escapeHtml(item.verdict || "扫一眼")}</span>
            </div>
            <p class="digest-line">${escapeHtml(item.detail || item.takeaway || item.summary)}</p>
            ${renderKeyPoints(item.keyPoints)}
            <p class="digest-confidence">${escapeHtml(item.confidence || "发布前线索，建议等更多来源确认。")}</p>
            <div class="meta-row">
              <span>${escapeHtml(item.brand)}</span>
              <span>${escapeHtml(item.type)}</span>
              <span>${escapeHtml(item.trust)}</span>
            </div>
            <div class="card-actions">${link}</div>
          </div>
        </div>
      </article>
    `;
  }

  function renderDigestMedia(item) {
    if (!item.image) return "";
    return `
      <a class="digest-media" href="${escapeHtml(item.url || item.image)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.closest('.digest-card').classList.remove('has-media'); this.closest('.digest-media').remove()" />
      </a>
    `;
  }

  function renderKeyPoints(points) {
    if (!Array.isArray(points) || !points.length) return "";
    return `
      <div class="digest-points">
        ${points.map((point) => `<span>${escapeHtml(point)}</span>`).join("")}
      </div>
    `;
  }

  function hasDigestImage(item) {
    return Boolean(item?.image);
  }

  function collectTextBriefs() {
    if (canUseSavedDailyReport()) {
      return cleanDailySections(getDailyReport().sections || [])
        .flatMap((section) =>
          section.items
            .filter((item) => !hasDigestImage(item))
            .map((item) => ({
              title: item.title,
              source: item.source,
              date: item.date,
              summary: item.detail || item.takeaway || item.summary,
              brand: item.brand,
              type: item.type,
              trust: item.trust,
              url: item.url,
              sectionTitle: section.title
            }))
        )
        .slice(0, 10);
    }

    return filteredNews()
      .map((item) => ({ item, score: scoreNews(item) }))
      .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
      .filter(uniqueDigestStory())
      .slice(0, 18)
      .filter(({ item }) => !hasDigestImage(item))
      .map(({ item }) => ({
        title: item.title,
        source: item.source,
        date: item.date,
        summary: makePlainSummary(item),
        brand: item.brand,
        type: item.type,
        trust: item.trust,
        url: item.url,
        sectionTitle: classifySection(item).toUpperCase()
      }))
      .slice(0, 10);
  }

  function uniqueDigestStory() {
    const seen = new Set();
    return ({ item }) => {
      const key = String(item.title || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
  }

  function renderDailySections(scoredItems) {
    const sections = [
      { id: "leaks", title: "重点爆料", hint: "机模、配色、影像、屏幕、电池和芯片线索先看。" },
      { id: "iphone", title: "iPhone 重点", hint: "不是硬件爆料，但和 iPhone 体验或路线有关。" },
      { id: "launch", title: "新机与官方发布", hint: "能直接更新到参数库。" },
      { id: "specs", title: "参数、跑分、认证", hint: "适合验证芯片、屏幕、影像和电池。" },
      { id: "review", title: "评测与体验", hint: "买前再细看，平时扫一眼即可。" },
      { id: "market", title: "行业趋势", hint: "看方向，不急着当购买依据。" }
    ];

    return sections
      .map((section) => {
        const items = scoredItems.filter(({ item }) => classifySection(item) === section.id);
        if (!items.length) return "";
        const priorityClass = section.id === "leaks" ? " daily-section-priority" : "";
        return `
          <section class="daily-section${priorityClass}">
            <div class="daily-section-head">
              <span>${escapeHtml(section.id.toUpperCase())}</span>
              <div>
                <h3>${escapeHtml(section.title)}</h3>
                <p>${escapeHtml(section.hint)}</p>
              </div>
            </div>
            <div class="daily-items">
              ${items.map(({ item, score }, index) => renderDigestItem(item, score, index + 1)).join("")}
            </div>
          </section>
        `;
      })
      .join("");
  }

  function renderDigestItem(item, score, index) {
    const verdict = score >= 8 ? "先看" : score >= 5 ? "扫一眼" : "可略过";
    const link = item.url
      ? `<a class="link-button" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">打开原文</a>`
      : "";

    return `
      <article class="digest-card ${item.image ? "has-media" : ""}">
        <div class="digest-card-grid">
          ${renderDigestMedia(item)}
          <div class="digest-card-main">
            <div class="news-card-top">
              <div>
                <p class="card-kicker">#${String(index).padStart(2, "0")} · ${escapeHtml(item.source)} · ${escapeHtml(item.date)}</p>
                <h3>${escapeHtml(item.title)}</h3>
              </div>
              <span class="digest-verdict">${verdict}</span>
            </div>
            <p class="digest-line">${escapeHtml(makePlainSummary(item))}</p>
            ${renderKeyPoints(makeCardKeyPoints(item))}
            <p class="digest-confidence">${escapeHtml(makeCardConfidence(item))}</p>
            <div class="meta-row">
              <span>${escapeHtml(item.brand)}</span>
              <span>${escapeHtml(item.type)}</span>
              <span>${escapeHtml(item.trust)}</span>
            </div>
            <div class="card-actions">${link}</div>
          </div>
        </div>
      </article>
    `;
  }

  function renderDigestGroups(items) {
    const sections = [
      ["leaks", "爆料"],
      ["iphone", "iPhone"],
      ["launch", "发布"],
      ["specs", "参数"],
      ["review", "评测"],
      ["market", "趋势"]
    ];
    const groups = sections
      .map(([id, label]) => {
        const sectionItems = items.filter((item) => classifySection(item) === id);
        if (!sectionItems.length) return "";
        const topItem = sectionItems.sort((a, b) => scoreNews(b) - scoreNews(a))[0];
        return `
          <div class="digest-group">
            <strong>${escapeHtml(label)}</strong>
            <span>${sectionItems.length} 条</span>
            <small>${escapeHtml(topItem.source)}</small>
          </div>
        `;
      })
      .join("");

    return groups || `<p class="empty-state">当前筛选下没有日报栏目。</p>`;
  }

  function classifySection(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    if (isLeakPriority(item)) return "leaks";
    if (item.brand === "iPhone") return "iphone";
    if (item.trust === "官方确认" || /(launch|release|发布|上市|official|newsroom)/i.test(text)) return "launch";
    if (item.type === "参数" || /(benchmark|geekbench|fcc|tenaa|认证|跑分|芯片|屏幕|电池|影像|相机|参数)/i.test(text)) {
      return "specs";
    }
    if (item.type === "评测" || /(review|hands-on|teardown|ifixit|dxomark|评测|体验|拆解)/i.test(text)) return "review";
    return "market";
  }

  function hasDailyNoiseSignal(item) {
    const title = String(item.title || "").toLowerCase();
    return /(\bai\b|apple intelligence|audio eraser|siri|gemini|\bios\s?\d|\bandroid\s?\d|one ui|public beta|developer beta|messages app|rcs|spotify|airpods|google cast|contacts|phone app|settings ui|call features?|halide|pro camera app|\bapp\b|care\+|summer holiday companion|mlb|baseball|the show|dex|computer|repair|support|returned their phone|worse than dead|anti-snatching|stolen device|国补|优惠|直降|低至|免息|京东|天猫|淘宝|618|促销|领券|到手|秒杀|anker|安克|maggo|充电器|无线充|磁吸|充电头|快充头|充电宝|移动电源|数据线|手表|apple watch|耳机|支架|钢化膜|保护壳|小组件|app\s*(获|更新|上架|适配)|应用市场|driver'?s license|digital id|wallet|macbook)/i.test(title);
  }

  function hasStrongNonPhoneSignal(item) {
    const title = String(item.title || "");
    return /(\bai\b|apple intelligence|audio eraser|siri|gemini|\bios\s?\d|\bandroid\s?\d|one ui|public beta|developer beta|messages app|rcs|spotify|airpods|google cast|contacts|phone app|settings ui|call features?|halide|pro camera app|\bapp\b|care\+|summer holiday companion|driver'?s license|digital id|wallet|anti-snatching|stolen device|mlb|baseball|the show|watch|galaxy watch|手表|apple watch|dex|computer|小组件|app\s*(获|更新|上架|适配)|应用市场|微信鸿蒙版|平板|ipad|macbook|mac\b|电脑|笔记本|汽车|蔚来|特斯拉|问界|启境|gt7|repair|support|returned their phone|worse than dead|国补|优惠|直降|低至|免息|领券|到手|京东|天猫|淘宝|anker|安克|maggo|充电器|无线充|磁吸|充电头|快充头|充电宝|移动电源|数据线|耳机|支架|钢化膜|保护壳|空调|家电|音乐键盘|钠离子|锂空气|宁德时代|世界杯|观赛)/i.test(title);
  }

  function isLeakPriority(item) {
    if (hasStrongNonPhoneSignal(item) || hasDailyNoiseSignal(item)) return false;
    const text = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`.toLowerCase();
    return /(first look|dummy model|dummy unit|color options|case leak|render|renders|rumou?r|leak|exclusive|消息称|爆料|开案|机模|配色|渲染|外观|尺寸|相机|影像|长焦|潜望|电池|续航|充电|屏幕|直屏|曲屏|芯片|处理器|跑分|认证|散热|发热|成本|升级|量产|供应链|数码闲聊站|digital chat station|ming-chi kuo|kuo|mark gurman|onleaks|ice universe|evleaks)/i.test(text);
  }

  function getIssueDate(items) {
    const firstDate = items.map((item) => item.date).sort((a, b) => b.localeCompare(a))[0];
    return firstDate || new Date().toISOString().slice(0, 10);
  }

  function makeDailyIntro(items) {
    if (!items.length) return "更新资讯后，这里会把值得看的内容整理成日报。";
    const leakCount = items.filter((item) => classifySection(item) === "leaks").length;
    const iphoneCount = items.filter((item) => item.brand === "iPhone").length;
    const officialCount = items.filter((item) => item.trust === "官方确认").length;
    const specCount = items.filter((item) => classifySection(item) === "specs").length;
    return `今日筛出 ${items.length} 条重点，其中 ${leakCount} 条是重点爆料，包含 ${iphoneCount} 条 iPhone 相关、${officialCount} 条官方确认、${specCount} 条参数线索。`;
  }

  function scoreNews(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    let score = 0;

    if (item.brand === "iPhone") score += 4;
    if (["Samsung", "Pixel"].includes(item.brand)) score += 2;
    if (item.trust === "官方确认") score += 4;
    if (item.trust === "高可信爆料") score += 3;
    if (item.trust === "监管/跑分") score += 2;
    if (item.type === "参数") score += 2;
    if (item.type === "市场报告") score += 1;
    if (isLeakPriority(item)) score += 7;
    if (isLeakPriority(item) && item.brand === "iPhone") score += 6;
    if (/(iphone\s?\d+.*(dummy|color|camera)|机模|配色|相机升级|color options|dummy models)/i.test(text)) score += 3;
    if (/(iphone|ios|a-series|apple intelligence|galaxy|pixel|tensor|camera|battery|display|price|launch|release|rumor|leak|芯片|相机|影像|电池|屏幕|价格|发布|爆料|认证|跑分)/i.test(text)) {
      score += 2;
    }
    if (hasDailyNoiseSignal(item)) score -= 6;

    return score;
  }

  function makePlainSummary(item) {
    const summary = String(item.summary || "").trim();
    if (summary && summary !== item.title) return summary;
    return "这条资讯目前主要看标题和来源，建议只在你关心该品牌或机型时再点开。";
  }

  function makeCardKeyPoints(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    const points = [];
    if (/(first look|dummy|color|配色|机模|外观|render|design|渲染|尺寸)/i.test(text)) points.push("外观 / 配色 / 尺寸");
    if (/(camera|photo|video|telephoto|aperture|相机|影像|长焦|潜望|光圈)/i.test(text)) points.push("影像硬件");
    if (/(display|screen|oled|brightness|refresh|屏幕|直屏|曲屏|折叠屏|折痕)/i.test(text)) points.push("屏幕形态");
    if (/(battery|charging|magsafe|qi2|电池|续航|充电|万级大电池)/i.test(text)) points.push("电池 / 充电");
    if (/(chip|processor|modem|a-series|snapdragon|tensor|exynos|芯片|处理器|跑分|认证)/i.test(text)) points.push("芯片 / 性能");
    if (/(price|pricing|cost|价格|售价|成本)/i.test(text)) points.push("成本 / 价格");
    if (!points.length) points.push(item.type || "手机资讯");
    return [...new Set(points)].slice(0, 4);
  }

  function makeCardConfidence(item) {
    if (item.trust === "官方确认") return "官方内容，可直接作为已确认信息记录。";
    if (item.trust === "监管/跑分") return "比普通爆料更接近硬件事实，但型号对应关系仍要核对。";
    if (item.trust === "高可信爆料") return "可信度较高，但仍属于发布前线索。";
    return "媒体汇总或普通传闻，适合先收藏观察，不当作最终参数。";
  }

  function explainImportance(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    if (isLeakPriority(item)) return "这是提前爆料，能决定你要不要继续等某款机型，但还要交叉验证。";
    if (item.trust === "官方确认") return "官方确认，能直接作为事实记录。";
    if (item.trust === "高可信爆料") return "可能提前透露发布时间、配置或产品方向。";
    if (item.trust === "监管/跑分") return "适合验证芯片、内存、型号或频段线索。";
    if (item.type === "市场报告") return "适合看品牌走势，不急着当购买依据。";
    if (/(camera|影像|相机|battery|电池|display|屏幕|price|价格|chip|芯片)/i.test(text)) {
      return "涉及配置或价格，可能影响买不买、等不等。";
    }
    return "先当普通线索，等更多来源验证。";
  }

  function nextAction(item) {
    if (isLeakPriority(item)) return "先收藏到重点爆料；等第二个可靠来源、认证或发布会再确认。";
    if (item.trust === "官方确认" || item.type === "参数") return "把关键信息补进参数库。";
    if (item.brand === "iPhone" && item.type === "爆料") return "收藏，等第二个可靠来源交叉验证。";
    if (item.type === "评测") return "买前再打开看体验和缺点。";
    return "不用急着打开，先扫标题即可。";
  }

  function renderFeed() {
    const list = filteredNews();
    const all = allNews();
    elements.newsList.innerHTML = list.map(renderNewsItem).join("");
    elements.emptyFeed.hidden = list.length > 0;
    elements.totalCount.textContent = list.length;
    elements.officialCount.textContent = all.filter((item) => item.trust === "官方确认").length;
    elements.savedCount.textContent = all.filter((item) => item.favorite).length;
  }

  function renderNewsItem(item) {
    const link = item.url
      ? `<a class="link-button" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">打开来源</a>`
      : "";
    const readLabel = item.read ? "已读" : "标为已读";
    const favoriteLabel = item.favorite ? "已收藏" : "收藏";
    const displayTitle = feedDisplayTitle(item);
    const displaySummary = feedDisplaySummary(item, displayTitle);
    return `
      <article class="news-card ${item.read ? "is-read" : ""}">
        <div class="news-card-top">
          <div>
            <p class="card-kicker">${escapeHtml(item.source)} · ${escapeHtml(item.date)}</p>
            <h3>${escapeHtml(displayTitle)}</h3>
          </div>
          <span class="trust-tag ${trustClass(item.trust)}">${escapeHtml(item.trust)}</span>
        </div>
        <p>${escapeHtml(displaySummary)}</p>
        <div class="meta-row">
          <span>${escapeHtml(item.brand)}</span>
          <span>${escapeHtml(item.model)}</span>
          <span>${escapeHtml(item.type)}</span>
        </div>
        <div class="card-actions">
          <button type="button" data-action="favorite" data-id="${escapeHtml(item.id)}">${favoriteLabel}</button>
          <button type="button" data-action="read" data-id="${escapeHtml(item.id)}">${readLabel}</button>
          ${link}
        </div>
      </article>
    `;
  }

  function feedDisplayTitle(item) {
    const originalTitle = String(item.title || "");
    const comparisonTitle = localComparisonTitle(originalTitle);
    if (comparisonTitle && isMostlyEnglish(comparisonTitle)) return `${item.brand || "手机"} 机型对比：差异整理`;
    const normalizedTitle = originalTitle.replace(/^[^A-Za-z0-9\u3400-\u9fff]+/, "");
    const title = cleanDailyTitle({ ...item, title: normalizedTitle || originalTitle, originalTitle });
    return isMostlyEnglish(title) ? `${item.brand || "手机"} 相关消息` : title;
  }

  function feedDisplaySummary(item, title) {
    const summary = String(item.summary || "").trim();
    if (summary && !isMostlyEnglish(summary)) return summary;
    return `${title}。${explainImportance(item)}`;
  }

  function renderDevices() {
    const devices = allDevices()
      .filter((device) => matchesDeviceQuery(device))
      .filter((device) => state.brand === "全部" || device.brand === state.brand)
      .filter((device) => state.deviceStatus === "全部" || device.status === state.deviceStatus);

    if (!devices.length) {
      elements.deviceTable.innerHTML = `<p class="empty-state">没有匹配的机型参数。</p>`;
      renderCompareShelf(devices);
      return;
    }

    const rows = ["外观", "处理器", "屏幕", "影像", "续航", "机身", "其他", "价格"];
    elements.deviceTable.innerHTML = `
      <div class="spec-grid" style="--device-count: ${devices.length}">
        <div class="spec-row spec-header-row">
          <div class="spec-label">型号</div>
          ${devices.map(renderSpecHeader).join("")}
        </div>
        ${rows
          .map(
            (label) => `
            <div class="spec-row">
              <div class="spec-label">${escapeHtml(label)}</div>
              ${devices.map((device) => `<div class="spec-cell">${formatSpecValue(specFor(device, label))}</div>`).join("")}
            </div>
          `
          )
          .join("")}
      </div>
    `;

    renderCompareShelf(devices);
  }

  function renderSpecHeader(device) {
    const source = device.sourceUrl
      ? `<a class="spec-source" href="${escapeHtml(device.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(device.source || "查看官网")}</a>`
      : `<span>${escapeHtml(device.source || "来源待补充")}</span>`;

    return `
      <div class="spec-device">
        <strong>${escapeHtml(device.model)}</strong>
        <span>${escapeHtml(device.brand)} · ${escapeHtml(device.release || "待补充")}</span>
        <span class="trust-tag ${device.status === "官方参数" ? "tag-green" : "tag-amber"}">${escapeHtml(device.status)}</span>
        ${source}
      </div>
    `;
  }

  function specFor(device, label) {
    if (device.specs?.[label]) return device.specs[label];
    if (label === "处理器") return device.chip;
    if (label === "屏幕") return device.display;
    if (label === "影像") return device.camera;
    if (label === "续航") return device.battery;
    if (label === "价格") return device.price;
    if (label === "外观") return [device.brand, device.release].filter(Boolean).join("；") || "待补充";
    if (label === "机身") return device.body || "待补充";
    if (label === "其他") return device.extra || device.source || "待补充";
    return "待补充";
  }

  function formatSpecValue(value) {
    const text = String(value || "待补充").trim();
    const parts = text.split(/[；;]\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return escapeHtml(text);
    return parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("");
  }

  function matchesDeviceQuery(device) {
    if (!state.query) return true;
    const haystack = deviceSearchText(device).toLowerCase();
    return haystack.includes(state.query);
  }

  function deviceSearchText(device) {
    return [
      ...Object.values(device).filter((value) => typeof value !== "object"),
      ...Object.values(device.specs || {})
    ].join(" ");
  }

  function renderCompareShelf(devices = allDevices()) {
    const officialCount = devices.filter((device) => device.status === "官方参数").length;
    elements.compareShelf.innerHTML = `
      <div class="spec-note">
        <strong>只把已确认参数放进这里</strong>
        <span>当前显示 ${devices.length} 款机型，其中 ${officialCount} 款来自官网参数；发布前爆料仍放在“重点爆料”，不混进官方参数库。</span>
      </div>
    `;
  }

  function renderSources() {
    const query = state.query;
    const sources = seed.sources.filter((source) => {
      const haystack = Object.values(source).join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });

    elements.sourceGrid.innerHTML = sources
      .map(
        (source) => `
        <article class="source-card">
          <div>
            <p class="card-kicker">${escapeHtml(source.group)} · ${escapeHtml(source.kind)}</p>
            <h3>${escapeHtml(source.name)}</h3>
          </div>
          <p>${escapeHtml(source.focus)}</p>
          <div class="meta-row">
            <span>${escapeHtml(source.authority)}</span>
            <span>${escapeHtml(source.cadence)}</span>
          </div>
          <a class="link-button" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">打开来源</a>
        </article>
      `
      )
      .join("");
  }

  function renderFocus() {
    const heading = elements.focusList?.closest(".insight-block")?.querySelector("h2");
    if (heading) heading.textContent = "\u6587\u5b57\u5feb\u8baf";
    const briefs = collectTextBriefs();
    elements.focusList.innerHTML = briefs.length
      ? briefs.map(renderTextBrief).join("")
      : `<p class="empty-state">\u5f53\u524d\u7b5b\u9009\u4e0b\u6ca1\u6709\u65e0\u56fe\u6587\u5b57\u5feb\u8baf\u3002</p>`;
  }

  function renderSourceShortcuts() {
    const groups = ["全部", "爆料", "iPhone", "Samsung", "Pixel", "行业", "评测"];
    elements.sourceShortcuts.innerHTML = groups
      .map((group) => `<button type="button" class="${state.sourceGroup === group ? "is-active" : ""}" data-source-group="${group}">${group}</button>`)
      .join("");
  }

  function renderTextBrief(item, index) {
    const link = item.url
      ? `<a class="text-brief-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">\u6253\u5f00\u539f\u6587</a>`
      : "";
    return `
      <article class="text-brief-card">
        <p class="card-kicker">#${String(index + 1).padStart(2, "0")} · ${escapeHtml(item.source || "\u672a\u77e5\u6765\u6e90")} · ${escapeHtml(item.date || "")}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary || item.title)}</p>
        <div class="meta-row">
          <span>${escapeHtml(item.brand || "\u672a\u5206\u7c7b")}</span>
          <span>${escapeHtml(item.type || item.sectionTitle || "\u6587\u5b57")}</span>
          ${item.trust ? `<span>${escapeHtml(item.trust)}</span>` : ""}
        </div>
        ${link}
      </article>
    `;
  }

  function renderAll() {
    renderSourceShortcuts();
    renderDigest();
    renderFeed();
    renderDevices();
    renderSources();
    renderFocus();
  }

  function setView(nextView) {
    state.view = nextView;
    document.body.dataset.view = nextView;
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === nextView);
    });
    document.querySelectorAll(".app-view").forEach((view) => {
      view.classList.toggle("is-visible", view.id === `${nextView}View`);
    });
  }

  function updateItemState(id, patch) {
    const itemState = getItemState();
    itemState[id] = { ...(itemState[id] || {}), ...patch };
    writeJson(storageKeys.itemState, itemState);
  }

  function handleNewsAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = allNews().find((entry) => entry.id === button.dataset.id);
    if (!item) return;

    if (button.dataset.action === "favorite") {
      updateItemState(item.id, { favorite: !item.favorite });
    }
    if (button.dataset.action === "read") {
      updateItemState(item.id, { read: true });
    }
    renderAll();
  }

  function handleAddNews(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const newItem = {
      id: `custom-news-${Date.now()}`,
      title: data.title,
      source: data.source,
      brand: data.brand,
      model: data.brand === "行业" ? "智能手机市场" : `${data.brand} 相关机型`,
      type: data.type,
      trust: data.trust,
      date: new Date().toISOString().slice(0, 10),
      url: data.url,
      summary: data.summary || "手动添加的资讯，后续可补充摘要和验证结论。",
      tags: [data.brand, data.type]
    };
    writeJson(storageKeys.news, [newItem, ...getCustomNews()]);
    event.currentTarget.reset();
    renderAll();
    setView("feed");
  }

  function handleAddDevice(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const newDevice = {
      id: `custom-device-${Date.now()}`,
      brand: data.brand,
      model: data.model,
      status: data.status,
      release: data.status === "官方参数" ? "已发布" : "待确认",
      chip: data.chip || "待补充",
      display: data.display || "待补充",
      camera: data.camera || "待补充",
      battery: data.battery || "待补充",
      price: "待补充",
      source: data.source || "手动记录"
    };
    writeJson(storageKeys.devices, [newDevice, ...getCustomDevices()]);
    event.currentTarget.reset();
    renderAll();
    setView("devices");
  }

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      customNews: getCustomNews(),
      customDevices: getCustomDevices(),
      itemState: getItemState()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `phone-radar-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function wireEvents() {
    elements.searchInput.addEventListener("input", (event) => {
      state.query = normalize(event.target.value);
      renderAll();
    });
    elements.brandFilter.addEventListener("change", (event) => {
      state.brand = event.target.value;
      renderAll();
    });
    elements.typeFilter.addEventListener("change", (event) => {
      state.type = event.target.value;
      renderAll();
    });
    elements.trustFilter.addEventListener("change", (event) => {
      state.trust = event.target.value;
      renderAll();
    });
    elements.favoriteOnly.addEventListener("change", (event) => {
      state.favoriteOnly = event.target.checked;
      renderAll();
    });
    elements.deviceStatusFilter.addEventListener("change", (event) => {
      state.deviceStatus = event.target.value;
      renderDevices();
    });
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });
    elements.sourceShortcuts.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-source-group]");
      if (!button) return;
      state.sourceGroup = button.dataset.sourceGroup;
      renderAll();
    });
    elements.newsList.addEventListener("click", handleNewsAction);
    elements.deviceTable.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-compare-id]");
      if (!checkbox) return;
      if (checkbox.checked) {
        state.compareIds.add(checkbox.dataset.compareId);
      } else {
        state.compareIds.delete(checkbox.dataset.compareId);
      }
      renderCompareShelf();
    });
    elements.addNewsForm.addEventListener("submit", handleAddNews);
    elements.addDeviceForm.addEventListener("submit", handleAddDevice);
    elements.exportButton.addEventListener("click", exportData);
    elements.notifyButton?.addEventListener("click", requestNotifications);
  }

  function initForms() {
    fillSelect(elements.brandFilter, seed.brands);
    fillSelect(elements.typeFilter, seed.types);
    fillSelect(elements.trustFilter, seed.trusts);
    fillSelect(elements.addNewsForm.elements.brand, seed.brands.filter((brand) => brand !== "全部"));
    fillSelect(elements.addNewsForm.elements.type, seed.types.filter((type) => type !== "全部"));
    fillSelect(elements.addNewsForm.elements.trust, seed.trusts.filter((trust) => trust !== "全部"));
    fillSelect(elements.addDeviceForm.elements.brand, seed.brands.filter((brand) => brand !== "全部" && brand !== "行业"));
  }

  initForms();
  wireEvents();
  renderAll();
  updateNotificationUi();
  startBackgroundAutoUpdate();
  maybeAutoUpdateFromLocalServer();
})();
