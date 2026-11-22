import { arrivals, categories } from "../data/content.js";
import { CATEGORIES, MANAGER_EMAIL, SEGMENTS, VOLUMES } from "../data/options.js";
import { buildOrderSubmission, submissionResult } from "./order-mail.js";
import {
  describeQuote,
  formatNumber,
  innError,
  linesLaundryMode,
  normalizeInn,
  orderLinesError,
  quote,
} from "./pricing.js";

const ACCOUNT_KEY = "belizna.account.v1";
const ORDER_KEY = "belizna.order.v1";
const DRAFTS_KEY = "belizna.requests.v1";
const LAUNDRY_SLUG = "sredstva-dlya-stirki";
const LOGGED_TITLE = "Кабинет компании";

const PRODUCTS = new Map();
categories.forEach((category) => {
  category.products.forEach((product) => {
    PRODUCTS.set(product.id, {
      id: product.id,
      name: product.name,
      pack: product.pack,
      categorySlug: category.slug,
      categoryName: category.name,
    });
  });
});

const pieces = document.getElementById("pieces");
const mix = document.getElementById("mix");
const secondOrder = document.getElementById("second-order");
const laundry = document.getElementById("laundry");
const calcForm = document.getElementById("calc");

let editing = false;

function assertNever(value) {
  throw new Error("Неизвестный вариант: " + value);
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
    return localStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

function readJson(key) {
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    storageRemove(key);
    return null;
  }
}

function writeJson(key, value) {
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    return false;
  }
  return storageSet(key, json);
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function sanitizePieces(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 6);
  if (!digits) return "";
  return String(Number(digits));
}

function keepPiecesDigits(input) {
  const cleaned = sanitizePieces(input.value);
  if (cleaned === input.value) return;
  const atEnd = input.selectionStart === input.value.length;
  const start = input.selectionStart ?? cleaned.length;
  input.value = cleaned;
  const pos = atEnd ? cleaned.length : Math.min(start, cleaned.length);
  if (typeof input.setSelectionRange === "function") input.setSelectionRange(pos, pos);
}

function newDraftId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* страница открыта не в безопасном контексте */
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function labelOf(list, value) {
  const found = list.find((item) => item.value === value || item.slug === value);
  return found ? found.label || found.name : "";
}

function loggedLede(account) {
  if (account.secondOrder) {
    return "Следующие заявки считаются как второй заказ: бонус вместо скидки 7%. Это пометка в браузере, не статус у поставщика.";
  }
  return "Следующая заявка считается первой: скидка 7%, кроме фуры и квартальной фиксации. Это пометка в браузере, не статус у поставщика.";
}

function accountRecord(account) {
  return {
    company: account.company,
    inn: account.inn,
    person: account.person,
    phone: account.phone,
    email: account.email,
    segment: account.segment,
    volume: account.volume,
    comment: account.comment,
    registeredAt: account.registeredAt,
    secondOrder: account.secondOrder === true,
  };
}

function readAccount() {
  const data = readJson(ACCOUNT_KEY);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (registrationErrorsFromFields(data, false).length) return null;
  return {
    company: asText(data.company).trim(),
    inn: normalizeInn(data.inn),
    person: asText(data.person).trim(),
    phone: asText(data.phone).trim(),
    email: asText(data.email).trim(),
    segment: asText(data.segment),
    volume: asText(data.volume),
    comment: asText(data.comment).trim(),
    registeredAt: asText(data.registeredAt),
    secondOrder: data.secondOrder === true,
  };
}

function mergeLines(lines) {
  const merged = [];
  if (!Array.isArray(lines)) return merged;
  for (const line of lines) {
    if (!line || typeof line.productId !== "string") continue;
    const productId = line.productId.trim();
    if (!productId || productId.length > 80) continue;
    if (!Number.isInteger(line.pieces) || line.pieces < 1 || line.pieces > 999999) continue;
    const found = merged.find((item) => item.productId === productId);
    if (found) found.pieces = Math.min(999999, found.pieces + line.pieces);
    else merged.push({ productId, pieces: line.pieces });
  }
  return merged;
}

function readOrder() {
  const data = readJson(ORDER_KEY);
  if (!data || typeof data !== "object" || Array.isArray(data)) return { lines: [], comment: "" };
  return {
    lines: mergeLines(data.lines),
    comment: asText(data.comment).slice(0, 1000),
  };
}

function writeOrder(order) {
  return writeJson(ORDER_KEY, {
    lines: order.lines.map((line) => ({ productId: line.productId, pieces: line.pieces })),
    comment: asText(order.comment).slice(0, 1000),
  });
}

function isLineList(lines) {
  return Array.isArray(lines) && lines.length > 0 && lines.every((line) => (
    line
    && typeof line.productId === "string"
    && line.productId.length > 0
    && line.productId.length <= 80
    && Number.isInteger(line.pieces)
    && line.pieces >= 1
    && line.pieces <= 999999
  ));
}

function readDrafts() {
  const data = readJson(DRAFTS_KEY);
  if (!Array.isArray(data)) return [];
  return data.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (typeof item.id !== "string" || !item.id) return false;
    if (item.comment != null && typeof item.comment !== "string") return false;
    if (item.title != null && typeof item.title !== "string") return false;
    if (Array.isArray(item.lines)) return isLineList(item.lines);
    if (!Number.isInteger(item.pieces) || item.pieces < 0 || item.pieces > 999999) return false;
    if (item.category != null && typeof item.category !== "string") return false;
    return true;
  });
}

function closeMobileNav() {
  const menu = document.querySelector(".mobile-nav");
  if (!menu) return;
  menu.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !target.closest("a")) return;
    window.setTimeout(() => {
      menu.open = false;
    }, 0);
  });
}

function renderCalc() {
  if (!pieces || !calcForm) return;
  const described = describeQuote(pieces.value, {
    mix: Boolean(mix && mix.checked),
    firstOrder: secondOrder ? !secondOrder.checked : true,
    registered: Boolean(readAccount()),
    laundryMode: laundry && laundry.checked ? "all" : "no",
  });
  const title = document.getElementById("calc-title");
  const detail = document.getElementById("calc-detail");
  const bonus = document.getElementById("calc-bonus");
  const mixLine = document.getElementById("calc-mix");
  const result = document.getElementById("calc-result");
  if (title) title.textContent = described.title;
  if (detail) detail.textContent = described.detail;
  if (bonus) bonus.textContent = described.bonus;
  if (result) result.className = described.tone === "bad" ? "calc-result calc-result-bad" : "calc-result";
  const pallets = document.getElementById("m-pallets");
  const loose = document.getElementById("m-loose");
  const trucks = document.getElementById("m-trucks");
  const left = document.getElementById("m-left");
  if (pallets) pallets.textContent = formatNumber(described.pallets);
  if (loose) loose.textContent = formatNumber(described.loose);
  if (trucks) trucks.textContent = formatNumber(described.fullTrucks);
  if (left) left.textContent = formatNumber(described.leftover);
  calcForm.querySelectorAll("[data-chip]").forEach((button) => {
    if (button.getAttribute("data-chip") === String(described.n)) button.setAttribute("data-active", "true");
    else button.removeAttribute("data-active");
  });
  if (mixLine) {
    mixLine.hidden = !described.mixText;
    mixLine.textContent = described.mixText;
  }
}

function initCalc() {
  if (!pieces || !calcForm) return;
  calcForm.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const stepButton = target.closest("[data-step]");
    const chipButton = target.closest("[data-chip]");
    if (stepButton && calcForm.contains(stepButton)) {
      const step = Number(stepButton.getAttribute("data-step"));
      if (!Number.isFinite(step)) return;
      const next = Math.max(0, Math.min(999999, quote(pieces.value).n + step));
      pieces.value = String(next);
      renderCalc();
      return;
    }
    if (chipButton && calcForm.contains(chipButton)) {
      pieces.value = sanitizePieces(chipButton.getAttribute("data-chip") || "");
      renderCalc();
    }
  });
  pieces.addEventListener("input", () => {
    keepPiecesDigits(pieces);
    renderCalc();
  });
  [mix, secondOrder, laundry].forEach((input) => {
    if (input) input.addEventListener("change", renderCalc);
  });
  calcForm.addEventListener("submit", (event) => event.preventDefault());
  renderCalc();
}

function field(name) {
  return document.querySelector(`[name="${name}"]`);
}

function setInvalid(names) {
  ["company", "inn", "person", "phone", "email", "segment", "volume", "consent", "comment"].forEach((name) => {
    const input = field(name);
    if (input) input.setAttribute("aria-invalid", names.has(name) ? "true" : "false");
  });
}

function showAlert(id, messages) {
  const box = document.getElementById(id);
  if (!box) return;
  if (!messages.length) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = messages.join(" ");
}

function showFormAlert(form, message) {
  const box = form.querySelector(".form-alert");
  if (!box) return;
  if (!message) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = message;
}

function clearOrderStatus() {
  const status = document.getElementById("order-status");
  if (status) status.textContent = "";
}

function registrationErrorsFromFields(fields, requireConsent) {
  const errors = [];
  const company = asText(fields.company).trim();
  const person = asText(fields.person).trim();
  const phone = asText(fields.phone);
  const email = asText(fields.email).trim();
  const comment = asText(fields.comment).trim();
  const segment = asText(fields.segment);
  const volume = asText(fields.volume);
  if (company.length < 2 || company.length > 200) errors.push(["company", "Укажите название компании."]);
  const innMessage = innError(fields.inn);
  if (innMessage) errors.push(["inn", innMessage]);
  if (person.length < 2 || person.length > 120) errors.push(["person", "Укажите контактное лицо."]);
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15 || phone.length > 40) errors.push(["phone", "Нужен телефон из 10–15 цифр."]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) errors.push(["email", "Проверьте адрес почты."]);
  if (!SEGMENTS.some((item) => item.value === segment)) errors.push(["segment", "Выберите, кто заказывает."]);
  if (!VOLUMES.some((item) => item.value === volume)) errors.push(["volume", "Выберите ожидаемый объём."]);
  if (comment.length > 1000) errors.push(["comment", "Комментарий длиннее 1000 знаков."]);
  if (requireConsent && !fields.consent) errors.push(["consent", "Нужно согласие, чтобы сохранить заявку в этом браузере."]);
  return errors;
}

function registrationErrors(data) {
  return registrationErrorsFromFields({
    company: data.get("company"),
    inn: data.get("inn"),
    person: data.get("person"),
    phone: data.get("phone"),
    email: data.get("email"),
    segment: data.get("segment"),
    volume: data.get("volume"),
    comment: data.get("comment"),
    consent: data.get("consent"),
  }, true);
}

function fillAccountForm(account) {
  const form = document.getElementById("register");
  if (!form) return;
  ["company", "inn", "person", "phone", "email", "segment", "volume", "comment"].forEach((name) => {
    const input = form.elements.namedItem(name);
    if (input && "value" in input) input.value = account[name] || "";
  });
  const consent = form.elements.namedItem("consent");
  if (consent && "checked" in consent) consent.checked = true;
}

function renderAccount(account, focus) {
  const accountEl = document.getElementById("account");
  if (!accountEl) return;
  accountEl.replaceChildren();
  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "Кабинет открыт в этом браузере";
  const heading = document.createElement("h3");
  heading.id = "account-heading";
  heading.tabIndex = -1;
  heading.textContent = account.company;
  const list = document.createElement("dl");
  list.className = "account-list";
  const rows = [
    ["ИНН", account.inn],
    ["Контакт", account.person],
    ["Телефон", account.phone],
    ["Почта", account.email],
    ["Сегмент", labelOf(SEGMENTS, account.segment)],
    ["Ожидаемый объём", labelOf(VOLUMES, account.volume)],
  ];
  if (account.comment) rows.push(["Комментарий", account.comment]);
  rows.forEach(([title, value]) => {
    const wrap = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = title;
    const desc = document.createElement("dd");
    desc.textContent = value;
    wrap.append(term, desc);
    list.append(wrap);
  });
  const note = document.createElement("p");
  note.className = "sample-note";
  note.textContent = account.segment === "social"
    ? "Для социального учреждения квартальная цена фиксируется договором и заменяет скидку на позиции, которые в него вошли. Заявка на сервер не отправляется."
    : "Заявка хранится в этом браузере и на сервер не отправляется.";
  const actions = document.createElement("div");
  actions.className = "actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "btn btn-ghost";
  edit.textContent = "Исправить данные";
  edit.addEventListener("click", () => {
    const current = readAccount();
    if (current) startEdit(current);
  });
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "btn btn-ghost";
  logout.textContent = "Стереть данные этого браузера";
  logout.addEventListener("click", eraseBrowserData);
  actions.append(edit, logout);
  accountEl.append(kicker, heading, list, note, actions);
  accountEl.hidden = false;
  if (focus) heading.focus();
}

function eraseBrowserData() {
  const confirmed = window.confirm("Стереть компанию, заявку и черновики в этом браузере?");
  if (!confirmed) return;
  const accountGone = storageRemove(ACCOUNT_KEY);
  const orderGone = storageRemove(ORDER_KEY);
  const draftsGone = storageRemove(DRAFTS_KEY);
  if (!accountGone || !orderGone || !draftsGone) {
    showAlert("order-alert", ["Браузер не дал стереть данные в этом устройстве."]);
    editing = false;
    paint({ resetForm: !readAccount() });
    return;
  }
  editing = false;
  showAlert("order-alert", []);
  showAlert("form-alert", []);
  paint({ resetForm: true });
  renderCalc();
}

function startEdit(account) {
  editing = true;
  fillAccountForm(account);
  showAlert("form-alert", []);
  setInvalid(new Set());
  paint();
  const company = field("company");
  if (company) company.focus();
}

function cancelEdit() {
  editing = false;
  showAlert("form-alert", []);
  setInvalid(new Set());
  paint();
}

function paint({ resetForm = false, focusAccount = false } = {}) {
  const account = readAccount();
  const form = document.getElementById("register");
  if (!form) return;
  if (!account) editing = false;
  const title = document.getElementById("cabinet-title");
  const lede = document.getElementById("cabinet-lede");
  const submit = document.getElementById("register-submit");
  const cancel = document.getElementById("cancel-edit");
  if (account && !editing) {
    form.hidden = true;
    if (cancel) cancel.hidden = true;
    if (submit) submit.textContent = "Зарегистрировать компанию";
    if (title) title.textContent = LOGGED_TITLE;
    if (lede) lede.textContent = loggedLede(account);
    renderAccount(account, focusAccount);
  } else if (account && editing) {
    form.hidden = false;
    if (cancel) cancel.hidden = false;
    if (submit) submit.textContent = "Сохранить изменения";
    if (title) title.textContent = "Правка данных компании";
    if (lede) lede.textContent = loggedLede(account);
    renderAccount(account, false);
  } else {
    form.hidden = false;
    if (cancel) cancel.hidden = true;
    if (submit) submit.textContent = "Зарегистрировать компанию";
    const accountEl = document.getElementById("account");
    if (accountEl) {
      accountEl.hidden = true;
      accountEl.replaceChildren();
    }
    if (title && title.dataset.default) title.textContent = title.dataset.default;
    if (lede && lede.dataset.default) lede.textContent = lede.dataset.default;
    if (resetForm) form.reset();
    setInvalid(new Set());
  }
  renderSecond(account);
  renderOrderLines();
  syncComment();
  renderOrderQuote();
  renderDrafts();
  renderCalc();
  renderAddStatus();
}

function onRegister(event) {
  event.preventDefault();
  const form = document.getElementById("register");
  if (!form) return;
  const data = new FormData(form);
  const errors = registrationErrors(data);
  setInvalid(new Set(errors.map(([name]) => name)));
  showAlert("form-alert", errors.map(([, message]) => message));
  if (errors.length) {
    const first = field(errors[0][0]);
    if (first) first.focus();
    return;
  }
  const previous = readAccount();
  const account = accountRecord({
    company: String(data.get("company")).trim(),
    inn: normalizeInn(data.get("inn")),
    person: String(data.get("person")).trim(),
    phone: String(data.get("phone")).trim(),
    email: String(data.get("email")).trim(),
    segment: String(data.get("segment")),
    volume: String(data.get("volume")),
    comment: String(data.get("comment") || "").trim(),
    registeredAt: editing && previous ? previous.registeredAt : new Date().toISOString(),
    secondOrder: editing && previous ? previous.secondOrder === true : false,
  });
  if (!writeJson(ACCOUNT_KEY, account)) {
    showAlert("form-alert", ["Браузер не дал сохранить кабинет. Проверьте, что хранилище сайта не заблокировано."]);
    return;
  }
  editing = false;
  showAlert("form-alert", []);
  paint({ focusAccount: true });
}

function pendingArrivals(productId, now = new Date()) {
  return arrivals
    .filter((item) => {
      if (item.productId !== productId) return false;
      const end = Date.parse(`${item.iso}T23:59:59+03:00`);
      return Number.isFinite(end) && now.getTime() <= end;
    })
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

function formatArrivalDate(iso) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${iso}T12:00:00+03:00`));
}

function lineLabel(line) {
  const product = PRODUCTS.get(line.productId);
  const name = product ? product.name : "Позиция снята с каталога";
  return `${name} — ${formatNumber(line.pieces)} шт.`;
}

function orderQuote(order, account) {
  if (!order.lines.length) {
    return {
      title: "В заявке пока нет позиций",
      detail: "Заявку собирают из каталога.",
      metrics: "",
      bonus: "",
      mix: "",
      bad: false,
      described: null,
      mixError: "",
    };
  }
  const enriched = order.lines.map((line) => {
    const product = PRODUCTS.get(line.productId);
    return {
      pieces: line.pieces,
      laundry: Boolean(product && product.categorySlug === LAUNDRY_SLUG),
    };
  });
  const mixError = order.lines.length > 1 ? orderLinesError(order.lines) : "";
  const described = describeQuote(order.lines.reduce((sum, line) => sum + line.pieces, 0), {
    mix: order.lines.length > 1 && !mixError,
    firstOrder: !(account && account.secondOrder),
    registered: Boolean(account),
    laundryMode: linesLaundryMode(enriched),
  });
  return {
    title: described.title,
    detail: described.detail,
    metrics: `Палет ${formatNumber(described.pallets)}. Хвост ${formatNumber(described.loose)} шт. Полных фур ${formatNumber(described.fullTrucks)}.`,
    bonus: mixError ? "" : described.bonus,
    mix: mixError || described.mixText,
    bad: described.tone === "bad" || Boolean(mixError),
    described,
    mixError,
  };
}

function renderOrderQuote() {
  const box = document.getElementById("order-quote");
  if (!box) return;
  const view = orderQuote(readOrder(), readAccount());
  const title = document.getElementById("order-title");
  const detail = document.getElementById("order-detail");
  const metrics = document.getElementById("order-metrics");
  const bonus = document.getElementById("order-bonus");
  const mixLine = document.getElementById("order-mix");
  if (title) title.textContent = view.title;
  if (detail) detail.textContent = view.detail;
  if (metrics) metrics.textContent = view.metrics;
  if (bonus) bonus.textContent = view.bonus;
  if (mixLine) {
    mixLine.hidden = !view.mix;
    mixLine.textContent = view.mix;
  }
  box.className = view.bad ? "calc-result calc-result-bad" : "calc-result";
}

function syncComment() {
  const comment = document.getElementById("order-comment");
  if (!comment || document.activeElement === comment) return;
  comment.value = readOrder().comment;
}

function renderOrderLines() {
  const list = document.getElementById("order-lines");
  if (!list) return;
  const order = readOrder();
  list.replaceChildren();
  if (!order.lines.length) {
    const empty = document.createElement("li");
    empty.textContent = "Заявку собирают из каталога: откройте позицию, укажите штуки и нажмите «В заявку».";
    list.append(empty);
    return;
  }
  order.lines.forEach((line) => {
    const product = PRODUCTS.get(line.productId);
    const nameText = product ? product.name : "Позиция снята с каталога";
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = nameText;
    const pack = document.createElement("span");
    pack.textContent = product ? product.pack : line.productId;
    item.append(name, pack);
    if (product) {
      const group = document.createElement("span");
      group.textContent = product.categoryName;
      item.append(group);
    }
    const edit = document.createElement("div");
    edit.className = "line-edit";
    const label = document.createElement("label");
    label.className = "field";
    const input = document.createElement("input");
    input.className = "field-input";
    input.inputMode = "numeric";
    input.maxLength = 6;
    input.autocomplete = "off";
    input.value = String(line.pieces);
    input.setAttribute("aria-label", `Штук, ${nameText}`);
    label.append(document.createTextNode("Штук"), input);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost";
    remove.textContent = "Удалить";
    remove.setAttribute("aria-label", `Удалить ${nameText}`);
    input.addEventListener("input", () => {
      keepPiecesDigits(input);
      const cleaned = sanitizePieces(input.value);
      if (!cleaned) return;
      const current = readOrder();
      const found = current.lines.find((entry) => entry.productId === line.productId);
      if (!found) return;
      found.pieces = Number(cleaned);
      if (!writeOrder(current)) {
        showAlert("order-alert", ["Браузер не дал сохранить заявку в этом устройстве."]);
        return;
      }
      showAlert("order-alert", []);
      clearOrderStatus();
      renderOrderQuote();
      renderAddStatus();
    });
    input.addEventListener("blur", () => {
      const cleaned = sanitizePieces(input.value);
      if (cleaned && Number(cleaned) >= 1) return;
      const current = readOrder();
      current.lines = current.lines.filter((entry) => entry.productId !== line.productId);
      if (!writeOrder(current)) {
        showAlert("order-alert", ["Браузер не дал сохранить заявку в этом устройстве."]);
        return;
      }
      showAlert("order-alert", []);
      clearOrderStatus();
      renderOrderLines();
      renderOrderQuote();
      renderAddStatus();
    });
    remove.addEventListener("click", () => {
      const current = readOrder();
      current.lines = current.lines.filter((entry) => entry.productId !== line.productId);
      if (!writeOrder(current)) {
        showAlert("order-alert", ["Браузер не дал сохранить заявку в этом устройстве."]);
        return;
      }
      showAlert("order-alert", []);
      clearOrderStatus();
      renderOrderLines();
      renderOrderQuote();
      renderAddStatus();
    });
    edit.append(label, remove);
    item.append(edit);
    pendingArrivals(line.productId).forEach((arrival) => {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = `Партия ${formatArrivalDate(arrival.iso)}: ${formatNumber(arrival.qty)} шт.`;
      item.append(note);
    });
    list.append(item);
  });
}

function renderSecond(account) {
  const note = document.getElementById("second-order-note");
  const button = document.getElementById("toggle-second");
  if (!note || !button) return;
  if (!account) {
    note.hidden = true;
    button.hidden = true;
    return;
  }
  note.hidden = false;
  button.hidden = false;
  button.textContent = account.secondOrder
    ? "Считать следующую заявку первой"
    : "Считать следующие заявки как второй заказ";
}

function toggleSecondOrder() {
  const account = readAccount();
  if (!account) return;
  account.secondOrder = !account.secondOrder;
  if (!writeJson(ACCOUNT_KEY, accountRecord(account))) {
    showAlert("order-alert", ["Браузер не дал сохранить пометку в этом устройстве."]);
    return;
  }
  showAlert("order-alert", []);
  const lede = document.getElementById("cabinet-lede");
  if (lede && !editing) lede.textContent = loggedLede(account);
  renderSecond(account);
  renderOrderQuote();
}

function managerAddress() {
  const email = asText(MANAGER_EMAIL).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function orderProblems(order, view) {
  const errors = [];
  if (!order.lines.length) errors.push(orderLinesError(order.lines));
  else if (view.mixError) errors.push(view.mixError);
  else if (!view.described || view.described.state !== "ok") errors.push(view.title);
  if (order.comment.trim().length > 1000) errors.push("Комментарий длиннее 1000 знаков.");
  return errors;
}

function mailLines(order) {
  return order.lines.map((line) => {
    const product = PRODUCTS.get(line.productId);
    const arrival = pendingArrivals(line.productId)[0];
    return {
      name: product ? product.name : line.productId,
      pack: product ? product.pack : "",
      pieces: formatNumber(line.pieces),
      arrival: arrival ? `${formatArrivalDate(arrival.iso)}, ${formatNumber(arrival.qty)} шт.` : "",
    };
  });
}

function setSending(sending) {
  const button = document.getElementById("send-order");
  if (!button) return;
  button.disabled = sending;
  button.textContent = sending ? "Отправляем…" : "Отправить заявку";
}

async function sendOrder() {
  const order = readOrder();
  const account = readAccount();
  const view = orderQuote(order, account);
  const errors = orderProblems(order, view);
  const inbox = managerAddress();
  if (!account) errors.unshift("Сначала зарегистрируйте компанию: менеджеру нужны название и контакты.");
  if (!inbox) errors.push("Почта менеджера на сайте не указана, письмо отправить некуда.");
  if (errors.length) {
    showAlert("order-alert", errors);
    clearOrderStatus();
    return;
  }
  const total = order.lines.reduce((sum, line) => sum + line.pieces, 0);
  const submission = buildOrderSubmission({
    account: {
      company: account.company,
      inn: account.inn,
      person: account.person,
      phone: account.phone,
      email: account.email,
      segment: labelOf(SEGMENTS, account.segment),
      volume: labelOf(VOLUMES, account.volume),
      comment: account.comment,
      secondOrder: account.secondOrder === true,
    },
    lines: mailLines(order),
    comment: order.comment.trim(),
    summary: {
      headline: `${formatNumber(total)} шт, ${view.title}`,
      title: view.title,
      detail: view.detail,
      metrics: view.metrics,
      bonus: view.bonus,
      mix: view.mix,
    },
  });
  setSending(true);
  showAlert("order-alert", []);
  clearOrderStatus();
  try {
    const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(inbox)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _subject: submission.subject,
        _template: "table",
        _captcha: "false",
        _replyto: account.email,
        email: account.email,
        ...submission.fields,
      }),
    });
    const payload = await response.json().catch(() => null);
    const result = submissionResult(payload);
    switch (result.kind) {
      case "sent":
        showAlert("order-alert", []);
        {
          const status = document.getElementById("order-status");
          if (status) status.textContent = result.message;
        }
        break;
      case "confirm":
      case "failed":
        showAlert("order-alert", [result.message]);
        break;
      default: {
        const unreachable = result.kind;
        throw new Error("Неизвестный ответ отправки: " + unreachable);
      }
    }
  } catch {
    showAlert("order-alert", ["Письмо не ушло. Проверьте интернет и попробуйте ещё раз."]);
  } finally {
    setSending(false);
  }
}

function saveDraft() {
  const order = readOrder();
  const view = orderQuote(order, readAccount());
  const errors = orderProblems(order, view);
  const comment = order.comment.trim();
  if (errors.length) {
    showAlert("order-alert", errors);
    clearOrderStatus();
    return;
  }
  const drafts = readDrafts();
  drafts.unshift({
    id: newDraftId(),
    createdAt: new Date().toISOString(),
    lines: order.lines.map((line) => ({ productId: line.productId, pieces: line.pieces })),
    comment,
    title: view.described.title,
  });
  if (!writeJson(DRAFTS_KEY, drafts.slice(0, 20))) {
    showAlert("order-alert", ["Браузер не дал сохранить черновик в этом устройстве."]);
    return;
  }
  showAlert("order-alert", []);
  const status = document.getElementById("order-status");
  if (status) status.textContent = "Черновик сохранён в этом браузере. Партию это не бронирует.";
  renderDrafts();
}

function openDraft(draft) {
  const order = {
    lines: mergeLines(draft.lines),
    comment: asText(draft.comment).trim().slice(0, 1000),
  };
  if (!writeOrder(order)) {
    showAlert("order-alert", ["Браузер не дал открыть черновик в этом устройстве."]);
    return;
  }
  showAlert("order-alert", []);
  clearOrderStatus();
  renderOrderLines();
  syncComment();
  renderOrderQuote();
  renderAddStatus();
  const heading = document.getElementById("order-heading");
  if (heading) heading.focus();
}

function draftTime(draft) {
  const time = document.createElement("time");
  const created = new Date(draft.createdAt || "");
  if (!Number.isNaN(created.getTime())) {
    time.dateTime = created.toISOString();
    time.textContent = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(created);
  }
  return time;
}

function removeDraftButton(draft) {
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn-ghost";
  remove.textContent = "Удалить черновик";
  remove.addEventListener("click", () => {
    const saved = writeJson(DRAFTS_KEY, readDrafts().filter((entry) => entry.id !== draft.id));
    if (!saved) {
      showAlert("order-alert", ["Браузер не дал удалить черновик в этом устройстве."]);
      return;
    }
    showAlert("order-alert", []);
    renderDrafts();
  });
  return remove;
}

function renderLineDraft(draft) {
  const item = document.createElement("li");
  const sum = draft.lines.reduce((total, line) => total + line.pieces, 0);
  const title = document.createElement("strong");
  title.textContent = `${asText(draft.title) || "Заявка"} · ${formatNumber(sum)} шт.`;
  const meta = document.createElement("span");
  meta.textContent = draft.lines.map(lineLabel).join(", ");
  const comment = document.createElement("span");
  comment.textContent = asText(draft.comment);
  const open = document.createElement("button");
  open.type = "button";
  open.className = "btn btn-ghost";
  open.textContent = "Открыть в заявке";
  open.addEventListener("click", () => openDraft(draft));
  item.append(title, meta, comment, draftTime(draft), open, removeDraftButton(draft));
  if (!draft.comment) comment.remove();
  return item;
}

function renderLegacyDraft(draft) {
  const item = document.createElement("li");
  const title = document.createElement("strong");
  title.textContent = `${labelOf(CATEGORIES, draft.category) || "Категория"} · ${formatNumber(draft.pieces)} шт.`;
  const metaText = `${draft.mix === true ? "Микс. " : ""}${asText(draft.title)}`.trim();
  const meta = document.createElement("span");
  meta.textContent = metaText;
  const comment = document.createElement("span");
  comment.textContent = asText(draft.comment);
  item.append(title, meta, comment, draftTime(draft), removeDraftButton(draft));
  if (!metaText) meta.remove();
  if (!draft.comment) comment.remove();
  return item;
}

function renderDraftItem(draft) {
  const kind = Array.isArray(draft.lines) ? "lines" : "legacy";
  switch (kind) {
    case "lines":
      return renderLineDraft(draft);
    case "legacy":
      return renderLegacyDraft(draft);
    default:
      return assertNever(kind);
  }
}

function renderDrafts() {
  const list = document.getElementById("drafts");
  if (!list) return;
  const drafts = readDrafts();
  list.replaceChildren();
  if (!drafts.length) {
    const empty = document.createElement("li");
    empty.textContent = "Черновиков пока нет.";
    list.append(empty);
    return;
  }
  drafts.forEach((draft) => list.append(renderDraftItem(draft)));
}

function renderAddStatus() {
  const order = readOrder();
  document.querySelectorAll("[data-order-count]").forEach((node) => {
    const id = node.getAttribute("data-order-count");
    const line = order.lines.find((item) => item.productId === id);
    node.textContent = formatNumber(line ? line.pieces : 0);
  });
}

function initAddToOrder() {
  document.querySelectorAll(".add-line").forEach((form) => {
    const input = form.querySelector('input[name="pieces"]');
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener("input", () => keepPiecesDigits(input));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const productId = form.getAttribute("data-product") || "";
      const added = Number(sanitizePieces(input.value));
      if (!PRODUCTS.has(productId)) {
        showFormAlert(form, "Этой позиции нет в каталоге.");
        return;
      }
      if (!added) {
        showFormAlert(form, "Укажите число штук.");
        input.focus();
        return;
      }
      const order = readOrder();
      const found = order.lines.find((line) => line.productId === productId);
      const next = (found ? found.pieces : 0) + added;
      if (next > 999999) {
        showFormAlert(form, "В заявке не больше 999999 штук одной позиции.");
        return;
      }
      if (found) found.pieces = next;
      else order.lines.push({ productId, pieces: added });
      if (!writeOrder(order)) {
        showFormAlert(form, "Браузер не дал сохранить заявку в этом устройстве.");
        return;
      }
      showFormAlert(form, "");
      renderAddStatus();
      if (document.getElementById("order-lines")) {
        renderOrderLines();
        renderOrderQuote();
      }
    });
  });
  renderAddStatus();
}

function initCabinet() {
  const form = document.getElementById("register");
  if (!form) return;
  const title = document.getElementById("cabinet-title");
  const lede = document.getElementById("cabinet-lede");
  if (title) title.dataset.default = title.textContent;
  if (lede) lede.dataset.default = lede.textContent;
  const cancel = document.getElementById("cancel-edit");
  if (cancel) cancel.addEventListener("click", cancelEdit);
  const save = document.getElementById("save-draft");
  if (save) save.addEventListener("click", saveDraft);
  const send = document.getElementById("send-order");
  if (send) send.addEventListener("click", sendOrder);
  const toggle = document.getElementById("toggle-second");
  if (toggle) toggle.addEventListener("click", toggleSecondOrder);
  const comment = document.getElementById("order-comment");
  if (comment) {
    comment.addEventListener("input", () => {
      const order = readOrder();
      order.comment = comment.value.slice(0, 1000);
      if (!writeOrder(order)) {
        showAlert("order-alert", ["Браузер не дал сохранить заявку в этом устройстве."]);
        return;
      }
      showAlert("order-alert", []);
      clearOrderStatus();
    });
  }
  form.addEventListener("submit", onRegister);
  paint();
}

closeMobileNav();
initCalc();
initAddToOrder();
initCabinet();
