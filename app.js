"use strict";

(() => {
  const STORAGE_KEY = "trip-hongkong-hub-v1";
  const START_DATE = "2026-08-15";
  const END_DATE = "2026-08-19";
  const TIMEZONE = "Asia/Hong_Kong";
  const MAP_LIST_URL = "https://maps.app.goo.gl/c4aqxDU5yhHmMNfu5?g_st=ac";
  const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=22.3193&longitude=114.1694&timezone=Asia%2FHong_Kong&forecast_days=16&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset,wind_speed_10m_max";

  const TRIP_DAYS = [
    { date: "2026-08-15", day: 1, number: "15", weekday: "토", weekdayLong: "SATURDAY" },
    { date: "2026-08-16", day: 2, number: "16", weekday: "일", weekdayLong: "SUNDAY" },
    { date: "2026-08-17", day: 3, number: "17", weekday: "월", weekdayLong: "MONDAY" },
    { date: "2026-08-18", day: 4, number: "18", weekday: "화", weekdayLong: "TUESDAY" },
    { date: "2026-08-19", day: 5, number: "19", weekday: "수", weekdayLong: "WEDNESDAY" }
  ];

  const PLACE_SEEDS = [
    { name: "스타페리 터미널", tag: "HARBOUR", description: "침사추이에서 배로 건너기", query: "Star Ferry Pier Tsim Sha Tsui Hong Kong" },
    { name: "스타의 거리", tag: "NIGHT VIEW", description: "빅토리아항 야경 산책", query: "Avenue of Stars Hong Kong" },
    { name: "템플스트리트 야시장", tag: "NIGHT MARKET", description: "야시장과 늦은 저녁", query: "Temple Street Night Market Hong Kong" },
    { name: "구룡채성 공원", tag: "HISTORY", description: "남문 유적과 전시 보기", query: "Kowloon Walled City Park Hong Kong" },
    { name: "Man Mo Temple", tag: "TEMPLE", description: "셩완의 오래된 사원", query: "Man Mo Temple Hong Kong" },
    { name: "미드레벨 에스컬레이터", tag: "WALK", description: "소호와 골목 탐방", query: "Central Mid-Levels Escalator Hong Kong" },
    { name: "타이퀀", tag: "HERITAGE", description: "옛 경찰서·감옥 문화공간", query: "Tai Kwun Hong Kong" },
    { name: "Apliu Street", tag: "LOCAL", description: "전자상가와 로컬 거리", query: "Apliu Street Hong Kong" }
  ];

  const DEFAULT_STATE = {
    schemaVersion: 1,
    checklist: [
      { id: "before-flight", phase: "before", category: "예약·서류", text: "항공편 예약과 수하물 규정 확인", done: false },
      { id: "before-hotel", phase: "before", category: "예약·서류", text: "숙소 예약·체크인 정보 확인", done: false },
      { id: "before-passport", phase: "before", category: "예약·서류", text: "여권 유효기간과 영문 이름 확인", done: false },
      { id: "before-insurance", phase: "before", category: "예약·서류", text: "여행자 보험 가입", done: false },
      { id: "before-esim", phase: "before", category: "통신·결제", text: "eSIM 또는 로밍 준비", done: false },
      { id: "before-payment", phase: "before", category: "통신·결제", text: "해외 결제 카드·현금·옥토퍼스 계획", done: false },
      { id: "before-map", phase: "before", category: "통신·결제", text: "Google 지도에 장소 모으기", done: true },
      { id: "before-hotel-map", phase: "before", category: "통신·결제", text: "Royal Plaza Hotel 지도 저장", done: true },
      { id: "before-adapter", phase: "before", category: "가방 속", text: "BF형 어댑터와 충전기", done: false },
      { id: "before-rain", phase: "before", category: "가방 속", text: "작은 우산과 가벼운 우비", done: false },
      { id: "before-medicine", phase: "before", category: "가방 속", text: "상비약과 개인 약", done: false },
      { id: "before-shoes", phase: "before", category: "가방 속", text: "많이 걸어도 편한 신발", done: false },
      { id: "after-expense", phase: "after", category: "여행 마무리", text: "공동 지출 정산하기", done: false },
      { id: "after-photo", phase: "after", category: "여행 마무리", text: "사진 한 폴더에 모으기", done: false },
      { id: "after-favorite", phase: "after", category: "여행 마무리", text: "베스트 장소와 음식 기록하기", done: false },
      { id: "after-backup", phase: "after", category: "여행 마무리", text: "여행 데이터 JSON으로 백업하기", done: false }
    ],
    itinerary: [
      { id: "seed-arrival", date: "2026-08-15", time: "", title: "홍콩 도착", place: "", note: "항공편이 정해지면 도착 시각과 이동 방법을 채워주세요." },
      { id: "seed-departure", date: "2026-08-19", time: "", title: "체크아웃 · 귀국", place: "Royal Plaza Hotel", note: "항공편이 정해지면 공항 출발 시각을 역산해요." }
    ],
    expenses: [],
    notes: { bestMoment: "", bestFood: "", nextTime: "" },
    weatherCache: null,
    ui: { activePhase: null, activeDate: START_DATE, hideCompleted: false }
  };

  const VALID_PHASES = new Set(["before", "during", "after"]);
  const VALID_DATES = new Set(TRIP_DAYS.map((day) => day.date));
  const BEFORE_CATEGORY_ORDER = ["예약·서류", "통신·결제", "가방 속"];
  const AFTER_CATEGORY_ORDER = ["여행 마무리"];

  let state = loadState();
  let toastTimer = 0;
  let noteSaveTimer = 0;
  let weatherRequest = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function cloneDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function makeId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function sanitizeChecklist(items, fallback) {
    if (!Array.isArray(items)) return fallback;
    return items.slice(0, 200).map((item) => {
      if (!item || typeof item !== "object") return null;
      const phase = VALID_PHASES.has(item.phase) ? item.phase : "before";
      const text = cleanText(item.text, 100);
      if (!text) return null;
      return {
        id: cleanText(item.id, 100) || makeId("check"),
        phase,
        category: cleanText(item.category, 40) || (phase === "after" ? "여행 마무리" : "예약·서류"),
        text,
        done: item.done === true
      };
    }).filter(Boolean);
  }

  function sanitizeItinerary(items, fallback) {
    if (!Array.isArray(items)) return fallback;
    return items.slice(0, 300).map((item) => {
      if (!item || typeof item !== "object") return null;
      const date = VALID_DATES.has(item.date) ? item.date : START_DATE;
      const title = cleanText(item.title, 100);
      if (!title) return null;
      return {
        id: cleanText(item.id, 100) || makeId("plan"),
        date,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) ? item.time : "",
        title,
        place: cleanText(item.place, 120),
        note: cleanText(item.note, 220)
      };
    }).filter(Boolean);
  }

  function sanitizeExpenses(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 500).map((item) => {
      if (!item || typeof item !== "object") return null;
      const description = cleanText(item.description, 100);
      const amount = Number(item.amount);
      if (!description || !Number.isFinite(amount) || amount <= 0) return null;
      return {
        id: cleanText(item.id, 100) || makeId("expense"),
        date: VALID_DATES.has(item.date) ? item.date : START_DATE,
        category: cleanText(item.category, 30) || "기타",
        description,
        amount: Math.round(amount * 100) / 100
      };
    }).filter(Boolean);
  }

  function sanitizeState(input) {
    const base = cloneDefault();
    if (!input || typeof input !== "object") {
      base.ui.activePhase = getAutoPhase();
      return base;
    }

    const notes = input.notes && typeof input.notes === "object" ? input.notes : {};
    const ui = input.ui && typeof input.ui === "object" ? input.ui : {};
    const cached = input.weatherCache && typeof input.weatherCache === "object" ? input.weatherCache : null;

    return {
      schemaVersion: 1,
      checklist: sanitizeChecklist(input.checklist, base.checklist),
      itinerary: sanitizeItinerary(input.itinerary, base.itinerary),
      expenses: sanitizeExpenses(input.expenses),
      notes: {
        bestMoment: cleanText(notes.bestMoment, 500),
        bestFood: cleanText(notes.bestFood, 500),
        nextTime: cleanText(notes.nextTime, 500)
      },
      weatherCache: cached && typeof cached.fetchedAt === "string" && cached.data && typeof cached.data === "object"
        ? { fetchedAt: cached.fetchedAt, data: cached.data }
        : null,
      ui: {
        activePhase: VALID_PHASES.has(ui.activePhase) ? ui.activePhase : getAutoPhase(),
        activeDate: VALID_DATES.has(ui.activeDate) ? ui.activeDate : getBestActiveDate(),
        hideCompleted: ui.hideCompleted === true
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? sanitizeState(JSON.parse(raw)) : sanitizeState(null);
    } catch (error) {
      console.warn("저장된 여행 데이터를 불러오지 못했습니다.", error);
      return sanitizeState(null);
    }
  }

  function saveState(notify = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (notify) showToast("이 기기에 저장했어요");
    } catch (error) {
      console.warn("여행 데이터를 저장하지 못했습니다.", error);
      showToast("저장 공간을 확인해 주세요", true);
    }
  }

  function showToast(message, isError = false) {
    const toast = $("#saveToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1900);
  }

  function dateValue(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  }

  function daysBetween(from, to) {
    return Math.round((dateValue(to) - dateValue(from)) / 86400000);
  }

  function todayInHongKong() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function getAutoPhase() {
    const today = todayInHongKong();
    if (today < START_DATE) return "before";
    if (today > END_DATE) return "after";
    return "during";
  }

  function getBestActiveDate() {
    const today = todayInHongKong();
    return VALID_DATES.has(today) ? today : START_DATE;
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function updateCountdown() {
    const today = todayInHongKong();
    const countdown = $("#countdown");
    const message = $("#phaseMessage");
    if (!countdown || !message) return;

    if (today < START_DATE) {
      const left = daysBetween(today, START_DATE);
      countdown.textContent = `D–${left}`;
      message.textContent = left <= 3 ? "마지막 준비물을 확인할 시간" : "지금은 차근차근 준비할 시간";
    } else if (today <= END_DATE) {
      const day = daysBetween(START_DATE, today) + 1;
      countdown.textContent = `DAY ${day}`;
      message.textContent = "오늘 필요한 정보만 바로 확인하세요";
    } else {
      const since = daysBetween(END_DATE, today);
      countdown.textContent = `+${since}`;
      message.textContent = "좋았던 순간을 천천히 정리해요";
    }
  }

  function updateHongKongTime() {
    const target = $("#hongKongTime");
    if (!target) return;
    target.textContent = new Intl.DateTimeFormat("ko-KR", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date());
  }

  function setPhase(phase, options = {}) {
    if (!VALID_PHASES.has(phase)) return;
    const { scroll = false, persist = true } = options;
    state.ui.activePhase = phase;

    $$(".phase-tab").forEach((tab) => {
      const selected = tab.dataset.phase === phase;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    $$("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== phase;
    });

    $$(".mobile-phase-nav [data-phase]").forEach((button) => {
      if (button.dataset.phase === phase) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (persist) saveState(false);
    if (scroll) {
      const mainTop = $("#main");
      if (mainTop) mainTop.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handlePhaseKeydown(event) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs = $$(".phase-tab");
    const current = tabs.indexOf(event.currentTarget);
    let next = current;
    if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    setPhase(tabs[next].dataset.phase, { scroll: false });
    tabs[next].focus();
  }

  function renderChecklist(phase, containerSelector) {
    const container = $(containerSelector);
    if (!container) return;
    container.replaceChildren();
    const categoryOrder = phase === "after" ? AFTER_CATEGORY_ORDER : BEFORE_CATEGORY_ORDER;
    const visibleItems = state.checklist.filter((item) => item.phase === phase && !(phase === "before" && state.ui.hideCompleted && item.done));

    categoryOrder.forEach((category) => {
      const items = visibleItems.filter((item) => item.category === category);
      if (!items.length && phase === "before") return;
      const group = createElement("section", "check-group");
      const heading = createElement("h4", "", category);
      const list = createElement("div", "check-list");

      if (!items.length) {
        list.append(createElement("p", "empty-state", "모두 완료했어요. 여행의 여운만 챙겨두세요."));
      } else {
        items.forEach((item) => {
          const row = createElement("div", `check-item${item.done ? " is-done" : ""}`);
          const label = createElement("label");
          const checkbox = createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = item.done;
          checkbox.dataset.checkId = item.id;
          checkbox.setAttribute("aria-label", `${item.text} ${item.done ? "완료 해제" : "완료"}`);
          const text = createElement("span", "check-item-text", item.text);
          label.append(checkbox, text);
          const remove = createElement("button", "delete-button", "×");
          remove.type = "button";
          remove.dataset.action = "delete-check";
          remove.dataset.id = item.id;
          remove.setAttribute("aria-label", `${item.text} 삭제`);
          row.append(label, remove);
          list.append(row);
        });
      }

      group.append(heading, list);
      container.append(group);
    });

    if (!container.children.length) {
      container.append(createElement("p", "empty-state", "완료한 항목을 숨겼어요. 위의 스위치를 끄면 다시 볼 수 있습니다."));
    }
  }

  function updateProgress() {
    const items = state.checklist.filter((item) => item.phase === "before");
    const done = items.filter((item) => item.done).length;
    const percent = items.length ? Math.round((done / items.length) * 100) : 0;
    const ring = $("#progressRing");
    if (ring) ring.style.setProperty("--progress", `${percent}%`);
    if ($("#progressValue")) $("#progressValue").textContent = String(percent);
    if ($("#progressBar")) $("#progressBar").style.width = `${percent}%`;
    if ($("#progressCount")) $("#progressCount").textContent = `${done} / ${items.length} 완료`;

    let status = "준비 중";
    let headline = "이제 시작해볼까요?";
    let description = "준비 목록을 하나씩 체크하면 여기서 한눈에 확인할 수 있어요.";
    if (percent >= 100) {
      status = "출발 준비 완료";
      headline = "가볍게 떠날 준비 끝!";
      description = "마지막으로 여권과 출발 시각만 한 번 더 확인해요.";
    } else if (percent >= 70) {
      status = "거의 다 됐어요";
      headline = "이제 정말 얼마 안 남았어요";
      description = "남은 항목만 확인하면 마음 편하게 출발할 수 있어요.";
    } else if (percent >= 35) {
      status = "순조롭게 준비 중";
      headline = "좋아요, 하나씩 정리되고 있어요";
      description = "예약과 통신부터 마무리하고 가방을 채워보세요.";
    }
    if ($("#readyStatus")) $("#readyStatus").textContent = status;
    if ($("#progressHeadline")) $("#progressHeadline").textContent = headline;
    if ($("#progressDescription")) $("#progressDescription").textContent = description;
  }

  function renderPlaces() {
    const container = $("#placeSeedGrid");
    if (!container) return;
    container.replaceChildren();
    PLACE_SEEDS.forEach((place, index) => {
      const article = createElement("article", "place-seed");
      article.dataset.index = String(index + 1).padStart(2, "0");
      const top = createElement("div", "place-seed-top");
      top.append(createElement("span", "place-seed-tag", place.tag), createElement("h4", "", place.name), createElement("p", "", place.description));
      const bottom = createElement("div", "place-seed-bottom");
      const map = createElement("a", "", "지도 ↗");
      map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.query)}`;
      map.target = "_blank";
      map.rel = "noopener noreferrer";
      const add = createElement("button", "", "일정에 담기");
      add.type = "button";
      add.dataset.action = "add-place";
      add.dataset.index = String(index);
      bottom.append(map, add);
      article.append(top, bottom);
      container.append(article);
    });
  }

  function renderDaySwitcher() {
    const container = $("#daySwitcher");
    if (!container) return;
    const today = todayInHongKong();
    container.replaceChildren();
    TRIP_DAYS.forEach((day) => {
      const button = createElement("button", `day-tab${day.date === today ? " is-today" : ""}`);
      button.type = "button";
      button.role = "tab";
      button.dataset.date = day.date;
      button.setAttribute("aria-selected", String(day.date === state.ui.activeDate));
      button.tabIndex = day.date === state.ui.activeDate ? 0 : -1;
      button.setAttribute("aria-label", `8월 ${day.number}일 ${day.weekday}요일 일정`);
      button.append(
        createElement("span", "day-tab-date", day.number),
        (() => {
          const meta = createElement("span", "day-tab-meta");
          meta.append(createElement("b", "", `DAY ${day.day}`), createElement("span", "", `${day.weekday}요일`));
          return meta;
        })()
      );
      container.append(button);
    });
  }

  function renderTimeline() {
    const day = TRIP_DAYS.find((item) => item.date === state.ui.activeDate) || TRIP_DAYS[0];
    const timeline = $("#timeline");
    if (!timeline) return;
    if ($("#activeDayLabel")) $("#activeDayLabel").textContent = `DAY ${day.day} · ${day.weekdayLong}`;
    if ($("#activeDayTitle")) $("#activeDayTitle").textContent = `8월 ${day.number}일의 일정`;
    if ($("#itineraryDate")) $("#itineraryDate").value = day.date;
    if ($("#expenseDate")) $("#expenseDate").value = day.date;
    const todayBadge = $("#todayBadge");
    if (todayBadge) todayBadge.hidden = day.date !== todayInHongKong();

    const items = state.itinerary
      .filter((item) => item.date === day.date)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    timeline.replaceChildren();

    if (!items.length) {
      timeline.append(createElement("p", "empty-state", "아직 이날의 일정이 없어요. 가장 먼저 가고 싶은 장소를 추가해보세요."));
      return;
    }

    items.forEach((item) => {
      const row = createElement("article", "timeline-item");
      const time = createElement("time", `timeline-time${item.time ? "" : " is-open"}`, item.time || "미정");
      time.dateTime = item.time ? `${item.date}T${item.time}` : item.date;
      const line = createElement("span", "timeline-line");
      const copy = createElement("div", "timeline-copy");
      copy.append(createElement("h4", "", item.title));
      if (item.note) copy.append(createElement("p", "", item.note));
      if (item.place) {
        const placeLink = createElement("a", "timeline-place", `⌖ ${item.place} · 지도 ↗`);
        placeLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.place} Hong Kong`)}`;
        placeLink.target = "_blank";
        placeLink.rel = "noopener noreferrer";
        copy.append(placeLink);
      }
      const remove = createElement("button", "delete-button", "×");
      remove.type = "button";
      remove.dataset.action = "delete-itinerary";
      remove.dataset.id = item.id;
      remove.setAttribute("aria-label", `${item.title} 일정 삭제`);
      row.append(time, line, copy, remove);
      timeline.append(row);
    });
  }

  function setActiveDate(date, focus = false) {
    if (!VALID_DATES.has(date)) return;
    state.ui.activeDate = date;
    saveState(false);
    renderDaySwitcher();
    renderTimeline();
    renderWeather(state.weatherCache ? state.weatherCache.data : null);
    if (focus) {
      const active = $(`.day-tab[data-date="${date}"]`);
      if (active) active.focus();
    }
  }

  function weatherInfo(code) {
    if (code === 0) return { icon: "☀", label: "맑음" };
    if ([1, 2].includes(code)) return { icon: "◑", label: "대체로 맑음" };
    if (code === 3) return { icon: "☁", label: "흐림" };
    if ([45, 48].includes(code)) return { icon: "≋", label: "안개" };
    if ([51, 53, 55, 56, 57].includes(code)) return { icon: "⌁", label: "이슬비" };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "☂", label: "비" };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "❄", label: "눈" };
    if ([95, 96, 99].includes(code)) return { icon: "ϟ", label: "뇌우" };
    return { icon: "◌", label: "날씨" };
  }

  function renderWeather(data, stale = false) {
    const currentText = $("#currentWeatherText");
    const currentIcon = $("#currentWeatherIcon");
    const daysContainer = $("#weatherDays");
    const updated = $("#weatherUpdated");
    if (!daysContainer) return;
    daysContainer.replaceChildren();

    if (data && data.current) {
      const info = weatherInfo(Number(data.current.weather_code));
      const temperature = Number(data.current.temperature_2m);
      if (currentIcon) currentIcon.textContent = info.icon;
      if (currentText) currentText.textContent = `${Number.isFinite(temperature) ? Math.round(temperature) + "°C" : "--"} · ${info.label}`;
    } else {
      if (currentIcon) currentIcon.textContent = "◌";
      if (currentText) currentText.textContent = "현재 날씨 확인 전";
    }

    const daily = data && data.daily ? data.daily : null;
    TRIP_DAYS.forEach((tripDay) => {
      const index = daily && Array.isArray(daily.time) ? daily.time.indexOf(tripDay.date) : -1;
      const rawCode = index >= 0 && Array.isArray(daily.weather_code) ? daily.weather_code[index] : null;
      const rawMax = index >= 0 && Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[index] : null;
      const rawMin = index >= 0 && Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[index] : null;
      const hasForecast = index >= 0 && rawCode !== null && rawCode !== undefined && rawMax !== null && rawMax !== undefined && rawMin !== null && rawMin !== undefined
        && Number.isFinite(Number(rawCode)) && Number.isFinite(Number(rawMax)) && Number.isFinite(Number(rawMin));
      const card = createElement("article", `weather-day${tripDay.date === state.ui.activeDate ? " is-selected" : ""}${hasForecast ? "" : " is-pending"}`);
      const time = createElement("time", "", `${tripDay.number}일 · ${tripDay.weekday}`);
      time.dateTime = tripDay.date;
      card.append(time);

      if (!hasForecast) {
        card.append(createElement("span", "weather-symbol", "◌"), createElement("strong", "", "예보 준비 중"), createElement("p", "", "최대 16일 전부터 표시"));
      } else {
        const code = Number(rawCode);
        const info = weatherInfo(code);
        const max = Math.round(Number(rawMax));
        const min = Math.round(Number(rawMin));
        const rawRain = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[index] : null;
        const rain = rawRain === null || rawRain === undefined ? NaN : Math.round(Number(rawRain));
        card.append(
          createElement("span", "weather-symbol", info.icon),
          createElement("strong", "", `${max}° / ${min}°`),
          createElement("p", "", `${info.label} · 비 ${Number.isFinite(rain) ? rain : "--"}%`)
        );
      }
      daysContainer.append(card);
    });

    if (updated) {
      if (state.weatherCache && state.weatherCache.fetchedAt) {
        const time = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(state.weatherCache.fetchedAt));
        updated.textContent = `${stale ? "마지막 저장 예보 · " : "업데이트 · "}${time} · Open-Meteo`;
      } else {
        updated.textContent = "예보는 출발일이 가까워질수록 자동으로 채워집니다.";
      }
    }
  }

  async function fetchWeather(force = false) {
    if (weatherRequest) return weatherRequest;
    const cacheAge = state.weatherCache ? Date.now() - new Date(state.weatherCache.fetchedAt).getTime() : Infinity;
    if (!force && state.weatherCache && cacheAge < 30 * 60 * 1000) {
      renderWeather(state.weatherCache.data);
      return;
    }

    $$("[data-action='refresh-weather']").forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    });

    weatherRequest = fetch(WEATHER_URL, { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        state.weatherCache = { fetchedAt: new Date().toISOString(), data };
        saveState(false);
        renderWeather(data);
        if (force) showToast("최신 날씨로 업데이트했어요");
      })
      .catch((error) => {
        console.warn("날씨를 불러오지 못했습니다.", error);
        if (state.weatherCache) renderWeather(state.weatherCache.data, true);
        else renderWeather(null);
        if (force) showToast("날씨 연결을 다시 확인해 주세요", true);
      })
      .finally(() => {
        $$("[data-action='refresh-weather']").forEach((button) => {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        });
        weatherRequest = null;
      });

    return weatherRequest;
  }

  function formatHKD(value) {
    return new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
  }

  function renderExpenses() {
    const container = $("#expenseList");
    const totalTarget = $("#expenseTotal");
    if (!container || !totalTarget) return;
    const total = state.expenses.reduce((sum, item) => sum + item.amount, 0);
    totalTarget.textContent = formatHKD(total);
    container.replaceChildren();

    if (!state.expenses.length) {
      container.append(createElement("p", "empty-state", "여행 중 남긴 비용이 이곳에 정리됩니다. 첫 지출을 추가해보세요."));
      return;
    }

    [...state.expenses]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((item) => {
        const row = createElement("article", "expense-row");
        const time = createElement("time", "", item.date.slice(5).replace("-", "/"));
        time.dateTime = item.date;
        const copy = createElement("div");
        copy.append(createElement("span", "expense-category", item.category), createElement("p", "", item.description));
        const amount = createElement("strong", "", formatHKD(item.amount));
        const remove = createElement("button", "delete-button", "×");
        remove.type = "button";
        remove.dataset.action = "delete-expense";
        remove.dataset.id = item.id;
        remove.setAttribute("aria-label", `${item.description} 지출 삭제`);
        row.append(time, copy, amount, remove);
        container.append(row);
      });
  }

  function hydrateNotes() {
    $$('[data-note-key]').forEach((textarea) => {
      textarea.value = state.notes[textarea.dataset.noteKey] || "";
    });
  }

  function renderAll() {
    updateCountdown();
    updateHongKongTime();
    setPhase(state.ui.activePhase || getAutoPhase(), { scroll: false, persist: false });
    if ($("#hideCompleted")) $("#hideCompleted").checked = state.ui.hideCompleted;
    renderChecklist("before", "#beforeChecklist");
    renderChecklist("after", "#afterChecklist");
    updateProgress();
    renderPlaces();
    renderDaySwitcher();
    renderTimeline();
    renderExpenses();
    hydrateNotes();
    renderWeather(state.weatherCache ? state.weatherCache.data : null, Boolean(state.weatherCache));
  }

  function addPlaceToItinerary(index) {
    const place = PLACE_SEEDS[index];
    if (!place) return;
    setPhase("during", { scroll: true });
    window.setTimeout(() => {
      const details = $("#itineraryDetails");
      const title = $("#itineraryTitle");
      const placeInput = $("#itineraryPlace");
      if (details) details.open = true;
      if (title) title.value = place.description;
      if (placeInput) placeInput.value = place.name;
      if (title) title.focus();
    }, 320);
  }

  function exportData() {
    const payload = {
      ...state,
      exportedAt: new Date().toISOString(),
      trip: {
        title: "Hong Kong, here we go.",
        destination: "Hong Kong",
        startDate: START_DATE,
        endDate: END_DATE,
        timezone: TIMEZONE,
        currency: "HKD",
        mapListUrl: MAP_LIST_URL
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hong-kong-trip-2026-08-15.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("여행 백업 파일을 만들었어요");
  }

  async function importData(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      showToast("1MB 이하의 JSON 파일만 불러올 수 있어요", true);
      return;
    }
    try {
      const text = await file.text();
      const incoming = sanitizeState(JSON.parse(text));
      if (!window.confirm("현재 저장 내용을 백업 파일의 내용으로 바꿀까요?")) return;
      state = incoming;
      saveState(false);
      renderAll();
      showToast("백업 내용을 불러왔어요");
      fetchWeather(false);
    } catch (error) {
      console.warn("백업 파일을 불러오지 못했습니다.", error);
      showToast("올바른 여행 백업 파일인지 확인해 주세요", true);
    } finally {
      const input = $("#importFile");
      if (input) input.value = "";
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("주소를 복사했어요");
    } catch (error) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      showToast(copied ? "주소를 복사했어요" : "주소 복사를 다시 시도해 주세요", !copied);
    }
  }

  function resetData() {
    if (!window.confirm("체크, 일정, 지출과 메모를 모두 처음 상태로 되돌릴까요? 이 작업은 되돌릴 수 없습니다.")) return;
    state = sanitizeState(null);
    localStorage.removeItem(STORAGE_KEY);
    saveState(false);
    renderAll();
    showToast("처음 상태로 되돌렸어요");
    fetchWeather(true);
  }

  function handleDocumentClick(event) {
    const phaseButton = event.target.closest("[data-phase]");
    if (phaseButton) {
      setPhase(phaseButton.dataset.phase, { scroll: phaseButton.closest(".mobile-phase-nav") !== null });
      return;
    }

    const dateButton = event.target.closest(".day-tab[data-date]");
    if (dateButton) {
      setActiveDate(dateButton.dataset.date);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "refresh-weather") fetchWeather(true);
      if (action === "print") window.print();
      if (action === "export") exportData();
      if (action === "reset") resetData();
      if (action === "add-place") addPlaceToItinerary(Number(actionButton.dataset.index));
      if (action === "delete-check") {
        state.checklist = state.checklist.filter((item) => item.id !== actionButton.dataset.id);
        saveState();
        renderChecklist("before", "#beforeChecklist");
        renderChecklist("after", "#afterChecklist");
        updateProgress();
      }
      if (action === "delete-itinerary") {
        state.itinerary = state.itinerary.filter((item) => item.id !== actionButton.dataset.id);
        saveState();
        renderTimeline();
      }
      if (action === "delete-expense") {
        state.expenses = state.expenses.filter((item) => item.id !== actionButton.dataset.id);
        saveState();
        renderExpenses();
      }
      return;
    }

    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) copyText(copyButton.dataset.copy);
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    $$(".phase-tab").forEach((tab) => tab.addEventListener("keydown", handlePhaseKeydown));

    document.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-check-id]");
      if (checkbox) {
        const item = state.checklist.find((entry) => entry.id === checkbox.dataset.checkId);
        if (item) item.done = checkbox.checked;
        saveState();
        renderChecklist("before", "#beforeChecklist");
        renderChecklist("after", "#afterChecklist");
        updateProgress();
      }
    });

    const hideCompleted = $("#hideCompleted");
    if (hideCompleted) {
      hideCompleted.addEventListener("change", () => {
        state.ui.hideCompleted = hideCompleted.checked;
        saveState(false);
        renderChecklist("before", "#beforeChecklist");
      });
    }

    const checklistForm = $("#checklistForm");
    if (checklistForm) {
      checklistForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(checklistForm);
        const text = cleanText(formData.get("text"), 80);
        const category = cleanText(formData.get("category"), 40);
        if (!text) return;
        state.checklist.push({ id: makeId("check"), phase: "before", category, text, done: false });
        checklistForm.reset();
        saveState();
        renderChecklist("before", "#beforeChecklist");
        updateProgress();
        $("#checklistText").focus();
      });
    }

    const itineraryForm = $("#itineraryForm");
    if (itineraryForm) {
      itineraryForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(itineraryForm);
        const title = cleanText(formData.get("title"), 80);
        if (!title) return;
        state.itinerary.push({
          id: makeId("plan"),
          date: VALID_DATES.has(formData.get("date")) ? formData.get("date") : state.ui.activeDate,
          time: /^([01]\d|2[0-3]):[0-5]\d$/.test(formData.get("time")) ? formData.get("time") : "",
          title,
          place: cleanText(formData.get("place"), 100),
          note: cleanText(formData.get("note"), 160)
        });
        itineraryForm.reset();
        $("#itineraryDate").value = state.ui.activeDate;
        $("#itineraryDetails").open = false;
        saveState();
        renderTimeline();
      });
    }

    const expenseForm = $("#expenseForm");
    if (expenseForm) {
      expenseForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(expenseForm);
        const description = cleanText(formData.get("description"), 80);
        const amount = Number(formData.get("amount"));
        if (!description || !Number.isFinite(amount) || amount <= 0) {
          showToast("항목과 0보다 큰 금액을 입력해 주세요", true);
          return;
        }
        state.expenses.push({
          id: makeId("expense"),
          date: VALID_DATES.has(formData.get("date")) ? formData.get("date") : state.ui.activeDate,
          category: cleanText(formData.get("category"), 30) || "기타",
          description,
          amount: Math.round(amount * 100) / 100
        });
        expenseForm.reset();
        $("#expenseDate").value = state.ui.activeDate;
        saveState();
        renderExpenses();
        $("#expenseDescription").focus();
      });
    }

    $$('[data-note-key]').forEach((textarea) => {
      textarea.addEventListener("input", () => {
        state.notes[textarea.dataset.noteKey] = textarea.value.slice(0, 500);
        window.clearTimeout(noteSaveTimer);
        noteSaveTimer = window.setTimeout(() => saveState(), 450);
      });
    });

    const importFile = $("#importFile");
    if (importFile) importFile.addEventListener("change", () => importData(importFile.files && importFile.files[0]));

    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          state = sanitizeState(JSON.parse(event.newValue));
          renderAll();
          showToast("다른 탭의 변경 내용을 반영했어요");
        } catch (error) {
          console.warn("다른 탭의 데이터를 반영하지 못했습니다.", error);
        }
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        updateCountdown();
        updateHongKongTime();
        fetchWeather(false);
      }
    });
  }

  renderAll();
  bindEvents();
  fetchWeather(false);
  window.setInterval(updateHongKongTime, 30000);
  window.setInterval(updateCountdown, 15 * 60 * 1000);
})();
