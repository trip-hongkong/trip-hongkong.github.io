"use strict";

(() => {
  const CONTEXT_KEY = "trip-hongkong-cloud-context-v1";
  const PERSON_KEY = "trip-hongkong-cloud-person-v1";
  const QUEUE_PREFIX = "trip-hongkong-sync-queue-v1:";
  const RECEIPT_BUCKET = "receipts";
  const SHARED_TABLES = ["participants", "checklist", "itinerary", "expenses"];
  const DB_TABLES = {
    participants: "participants",
    checklist: "checklist_items",
    itinerary: "itinerary_items",
    expenses: "expenses"
  };
  const OWNER_TO_PARTICIPANT = {
    minje: "person-me",
    junho: "person-companion",
    juyoung: "person-companion-2",
    junhyuk: "person-companion-3"
  };
  const PARTICIPANT_TO_OWNER = Object.fromEntries(
    Object.entries(OWNER_TO_PARTICIPANT).map(([ownerId, participantId]) => [participantId, ownerId])
  );
  const STATUS_COPY = {
    local: ["로컬", "이 기기에 저장 중"],
    connecting: ["연결 중", "공용 여행방을 확인하는 중"],
    join: ["연결", "여행방 연결 필요"],
    syncing: ["동기화 중", "공용 데이터를 저장하는 중"],
    synced: ["저장됨", "공용 데이터 최신 상태"],
    offline: ["오프라인", "이 기기에 임시 저장 중"],
    error: ["확인 필요", "공용 저장 연결을 확인해 주세요"]
  };

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch (error) { return fallback; }
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (error) { return false; }
  }

  function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
  }

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function configuredValue(value) {
    const text = cleanText(value, 1000);
    return text && !/^__.+__$/.test(text) && !/YOUR_|PROJECT_REF|example/i.test(text) ? text : "";
  }

  function readConfig() {
    const supplied = globalThis.TRIP_SUPABASE_CONFIG && typeof globalThis.TRIP_SUPABASE_CONFIG === "object"
      ? globalThis.TRIP_SUPABASE_CONFIG
      : {};
    const urlMeta = document.querySelector('meta[name="trip-supabase-url"]')?.content;
    const keyMeta = document.querySelector('meta[name="trip-supabase-key"]')?.content;
    const url = configuredValue(supplied.url || supplied.supabaseUrl || urlMeta);
    const publishableKey = configuredValue(supplied.publishableKey || supplied.anonKey || supplied.key || keyMeta);
    if (!url || !publishableKey || !/^https:\/\//i.test(url)) return null;
    return { url: url.replace(/\/$/, ""), publishableKey };
  }

  function formatError(error) {
    const message = cleanText(error?.message, 240);
    if (!message) return "공용 저장에 연결하지 못했습니다.";
    if (/invite|초대|P0001/i.test(`${error?.code || ""} ${message}`)) return "초대 코드를 확인해 주세요.";
    if (/Failed to fetch|NetworkError|network|offline/i.test(message)) return "인터넷 연결을 확인해 주세요.";
    return message;
  }

  class CloudSync {
    constructor(options = {}) {
      this.options = options;
      this.config = readConfig();
      this.client = null;
      this.userId = "";
      this.tripId = "";
      this.role = "";
      this.trip = null;
      this.channel = null;
      this.queue = [];
      this.flushing = false;
      this.refetching = false;
      this.refetchTimer = 0;
      this.flushTimer = 0;
      this.applyRemote = false;
      this.started = false;
      this.needsReconnect = false;
      this.maps = this.emptyMaps();
      this.receipts = new Map();
      this.lastShared = null;
      this.boundOnline = () => this.handleOnline();
      this.boundOffline = () => this.setStatus("offline");
      this.boundVisibility = () => {
        if (document.visibilityState === "visible") this.handleOnline();
      };
    }

    emptyMaps() {
      return {
        participants: new Map(),
        checklist: new Map(),
        itinerary: new Map(),
        expenses: new Map(),
        participantRemoteToLocal: new Map(),
        expenseRemoteToLocal: new Map()
      };
    }

    isReady() {
      return Boolean(this.client && this.tripId);
    }

    isApplyingRemote() {
      return this.applyRemote;
    }

    restoreOfflineContext() {
      const remembered = safeParse(safeGet(CONTEXT_KEY), {});
      const tripId = cleanText(remembered.tripId, 80);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tripId)) return false;
      this.tripId = tripId;
      this.role = ["owner", "editor", "viewer"].includes(remembered.role) ? remembered.role : "editor";
      this.trip = null;
      this.needsReconnect = true;
      this.loadQueue();
      return true;
    }

    async init() {
      if (this.started) return;
      this.started = true;
      this.bindUi();
      window.addEventListener("online", this.boundOnline);
      window.addEventListener("offline", this.boundOffline);
      document.addEventListener("visibilitychange", this.boundVisibility);

      if (!this.config || !globalThis.supabase?.createClient) {
        this.setStatus("local");
        return;
      }

      this.setStatus("connecting");
      this.client = globalThis.supabase.createClient(this.config.url, this.config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });

      try {
        const { data, error } = await this.client.auth.getSession();
        if (error) throw error;
        this.userId = data.session?.user?.id || "";
        if (!this.userId) {
          this.requireJoin(true);
          return;
        }
        const membership = await this.findMembership();
        if (!membership) {
          this.requireJoin(true);
          return;
        }
        await this.connectTrip(membership.trip_id, membership.role);
      } catch (error) {
        console.warn("공용 여행방을 확인하지 못했습니다.", error);
        if (!navigator.onLine) {
          this.restoreOfflineContext();
          this.needsReconnect = true;
          this.setStatus("offline");
        }
        else {
          this.setStatus("error", formatError(error));
          this.requireJoin(false, formatError(error));
        }
      }
    }

    bindUi() {
      const statusButton = document.querySelector("#cloudStatusButton");
      const close = document.querySelector("#cloudJoinClose");
      const form = document.querySelector("#cloudJoinForm");
      statusButton?.addEventListener("click", () => this.showJoin());
      close?.addEventListener("click", () => this.hideJoin());
      form?.addEventListener("submit", (event) => this.submitJoin(event));

      const name = document.querySelector("#cloudPersonName");
      const savedName = cleanText(safeGet(PERSON_KEY), 30);
      if (name && [...name.options].some((option) => option.value === savedName)) name.value = savedName;

      const url = new URL(window.location.href);
      const inviteFromUrl = cleanText(url.searchParams.get("invite"), 160);
      const invite = document.querySelector("#cloudInviteCode");
      if (invite && inviteFromUrl) invite.value = inviteFromUrl;
      if (inviteFromUrl) {
        url.searchParams.delete("invite");
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }

    setStatus(status, detail = "") {
      const copyText = STATUS_COPY[status] || STATUS_COPY.error;
      const label = copyText[0];
      const description = detail || copyText[1];
      const button = document.querySelector("#cloudStatusButton");
      if (button) {
        button.dataset.status = status;
        button.title = description;
        button.setAttribute("aria-label", `공용 저장 상태: ${description}`);
      }
      const labelNode = document.querySelector("#cloudStatusLabel");
      if (labelNode) labelNode.textContent = label;
      const detailNode = document.querySelector("#cloudStatusDetail");
      if (detailNode) detailNode.textContent = description;
      const dataCopy = document.querySelector("#cloudDataCopy");
      if (dataCopy) {
        dataCopy.textContent = status === "synced" || status === "syncing"
          ? "체크리스트·일정·정산과 영수증을 참가자 모두가 함께 봅니다."
          : status === "offline"
            ? "인터넷이 연결되면 이 기기의 변경 내용을 자동으로 합칩니다."
            : "여행방을 연결하면 참가자 모두가 같은 내용을 볼 수 있습니다.";
      }
    }

    requireJoin(autoOpen = false, message = "") {
      this.setStatus("join", message || "여행방 연결 필요");
      if (autoOpen) this.showJoin(message);
    }

    showJoin(message = "") {
      const overlay = document.querySelector("#cloudJoinOverlay");
      if (!overlay) return;
      overlay.hidden = false;
      const note = document.querySelector("#cloudJoinMessage");
      if (note) {
        note.textContent = message || (this.config
          ? "받은 초대 코드로 연결하면 이 기기의 기록도 공용으로 옮길 수 있어요."
          : "공용 저장 설정을 마치는 동안에는 현재 기기에 계속 저장됩니다.");
        note.classList.remove("is-error");
      }
      const form = document.querySelector("#cloudJoinForm");
      if (form) form.hidden = !this.config;
      window.setTimeout(() => {
        const invite = document.querySelector("#cloudInviteCode");
        document.querySelector(this.config && invite?.value ? "#cloudPersonName" : this.config ? "#cloudInviteCode" : "#cloudJoinClose")?.focus();
      }, 40);
    }

    hideJoin() {
      const overlay = document.querySelector("#cloudJoinOverlay");
      if (overlay) overlay.hidden = true;
    }

    async submitJoin(event) {
      event.preventDefault();
      if (!this.client) {
        this.showJoin("공용 저장 설정이 아직 연결되지 않았습니다.");
        return;
      }
      const form = event.currentTarget;
      const formData = new FormData(form);
      const personName = cleanText(formData.get("person"), 30);
      const inviteCode = typeof formData.get("invite") === "string" ? formData.get("invite").trim() : "";
      const submit = document.querySelector("#cloudJoinSubmit");
      const message = document.querySelector("#cloudJoinMessage");
      if (!personName || inviteCode.length < 24) {
        if (message) {
          message.textContent = "이름과 초대 코드를 확인해 주세요.";
          message.classList.add("is-error");
        }
        return;
      }

      if (submit) { submit.disabled = true; submit.textContent = "연결 중"; }
      if (message) { message.textContent = "안전하게 여행방을 연결하고 있어요."; message.classList.remove("is-error"); }
      this.setStatus("connecting");
      try {
        let session = (await this.client.auth.getSession()).data.session;
        if (!session) {
          const result = await this.client.auth.signInAnonymously();
          if (result.error) throw result.error;
          session = result.data.session;
        }
        this.userId = session?.user?.id || "";
        if (!this.userId) throw new Error("익명 연결을 만들지 못했습니다.");

        const { data, error } = await this.client.rpc("join_trip", { p_invite_code: inviteCode });
        if (error) throw error;
        const membership = Array.isArray(data) ? data[0] : data;
        if (!membership?.trip_id) throw new Error("여행방을 찾지 못했습니다.");
        safeSet(PERSON_KEY, personName);
        const invite = document.querySelector("#cloudInviteCode");
        if (invite) invite.value = "";
        await this.connectTrip(membership.trip_id, membership.member_role || "editor", membership);
        this.hideJoin();
        this.options.showToast?.("공용 여행방에 연결했습니다");
      } catch (error) {
        console.warn("여행방 연결 실패", error);
        const errorMessage = formatError(error);
        this.setStatus("join", errorMessage);
        if (message) { message.textContent = errorMessage; message.classList.add("is-error"); }
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = "공용 여행에 연결"; }
      }
    }

    async findMembership() {
      if (!this.userId) return null;
      const remembered = safeParse(safeGet(CONTEXT_KEY), {});
      const query = this.client
        .from("trip_members")
        .select("trip_id, role, joined_at")
        .eq("user_id", this.userId)
        .order("joined_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      if (!Array.isArray(data) || !data.length) return null;
      return data.find((row) => row.trip_id === remembered.tripId) || data[0];
    }

    async loadTrip(tripId) {
      const { data, error } = await this.client
        .from("trips")
        .select("id, slug, title, starts_on, ends_on, timezone, is_active, shared_initialized_at, updated_at")
        .eq("id", tripId)
        .single();
      if (error) throw error;
      return data;
    }

    async connectTrip(tripId, role = "editor", providedTrip = null) {
      this.needsReconnect = true;
      this.tripId = tripId;
      this.role = role;
      this.trip = providedTrip?.trip_title
        ? {
            id: tripId,
            slug: providedTrip.trip_slug,
            title: providedTrip.trip_title,
            starts_on: providedTrip.starts_on,
            ends_on: providedTrip.ends_on,
            timezone: providedTrip.timezone,
            shared_initialized_at: null
          }
        : await this.loadTrip(tripId);
      safeSet(CONTEXT_KEY, JSON.stringify({ tripId, role, connectedAt: new Date().toISOString() }));
      this.loadQueue();

      if (!this.trip.shared_initialized_at) {
        const latest = await this.loadTrip(tripId);
        this.trip = latest;
      }

      if (!this.trip.shared_initialized_at) {
        const claimed = await this.claimBootstrap();
        if (claimed) {
          await this.bootstrapFromLocal();
        } else {
          this.setStatus("syncing", "다른 기기에서 첫 데이터를 옮기는 중");
          await this.waitForBootstrap();
        }
      }

      await this.refetch(true);
      this.subscribeRealtime();
      this.needsReconnect = false;
      this.scheduleFlush();
    }

    async claimBootstrap() {
      const { data, error } = await this.client.rpc("claim_trip_bootstrap", { p_trip_id: this.tripId });
      if (error) throw error;
      return data === true;
    }

    async bootstrapFromLocal() {
      const shared = copy(this.options.getSharedState?.() || {});
      this.setStatus("syncing", "이 기기의 기록을 공용으로 옮기는 중");
      const remote = await this.fetchRaw();
      this.updateMaps(remote);

      const remoteParticipantIds = new Set(remote.participants.map((row) => row.client_id).filter(Boolean));
      (shared.participants || []).forEach((item, index) => {
        if (!remoteParticipantIds.has(item.id)) this.queueUpsert("participants", item, index, false);
      });
      (shared.checklist || []).forEach((item, index) => this.queueUpsert("checklist", item, index, false));
      (shared.itinerary || []).forEach((item, index) => this.queueUpsert("itinerary", item, index, false));
      (shared.expenses || []).forEach((item, index) => this.queueUpsert("expenses", item, index, false));
      (shared.expenses || []).filter((item) => item.receiptId).forEach((item) => {
        this.queueReceiptPut(item.id, "receipt.jpg", "image/jpeg", false);
      });
      this.persistQueue();

      const flushed = await this.flush(false);
      if (!flushed) throw new Error("첫 공용 저장을 완료하지 못했습니다.");
      const { data, error } = await this.client.rpc("finish_trip_bootstrap", { p_trip_id: this.tripId });
      if (error) throw error;
      if (data !== true) throw new Error("첫 공용 저장 완료 상태를 기록하지 못했습니다.");
      this.trip = await this.loadTrip(this.tripId);
    }

    async waitForBootstrap() {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const trip = await this.loadTrip(this.tripId);
        this.trip = trip;
        if (trip.shared_initialized_at) return;
      }
      throw new Error("첫 데이터 이동이 아직 진행 중입니다. 잠시 후 다시 열어 주세요.");
    }

    queueKey() {
      return this.tripId ? `${QUEUE_PREFIX}${this.tripId}` : "";
    }

    loadQueue() {
      const key = this.queueKey();
      const parsed = key ? safeParse(safeGet(key), []) : [];
      this.queue = Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.key && entry.op) : [];
    }

    persistQueue() {
      const key = this.queueKey();
      if (key) safeSet(key, JSON.stringify(this.queue.slice(-2000)));
    }

    enqueue(entry, shouldSchedule = true) {
      if (!this.tripId || this.applyRemote) return;
      const next = {
        ...entry,
        tripId: this.tripId,
        queuedAt: new Date().toISOString(),
        version: `${Date.now()}-${Math.random().toString(16).slice(2)}`
      };
      const index = this.queue.findIndex((item) => item.key === next.key);
      if (index >= 0) this.queue[index] = next;
      else this.queue.push(next);
      this.persistQueue();
      this.setStatus(navigator.onLine ? "syncing" : "offline");
      if (shouldSchedule) this.scheduleFlush();
    }

    queueUpsert(table, item, position = 0, shouldSchedule = true) {
      if (!SHARED_TABLES.includes(table) || !item?.id) return;
      this.enqueue({
        key: `entity:${table}:${item.id}`,
        op: "upsert",
        table,
        id: item.id,
        item: copy(item),
        position: Number.isFinite(position) ? position : 0
      }, shouldSchedule);
    }

    queueDelete(table, id, shouldSchedule = true) {
      if (!SHARED_TABLES.includes(table) || !id) return;
      this.enqueue({ key: `entity:${table}:${id}`, op: "delete", table, id }, shouldSchedule);
    }

    queueReceiptPut(expenseId, name = "receipt.jpg", type = "image/jpeg", shouldSchedule = true) {
      if (!expenseId) return;
      this.enqueue({
        key: `receipt:${expenseId}`,
        op: "receipt-put",
        id: expenseId,
        name: cleanText(name, 200) || "receipt.jpg",
        type: cleanText(type, 100) || "image/jpeg",
        storagePath: ""
      }, shouldSchedule);
    }

    queueReceiptDelete(expenseId, shouldSchedule = true) {
      if (!expenseId) return;
      this.enqueue({ key: `receipt:${expenseId}`, op: "receipt-delete", id: expenseId }, shouldSchedule);
    }

    queueReplace(shared) {
      if (!this.tripId || !shared) return;
      const previous = this.lastShared || {};
      let queuedChange = false;
      SHARED_TABLES.forEach((table) => {
        const items = Array.isArray(shared[table]) ? shared[table] : [];
        const previousItems = new Map((Array.isArray(previous[table]) ? previous[table] : []).map((item) => [item.id, item]));
        const localIds = new Set(items.map((item) => item.id));
        items.forEach((item, index) => {
          const previousItem = previousItems.get(item.id);
          if (!previousItem || JSON.stringify(previousItem) !== JSON.stringify(item)) {
            queuedChange = true;
            this.queueUpsert(table, item, index, false);
          }
        });
        previousItems.forEach((item, localId) => {
          if (!localIds.has(localId)) {
            queuedChange = true;
            this.queueDelete(table, localId, false);
          }
        });
      });
      const receiptIds = new Set((shared.expenses || []).filter((item) => item.receiptId).map((item) => item.id));
      const previousReceiptIds = new Set((previous.expenses || []).filter((item) => item.receiptId).map((item) => item.id));
      receiptIds.forEach((id) => {
        if (!previousReceiptIds.has(id)) {
          queuedChange = true;
          this.queueReceiptPut(id, "receipt.jpg", "image/jpeg", false);
        }
      });
      previousReceiptIds.forEach((id) => {
        if (!receiptIds.has(id)) {
          queuedChange = true;
          this.queueReceiptDelete(id, false);
        }
      });
      this.lastShared = copy(shared);
      this.persistQueue();
      if (queuedChange) this.scheduleFlush();
    }

    scheduleFlush(delay = 80) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = window.setTimeout(() => this.flush(), delay);
    }

    entryWeight(entry) {
      if (entry.op === "upsert" && entry.table === "participants") return 10;
      if (entry.op === "upsert" && (entry.table === "checklist" || entry.table === "itinerary")) return 20;
      if (entry.op === "upsert" && entry.table === "expenses") return 30;
      if (entry.op === "receipt-put") return 40;
      if (entry.op === "receipt-delete") return 50;
      if (entry.op === "delete" && (entry.table === "checklist" || entry.table === "itinerary")) return 60;
      if (entry.op === "delete" && entry.table === "expenses") return 70;
      if (entry.op === "delete" && entry.table === "participants") return 80;
      return 90;
    }

    async flush(refetchAfter = true) {
      if (this.flushing) return false;
      if (!this.isReady() || !this.queue.length) {
        if (this.isReady()) this.setStatus(navigator.onLine ? "synced" : "offline");
        return true;
      }
      if (!navigator.onLine) {
        this.setStatus("offline");
        return false;
      }

      this.flushing = true;
      this.setStatus("syncing");
      let successful = true;
      try {
        const ordered = [...this.queue].sort((left, right) => this.entryWeight(left) - this.entryWeight(right));
        for (const entry of ordered) {
          const current = this.queue.find((item) => item.key === entry.key);
          if (!current || current.version !== entry.version) continue;
          await this.processEntry(entry);
          const latest = this.queue.find((item) => item.key === entry.key);
          if (latest?.version === entry.version) {
            this.queue = this.queue.filter((item) => item.key !== entry.key);
            this.persistQueue();
          }
        }
      } catch (error) {
        successful = false;
        console.warn("공용 데이터 동기화 실패", error);
        this.setStatus(navigator.onLine ? "error" : "offline", formatError(error));
      } finally {
        this.flushing = false;
      }

      if (successful && !this.queue.length) {
        if (refetchAfter) await this.refetch(true).catch((error) => console.warn("동기화 후 확인 실패", error));
        this.setStatus("synced");
        return true;
      }
      if (this.queue.length && navigator.onLine) this.scheduleFlush(successful ? 80 : 1500);
      return false;
    }

    async processEntry(entry) {
      if (entry.op === "upsert") {
        await this.upsertEntity(entry.table, entry.item, entry.position);
        return;
      }
      if (entry.op === "delete") {
        await this.deleteEntity(entry.table, entry.id);
        return;
      }
      if (entry.op === "receipt-put") {
        await this.uploadReceipt(entry);
        return;
      }
      if (entry.op === "receipt-delete") await this.removeReceipt(entry.id);
    }

    async ensureRemoteParticipant(localId) {
      if (this.maps.participants.has(localId)) return this.maps.participants.get(localId);
      const { data, error } = await this.client
        .from("participants")
        .select("id, client_id")
        .eq("trip_id", this.tripId)
        .eq("client_id", localId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error(`참가자 연결을 찾지 못했습니다: ${localId}`);
      this.maps.participants.set(localId, data.id);
      this.maps.participantRemoteToLocal.set(data.id, localId);
      return data.id;
    }

    async entityRow(table, item, position) {
      if (table === "participants") {
        return {
          trip_id: this.tripId,
          client_id: item.id,
          name: cleanText(item.name, 40),
          is_active: item.active !== false,
          sort_order: position
        };
      }
      if (table === "checklist") {
        const participantLocalId = OWNER_TO_PARTICIPANT[item.ownerId];
        const ownerId = participantLocalId ? await this.ensureRemoteParticipant(participantLocalId) : null;
        return {
          trip_id: this.tripId,
          client_id: item.id,
          owner_participant_id: ownerId,
          category: cleanText(item.category, 40),
          text: cleanText(item.text, 200),
          url: cleanText(item.url, 1000) || null,
          link_label: cleanText(item.linkLabel, 20) || null,
          is_done: item.done === true,
          sort_order: position
        };
      }
      if (table === "itinerary") {
        return {
          trip_id: this.tripId,
          client_id: item.id,
          item_date: item.date,
          item_time: item.time || null,
          status: item.status || "custom",
          title: cleanText(item.title, 160),
          place: cleanText(item.place, 240) || null,
          note: cleanText(item.note, 1000) || null,
          sort_order: position
        };
      }
      if (table === "expenses") {
        const payer = await this.ensureRemoteParticipant(item.payerId);
        const splitIds = [];
        for (const localId of item.split?.participantIds || []) {
          splitIds.push(await this.ensureRemoteParticipant(localId));
        }
        return {
          trip_id: this.tripId,
          client_id: item.id,
          expense_date: item.date,
          category: cleanText(item.category, 40),
          description: cleanText(item.description, 200),
          currency: item.currency,
          amount_minor: Number(item.amountMinor),
          base_amount_krw: Number(item.baseAmountKRW) || 0,
          fx_rate_micros: Number(item.fxRateMicros) || 0,
          payer_participant_id: payer,
          split_mode: "equal",
          split_participant_ids: splitIds
        };
      }
      throw new Error(`지원하지 않는 공용 데이터: ${table}`);
    }

    updateColumns(table, row) {
      const { trip_id, client_id, ...columns } = row;
      return columns;
    }

    async upsertEntity(table, item, position = 0) {
      const dbTable = DB_TABLES[table];
      const row = await this.entityRow(table, item, position);
      let remoteId = this.maps[table].get(item.id) || "";
      if (!remoteId) {
        const lookup = await this.client
          .from(dbTable)
          .select("id")
          .eq("trip_id", this.tripId)
          .eq("client_id", item.id)
          .maybeSingle();
        if (lookup.error) throw lookup.error;
        remoteId = lookup.data?.id || "";
      }

      let result;
      if (remoteId) {
        result = await this.client
          .from(dbTable)
          .update(this.updateColumns(table, row))
          .eq("id", remoteId)
          .eq("trip_id", this.tripId)
          .select("*")
          .single();
      } else {
        result = await this.client.from(dbTable).insert(row).select("*").single();
        if (result.error?.code === "23505") {
          const retryLookup = await this.client
            .from(dbTable)
            .select("id")
            .eq("trip_id", this.tripId)
            .eq("client_id", item.id)
            .single();
          if (retryLookup.error) throw retryLookup.error;
          remoteId = retryLookup.data.id;
          result = await this.client
            .from(dbTable)
            .update(this.updateColumns(table, row))
            .eq("id", remoteId)
            .eq("trip_id", this.tripId)
            .select("*")
            .single();
        }
      }
      if (result.error) throw result.error;
      remoteId = result.data?.id || remoteId;
      if (remoteId) {
        this.maps[table].set(item.id, remoteId);
        if (table === "participants") this.maps.participantRemoteToLocal.set(remoteId, item.id);
        if (table === "expenses") this.maps.expenseRemoteToLocal.set(remoteId, item.id);
      }
      return result.data;
    }

    async deleteEntity(table, localId) {
      const dbTable = DB_TABLES[table];
      let query = this.client.from(dbTable).delete().eq("trip_id", this.tripId);
      const remoteId = this.maps[table].get(localId);
      query = remoteId ? query.eq("id", remoteId) : query.eq("client_id", localId);
      const { error } = await query;
      if (error) throw error;
      this.maps[table].delete(localId);
      if (remoteId && table === "participants") this.maps.participantRemoteToLocal.delete(remoteId);
      if (remoteId && table === "expenses") this.maps.expenseRemoteToLocal.delete(remoteId);
    }

    async ensureRemoteExpense(localId) {
      if (this.maps.expenses.has(localId)) return this.maps.expenses.get(localId);
      const { data, error } = await this.client
        .from("expenses")
        .select("id, client_id")
        .eq("trip_id", this.tripId)
        .eq("client_id", localId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("영수증을 연결할 지출을 찾지 못했습니다.");
      this.maps.expenses.set(localId, data.id);
      this.maps.expenseRemoteToLocal.set(data.id, localId);
      return data.id;
    }

    async uploadReceipt(entry) {
      const expenseRemoteId = await this.ensureRemoteExpense(entry.id);
      const localRecord = await this.options.getLocalReceipt?.(entry.id);
      if (!localRecord?.blob) throw new Error("이 기기에서 영수증 사진을 찾지 못했습니다.");
      let storagePath = entry.storagePath;
      if (!storagePath) {
        const fileId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        storagePath = `${this.tripId}/${expenseRemoteId}/${fileId}.jpg`;
        const queued = this.queue.find((item) => item.key === entry.key && item.version === entry.version);
        if (queued) { queued.storagePath = storagePath; this.persistQueue(); entry.storagePath = storagePath; }
      }

      const previous = this.receipts.get(entry.id);
      const upload = await this.client.storage.from(RECEIPT_BUCKET).upload(storagePath, localRecord.blob, {
        cacheControl: "3600",
        contentType: localRecord.blob.type || "image/jpeg",
        upsert: true
      });
      if (upload.error) throw upload.error;

      let metadata;
      const existing = await this.client
        .from("receipt_files")
        .select("id")
        .eq("expense_id", expenseRemoteId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      const row = {
        storage_path: storagePath,
        original_name: cleanText(localRecord.name || entry.name, 200) || "receipt.jpg",
        mime_type: localRecord.blob.type || "image/jpeg",
        size_bytes: localRecord.blob.size
      };
      if (existing.data?.id) {
        const update = await this.client
          .from("receipt_files")
          .update(row)
          .eq("id", existing.data.id)
          .select("*")
          .single();
        if (update.error) throw update.error;
        metadata = update.data;
      } else {
        const insert = await this.client
          .from("receipt_files")
          .insert({ ...row, trip_id: this.tripId, expense_id: expenseRemoteId })
          .select("*")
          .single();
        if (insert.error) throw insert.error;
        metadata = insert.data;
      }
      this.receipts.set(entry.id, metadata);
      if (previous?.storage_path && previous.storage_path !== storagePath) {
        await this.client.storage.from(RECEIPT_BUCKET).remove([previous.storage_path]).catch(() => {});
      }
    }

    async removeReceipt(localExpenseId) {
      const expenseRemoteId = this.maps.expenses.get(localExpenseId) || await this.ensureRemoteExpense(localExpenseId).catch(() => "");
      let metadata = this.receipts.get(localExpenseId);
      if (!metadata && expenseRemoteId) {
        const lookup = await this.client
          .from("receipt_files")
          .select("*")
          .eq("expense_id", expenseRemoteId)
          .maybeSingle();
        if (lookup.error) throw lookup.error;
        metadata = lookup.data;
      }
      if (metadata?.storage_path) {
        const removal = await this.client.storage.from(RECEIPT_BUCKET).remove([metadata.storage_path]);
        if (removal.error) throw removal.error;
      }
      if (metadata?.id) {
        const deletion = await this.client.from("receipt_files").delete().eq("id", metadata.id);
        if (deletion.error) throw deletion.error;
      } else if (expenseRemoteId) {
        const deletion = await this.client.from("receipt_files").delete().eq("expense_id", expenseRemoteId);
        if (deletion.error) throw deletion.error;
      }
      this.receipts.delete(localExpenseId);
    }

    async downloadReceipt(localExpenseId) {
      if (!this.isReady() || !navigator.onLine) return null;
      const expenseRemoteId = this.maps.expenses.get(localExpenseId) || await this.ensureRemoteExpense(localExpenseId).catch(() => "");
      if (!expenseRemoteId) return null;
      let metadata = this.receipts.get(localExpenseId);
      if (!metadata) {
        const lookup = await this.client
          .from("receipt_files")
          .select("*")
          .eq("expense_id", expenseRemoteId)
          .maybeSingle();
        if (lookup.error) throw lookup.error;
        metadata = lookup.data;
        if (metadata) this.receipts.set(localExpenseId, metadata);
      }
      if (!metadata?.storage_path) return null;
      const { data, error } = await this.client.storage.from(RECEIPT_BUCKET).download(metadata.storage_path);
      if (error) throw error;
      return {
        expenseId: localExpenseId,
        blob: data,
        name: metadata.original_name || "receipt.jpg",
        type: metadata.mime_type || data.type,
        updatedAt: metadata.created_at || new Date().toISOString()
      };
    }

    async fetchRaw() {
      const requests = [
        this.client.from("participants").select("*").eq("trip_id", this.tripId).order("sort_order").order("created_at"),
        this.client.from("checklist_items").select("*").eq("trip_id", this.tripId).order("sort_order").order("created_at"),
        this.client.from("itinerary_items").select("*").eq("trip_id", this.tripId).order("item_date").order("item_time").order("sort_order"),
        this.client.from("expenses").select("*").eq("trip_id", this.tripId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
        this.client.from("receipt_files").select("*").eq("trip_id", this.tripId).order("created_at", { ascending: false })
      ];
      const results = await Promise.all(requests);
      const error = results.find((result) => result.error)?.error;
      if (error) throw error;
      return {
        participants: results[0].data || [],
        checklist: results[1].data || [],
        itinerary: results[2].data || [],
        expenses: results[3].data || [],
        receipts: results[4].data || []
      };
    }

    updateMaps(raw) {
      this.maps = this.emptyMaps();
      raw.participants.forEach((row) => {
        const localId = row.client_id || `cloud-${row.id}`;
        this.maps.participants.set(localId, row.id);
        this.maps.participantRemoteToLocal.set(row.id, localId);
      });
      raw.checklist.forEach((row) => this.maps.checklist.set(row.client_id || `cloud-${row.id}`, row.id));
      raw.itinerary.forEach((row) => this.maps.itinerary.set(row.client_id || `cloud-${row.id}`, row.id));
      raw.expenses.forEach((row) => {
        const localId = row.client_id || `cloud-${row.id}`;
        this.maps.expenses.set(localId, row.id);
        this.maps.expenseRemoteToLocal.set(row.id, localId);
      });
      this.receipts = new Map();
      raw.receipts.forEach((row) => {
        const localExpenseId = this.maps.expenseRemoteToLocal.get(row.expense_id);
        if (localExpenseId && !this.receipts.has(localExpenseId)) this.receipts.set(localExpenseId, row);
      });
    }

    toShared(raw) {
      const participants = raw.participants.map((row) => ({
        id: row.client_id || `cloud-${row.id}`,
        name: row.name,
        active: row.is_active !== false,
        createdAt: row.created_at
      }));
      const checklist = raw.checklist.map((row) => {
        const participantLocalId = row.owner_participant_id
          ? this.maps.participantRemoteToLocal.get(row.owner_participant_id)
          : "";
        return {
          id: row.client_id || `cloud-${row.id}`,
          ownerId: participantLocalId ? (PARTICIPANT_TO_OWNER[participantLocalId] || "common") : "common",
          category: row.category,
          text: row.text,
          url: row.url || "",
          linkLabel: row.link_label || "",
          done: row.is_done === true
        };
      });
      const itinerary = raw.itinerary.map((row) => ({
        id: row.client_id || `cloud-${row.id}`,
        date: row.item_date,
        time: row.item_time ? String(row.item_time).slice(0, 5) : "",
        status: row.status,
        title: row.title,
        place: row.place || "",
        note: row.note || ""
      }));
      const expenses = raw.expenses.map((row) => {
        const localId = row.client_id || `cloud-${row.id}`;
        const receipt = this.receipts.get(localId);
        return {
          id: localId,
          date: row.expense_date,
          category: row.category,
          description: row.description,
          currency: row.currency,
          amountMinor: Number(row.amount_minor),
          baseAmountKRW: Number(row.base_amount_krw),
          fxRateMicros: Number(row.fx_rate_micros),
          payerId: this.maps.participantRemoteToLocal.get(row.payer_participant_id) || "",
          split: {
            mode: "equal",
            participantIds: (row.split_participant_ids || [])
              .map((id) => this.maps.participantRemoteToLocal.get(id))
              .filter(Boolean)
          },
          receiptId: receipt?.storage_path || "",
          createdAt: row.created_at
        };
      });
      return { participants, checklist, itinerary, expenses };
    }

    overlayQueue(shared) {
      const merged = copy(shared);
      this.queue.forEach((entry) => {
        if (entry.op === "upsert" && SHARED_TABLES.includes(entry.table)) {
          const items = merged[entry.table] || [];
          const index = items.findIndex((item) => item.id === entry.id);
          if (index >= 0) items[index] = copy(entry.item);
          else items.push(copy(entry.item));
          merged[entry.table] = items;
        }
        if (entry.op === "delete" && SHARED_TABLES.includes(entry.table)) {
          merged[entry.table] = (merged[entry.table] || []).filter((item) => item.id !== entry.id);
        }
        if (entry.op === "receipt-put") {
          const expense = (merged.expenses || []).find((item) => item.id === entry.id);
          if (expense) expense.receiptId = expense.receiptId || entry.id;
        }
        if (entry.op === "receipt-delete") {
          const expense = (merged.expenses || []).find((item) => item.id === entry.id);
          if (expense) expense.receiptId = "";
        }
      });
      return merged;
    }

    async refetch(silent = false) {
      if (!this.isReady() || this.refetching) return;
      this.refetching = true;
      if (!silent) this.setStatus("syncing", "다른 기기의 변경 내용을 반영하는 중");
      try {
        const raw = await this.fetchRaw();
        this.updateMaps(raw);
        const shared = this.overlayQueue(this.toShared(raw));
        this.lastShared = copy(shared);
        this.applyRemote = true;
        await this.options.applySharedState?.(shared);
        this.applyRemote = false;
        this.setStatus(this.queue.length ? "syncing" : "synced");
      } catch (error) {
        this.applyRemote = false;
        console.warn("공용 데이터를 불러오지 못했습니다.", error);
        this.setStatus(navigator.onLine ? "error" : "offline", formatError(error));
        throw error;
      } finally {
        this.refetching = false;
      }
    }

    scheduleRefetch() {
      window.clearTimeout(this.refetchTimer);
      this.refetchTimer = window.setTimeout(() => {
        if (this.flushing) this.scheduleRefetch();
        else this.refetch().catch(() => {});
      }, 260);
    }

    subscribeRealtime() {
      if (!this.isReady()) return;
      if (this.channel) this.client.removeChannel(this.channel);
      let channel = this.client.channel(`trip-shared-${this.tripId}`);
      ["participants", "checklist_items", "itinerary_items", "expenses", "receipt_files"].forEach((table) => {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => this.scheduleRefetch());
      });
      this.channel = channel.subscribe((status) => {
        if (status === "SUBSCRIBED") this.setStatus(this.queue.length ? "syncing" : "synced");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") this.setStatus(navigator.onLine ? "error" : "offline");
      });
    }

    async handleOnline() {
      if (!this.client) return;
      this.setStatus("connecting", "공용 저장 연결을 다시 확인하는 중");
      if (this.needsReconnect || !this.trip || !this.isReady()) {
        try {
          const { data, error } = await this.client.auth.getSession();
          if (error) throw error;
          this.userId = data.session?.user?.id || "";
          if (!this.userId) {
            this.tripId = "";
            this.trip = null;
            this.queue = [];
            this.needsReconnect = false;
            this.requireJoin(true);
            return;
          }
          const membership = await this.findMembership();
          if (!membership) {
            this.tripId = "";
            this.trip = null;
            this.queue = [];
            this.needsReconnect = false;
            this.requireJoin(true);
            return;
          }
          await this.connectTrip(membership.trip_id, membership.role);
          return;
        } catch (error) {
          this.needsReconnect = true;
          this.setStatus(navigator.onLine ? "error" : "offline", formatError(error));
          return;
        }
      }
      await this.flush(false);
      await this.refetch(true).catch(() => {});
      if (!this.queue.length) this.setStatus("synced");
    }
  }

  globalThis.TripCloudSync = {
    create(options) { return new CloudSync(options); },
    isConfigured() { return Boolean(readConfig()); }
  };
})();
