export const MIN_ORDER = 50;
export const PALLET = 100;
export const TRUCK_PALLETS = 127;
export const LAUNDRY_DOUBLE_UNTIL = "2026-12-31T23:59:59+03:00";

const LAUNDRY_DOUBLE_END = Date.parse(LAUNDRY_DOUBLE_UNTIL);
const RATES = { small: 1, pallet: 2, wholesale: 3 };

const TIER_COPY = {
  small: { title: "Мелкий опт", price: "Базовая оптовая цена" },
  pallet: { title: "Палета", price: "Цена палеты, ниже мелкого опта" },
  wholesale: { title: "Опт", price: "Цена опта" },
  truck: { title: "Фура", price: "Цена и отсрочка в договоре" },
};

export function formatNumber(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "−" : "";
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

export function laundryDoubleActive(now = new Date()) {
  return now.getTime() <= LAUNDRY_DOUBLE_END;
}

function controlDigit(coeffs, digits) {
  const sum = coeffs.reduce((acc, coeff, index) => acc + coeff * digits[index], 0);
  return (sum % 11) % 10;
}

export function normalizeInn(value) {
  return String(value ?? "").replace(/[\s-]/g, "");
}

export function isValidInn(value) {
  const inn = normalizeInn(value);
  if (!/^\d{10}$|^\d{12}$/.test(inn) || /^0+$/.test(inn)) return false;
  const digits = [...inn].map(Number);
  if (digits.length === 10) {
    return controlDigit([2, 4, 10, 3, 5, 9, 4, 6, 8], digits) === digits[9];
  }
  const eleventh = controlDigit([7, 2, 4, 10, 3, 5, 9, 4, 6, 8], digits);
  const twelfth = controlDigit([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], digits);
  return eleventh === digits[10] && twelfth === digits[11];
}

export function innError(value) {
  const inn = normalizeInn(value);
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return "ИНН — 10 или 12 цифр.";
  if (/^0+$/.test(inn)) return "ИНН не может состоять из нулей.";
  if (!isValidInn(inn)) return "Проверьте ИНН: контрольная сумма не сходится.";
  return "";
}

const MIX_HINT = "Для микса напишите состав: от 2 до 8 позиций, шаг 5, сумма 100 на палету.";

export function mixCompositionError(comment) {
  const parts = String(comment ?? "")
    .trim()
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 8) return MIX_HINT;
  let sum = 0;
  for (const part of parts) {
    const numbers = part.match(/\d+/g);
    const qty = numbers ? Number(numbers[numbers.length - 1]) : NaN;
    if (!Number.isInteger(qty) || qty < 5 || qty % 5 !== 0) return MIX_HINT;
    sum += qty;
  }
  if (sum !== PALLET) return MIX_HINT;
  return "";
}

function assertNever(value) {
  throw new Error("Неизвестный вариант: " + value);
}

function linePieces(line) {
  const pieces = line && line.pieces;
  return Number.isInteger(pieces) ? pieces : null;
}

function orderKind(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return "empty";
  if (lines.length === 1) return "single";
  return "mix";
}

function mixIssue(lines) {
  if (lines.length > 8) return { kind: "count", count: lines.length };
  const bad = lines.find((line) => {
    const pieces = linePieces(line);
    return pieces == null || pieces < 5 || pieces % 5 !== 0;
  });
  if (bad) return { kind: "step", pieces: linePieces(bad) };
  const sum = lines.reduce((total, line) => total + line.pieces, 0);
  if (sum % PALLET !== 0) return { kind: "pallet", sum, rest: sum % PALLET };
  return { kind: "ok" };
}

function mixLinesError(lines) {
  const issue = mixIssue(lines);
  switch (issue.kind) {
    case "count":
      return `В миксе от 2 до 8 позиций. Сейчас ${formatNumber(issue.count)}.`;
    case "step":
      return issue.pieces == null
        ? "В миксе каждая позиция кратна 5 и не меньше 5 штук."
        : `В миксе каждая позиция кратна 5 и не меньше 5 штук. Сейчас есть позиция на ${formatNumber(issue.pieces)} шт.`;
    case "pallet":
      return `В заявке сумма микса равна 100 на каждую палету, хвоста не бывает. Сейчас ${formatNumber(issue.sum)} шт., до ровной палеты не хватает ${formatNumber(PALLET - issue.rest)} шт.`;
    case "ok":
      return "";
    default:
      return assertNever(issue.kind);
  }
}

export function orderLinesError(lines) {
  const kind = orderKind(lines);
  switch (kind) {
    case "empty":
      return "Соберите заявку из каталога: добавьте хотя бы одну позицию.";
    case "single":
      return "";
    case "mix":
      return mixLinesError(lines);
    default:
      return assertNever(kind);
  }
}

export function linesLaundryMode(lines) {
  let total = 0;
  let laundry = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    const pieces = linePieces(line);
    if (pieces == null || pieces <= 0) continue;
    total += pieces;
    if (line.laundry) laundry += pieces;
  }
  const mode = total === 0 || laundry === 0 ? "no" : laundry === total ? "all" : "part";
  switch (mode) {
    case "no":
    case "all":
    case "part":
      return mode;
    default:
      return assertNever(mode);
  }
}

export function requestLaundryMode(categorySlug) {
  return categorySlug === "sredstva-dlya-stirki" ? "all" : "no";
}

export function quote(raw) {
  const n = Math.max(0, Math.floor(Number(String(raw).replace(/[^\d]/g, "")) || 0));
  const pallets = Math.floor(n / PALLET);
  const loose = n % PALLET;
  const fullTrucks = Math.floor(pallets / TRUCK_PALLETS);
  const leftover = pallets % TRUCK_PALLETS;
  let state = "ok";
  let tier = "small";
  if (n === 0) state = "empty";
  else if (n < MIN_ORDER) state = "too-small";
  else if (loose !== 0 && loose < MIN_ORDER) state = "bad-tail";
  else if (pallets >= TRUCK_PALLETS) tier = "truck";
  else if (n >= 500) tier = "wholesale";
  else if (n >= PALLET) tier = "pallet";

  if (state !== "ok") tier = null;
  return { n, pallets, loose, fullTrucks, leftover, state, tier };
}

function bonusText(q, options) {
  if (q.state === "empty") {
    return "После 50 штук калькулятор покажет уровень цены, скидку первого заказа и бонус.";
  }
  if (q.state === "too-small" || q.state === "bad-tail") {
    return "Скидка и бонусы считаются только для заказа, который можно собрать.";
  }
  if (q.state !== "ok") assertNever(q.state);

  switch (q.tier) {
    case "truck":
      return "Фура считается по договору: скидка −7% и бонусный процент поверх ставки не ставятся, чтобы не задвоить скидку.";
    case "small":
    case "pallet":
    case "wholesale":
      return tierBonus(q.tier, options);
    default:
      return assertNever(q.tier);
  }
}

function tierBonus(tier, { firstOrder, registered, laundryMode, laundryActive }) {
  const rate = RATES[tier];
  const doubled = rate * 2;
  const priority = tier === "wholesale" ? " Опт получает приоритет ближайшей партии." : "";
  const who = registered ? "Для вашей компании первый заказ" : "Первый заказ после регистрации";

  if (firstOrder) {
    let text = `${who}: −7%. На этот заказ ${rate}% не начисляется.${priority}`;
    if (laundryMode === "all" && laundryActive) {
      text += ` Двойные бонусы на стирку (×2, будет ${doubled}%) включатся со второго заказа, до 31 декабря 2026.`;
    } else if (laundryMode === "all") {
      text += " Срок двойных бонусов на стирку закончился 31 декабря 2026.";
    } else if (laundryMode === "part" && laundryActive) {
      text += " В миксе ×2 относится только к позициям стирки и тоже только со второго заказа.";
    } else if (laundryMode === "part") {
      text += " Срок двойных бонусов на стирку закончился 31 декабря 2026.";
    }
    return text;
  }

  if (laundryMode === "all" && laundryActive) {
    return `Со второго заказа на стирку начисляется ${doubled}% (базовые ${rate}% ×2 до 31 декабря 2026). На другие группы при таком объёме было бы ${rate}%.${priority}`;
  }
  if (laundryMode === "all") {
    return `Со второго заказа начисляется ${rate}%. Двойные бонусы на стирку действовали до 31 декабря 2026.${priority}`;
  }
  if (laundryMode === "part" && laundryActive) {
    return `Со второго заказа базовое начисление ${rate}%. До 31 декабря 2026 ×2 относится только к позициям стирки внутри микса, остальные идут с обычным процентом. Без цен это не сводится в одну цифру.${priority}`;
  }
  if (laundryMode === "part") {
    return `Со второго заказа начисляется ${rate}%. Срок двойных бонусов на стирку закончился 31 декабря 2026.${priority}`;
  }
  return `Со второго заказа на бонусный счёт начисляется ${rate}%.${priority}`;
}

function mixTextFor(q, mix) {
  if (!mix) return "";
  if (q.state === "bad-tail") {
    return "Сначала поправьте хвост. Микс собирается полными палетами по 100 штук.";
  }
  if (q.pallets < 1) {
    return "Микс собирается только полной палетой: 100 штук, от 2 позиций.";
  }
  if (q.loose !== 0) {
    return `Микс закроет ${formatNumber(q.pallets)} пал. Хвост ${formatNumber(q.loose)} шт. поедет отдельной позицией, не миксом.`;
  }
  return "Микс: от 2 до 8 позиций, каждая кратна 5 штукам, сумма 100. Сборка без доплаты, пока собираем на своём складе.";
}

function detailFor(q) {
  switch (q.state) {
    case "empty":
      return "Минимум — 50. Палета — 100. Фура — 127 палет.";
    case "too-small":
      return "Отгружаем от 50 штук.";
    case "bad-tail":
      return `Добавьте ${formatNumber(MIN_ORDER - q.loose)} шт. или оставьте ${formatNumber(q.pallets * PALLET)} шт. ровными палетами.`;
    case "ok": {
      const next = q.loose === 0
        ? "Заказ кратен палете."
        : `До следующей палеты ${formatNumber(PALLET - q.loose)} шт.`;
      const trucks = q.tier === "truck" ? `Полных фур: ${formatNumber(q.fullTrucks)}. ` : "";
      return `${TIER_COPY[q.tier].price}. ${trucks}${next}`;
    }
    default:
      return assertNever(q.state);
  }
}

function titleFor(q) {
  switch (q.state) {
    case "empty":
      return "Введите количество штук";
    case "too-small":
      return `Ещё ${formatNumber(MIN_ORDER - q.n)} шт. до минимального заказа`;
    case "bad-tail":
      return `Хвост ${formatNumber(q.loose)} шт. меньше 50`;
    case "ok":
      return TIER_COPY[q.tier].title;
    default:
      return assertNever(q.state);
  }
}

export function describeQuote(raw, options = {}) {
  const q = quote(raw);
  const mix = Boolean(options.mix);
  const firstOrder = options.firstOrder !== false;
  const registered = Boolean(options.registered);
  const laundryMode = options.laundryMode === "all" || options.laundryMode === "part" ? options.laundryMode : "no";
  const laundryActive = laundryDoubleActive(options.now);
  const tone = q.state === "too-small" || q.state === "bad-tail" ? "bad" : q.state === "ok" ? "ok" : "neutral";
  return {
    ...q,
    title: titleFor(q),
    detail: detailFor(q),
    bonus: bonusText(q, { firstOrder, registered, laundryMode, laundryActive }),
    mixText: mixTextFor(q, mix),
    tone,
  };
}
