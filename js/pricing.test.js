import assert from "node:assert/strict";
import test from "node:test";
import {
  LAUNDRY_DOUBLE_UNTIL,
  MIN_ORDER,
  PALLET,
  TRUCK_PALLETS,
  describeQuote,
  formatNumber,
  innError,
  isValidInn,
  laundryDoubleActive,
  linesLaundryMode,
  mixCompositionError,
  orderLinesError,
  quote,
  requestLaundryMode,
} from "./pricing.js";

const NOW = new Date("2026-11-22T12:00:00+03:00");

test("логистика зафиксирована правилами отгрузки", () => {
  assert.equal(MIN_ORDER, 50);
  assert.equal(PALLET, 100);
  assert.equal(TRUCK_PALLETS, 127);
  assert.equal(PALLET * TRUCK_PALLETS, 12700);
});

test("уровни и хвост", () => {
  assert.equal(quote(0).state, "empty");
  assert.equal(quote(49).state, "too-small");
  assert.equal(quote(40).state, "too-small");
  assert.equal(quote(50).tier, "small");
  assert.equal(quote(99).tier, "small");
  assert.equal(quote(100).tier, "pallet");
  assert.equal(quote(149).state, "bad-tail");
  assert.equal(quote(150).tier, "pallet");
  assert.equal(quote(150).loose, 50);
  assert.equal(quote(350).pallets, 3);
  assert.equal(quote(499).tier, "pallet");
  assert.equal(quote(500).tier, "wholesale");
  assert.equal(quote(550).tier, "wholesale");
  assert.equal(quote(530).state, "bad-tail");
  assert.equal(quote(12650).tier, "wholesale");
  assert.equal(quote(12700).tier, "truck");
  assert.equal(quote(12700).fullTrucks, 1);
  assert.equal(quote(12700).leftover, 0);
  assert.equal(quote(12750).tier, "truck");
  assert.equal(quote(12749).state, "bad-tail");
  assert.equal(quote(25400).fullTrucks, 2);
  assert.equal(quote("1 50").n, 150);
});

test("первый заказ не складывается с бонусом, фура идёт договором", () => {
  const first = describeQuote(350, { firstOrder: true, now: NOW });
  assert.match(first.bonus, /−7%/);
  assert.match(first.bonus, /2%/);
  assert.match(first.bonus, /не начисляется/);

  const second = describeQuote(350, { firstOrder: false, now: NOW });
  assert.match(second.bonus, /2%/);
  assert.doesNotMatch(second.bonus, /−7%/);

  const laundry = describeQuote(350, { firstOrder: false, laundryMode: "all", now: NOW });
  assert.match(laundry.bonus, /4%/);

  const wholesale = describeQuote(500, { firstOrder: false, now: NOW });
  assert.match(wholesale.bonus, /3%/);
  assert.match(wholesale.bonus, /приоритет/);

  const truck = describeQuote(12700, { firstOrder: true, laundryMode: "all", now: NOW });
  assert.match(truck.bonus, /договор/);
  assert.match(truck.bonus, /не ставятся/);
  assert.doesNotMatch(truck.bonus, /[246]%/);
  assert.equal(truck.detail.includes(formatNumber(1)), true);

  const truckSecond = describeQuote(12750, { firstOrder: false, laundryMode: "all", now: NOW });
  assert.equal(truckSecond.tier, "truck");
  assert.equal(truckSecond.loose, 50);
  assert.match(truckSecond.bonus, /договор/);
  assert.doesNotMatch(truckSecond.bonus, /[246]%/);
});

test("микс только полными палетами", () => {
  assert.match(describeQuote(50, { mix: true, now: NOW }).mixText, /полной палетой/);
  assert.match(describeQuote(150, { mix: true, now: NOW }).mixText, /Хвост/);
  assert.match(describeQuote(200, { mix: true, now: NOW }).mixText, /8 позиций/);
  assert.equal(describeQuote(200, { now: NOW }).mixText, "");
});

test("двойной бонус стирки заканчивается после 31 декабря 2026", () => {
  assert.equal(laundryDoubleActive(new Date("2026-12-31T23:59:59+03:00")), true);
  assert.equal(laundryDoubleActive(new Date("2027-01-01T00:00:00+03:00")), false);
  const expired = describeQuote(100, {
    firstOrder: false,
    laundryMode: "all",
    now: new Date("2027-01-01T00:00:00+03:00"),
  });
  assert.match(expired.bonus, /действовали/);
  assert.match(expired.bonus, /2%/);
  assert.doesNotMatch(expired.bonus, /4%/);
  assert.equal(LAUNDRY_DOUBLE_UNTIL.startsWith("2026-12-31"), true);
});

test("ИНН проверяется контрольной суммой", () => {
  assert.equal(isValidInn("7707083893"), true);
  assert.equal(isValidInn("7707 083893"), true);
  assert.equal(isValidInn("7707083894"), false);
  assert.equal(isValidInn("0000000000"), false);
  assert.match(innError("123"), /10 или 12/);
  assert.match(innError("7707083894"), /контрольная сумма/);
  assert.equal(innError("7707083893"), "");
  assert.equal(isValidInn("500100732259"), true);
  assert.equal(isValidInn("000000000000"), false);
  assert.match(innError("0000000000"), /нул/);
  assert.match(innError("000000000000"), /нул/);
  assert.doesNotMatch(innError("0000000000"), /контрольная сумма/);
});

test("строки заявки: одна позиция без микса, несколько только целыми палетами", () => {
  assert.match(orderLinesError([]), /каталога/);
  assert.equal(orderLinesError([{ pieces: 130 }]), "");
  assert.equal(orderLinesError([{ pieces: 50 }, { pieces: 50 }]), "");
  assert.match(orderLinesError([{ pieces: 50 }, { pieces: 50 }, { pieces: 50 }]), /100/);
  assert.match(orderLinesError([{ pieces: 50 }, { pieces: 50 }, { pieces: 50 }]), /не хватает/);
  assert.match(orderLinesError([{ pieces: 3 }, { pieces: 97 }]), /кратна 5/);
  assert.match(orderLinesError(Array.from({ length: 9 }, () => ({ pieces: 20 }))), /8/);
  assert.equal(linesLaundryMode([{ pieces: 100, laundry: true }]), "all");
  assert.equal(linesLaundryMode([{ pieces: 40, laundry: false }]), "no");
  assert.equal(linesLaundryMode([
    { pieces: 50, laundry: true },
    { pieces: 50, laundry: false },
  ]), "part");
  assert.equal(linesLaundryMode([]), "no");
});

test("в миксе ×2 относится только к позициям стирки", () => {
  const first = describeQuote(100, { mix: true, firstOrder: true, laundryMode: "part", registered: true, now: NOW });
  assert.match(first.bonus, /только к позициям стирки/);
  assert.match(first.mixText, /8 позиций/);
  const second = describeQuote(100, { mix: true, firstOrder: false, laundryMode: "part", registered: true, now: NOW });
  assert.match(second.bonus, /только к позициям стирки/);
  assert.doesNotMatch(second.bonus, /−7%/);
});

test("микс — 2–8 позиций, шаг 5, сумма 100", () => {
  assert.equal(mixCompositionError("Гель для посуды — 60, ополаскиватель — 40"), "");
  assert.equal(mixCompositionError("порошок 50, гель 30, кондиционер 20"), "");
  assert.match(mixCompositionError("abc"), /2 до 8/);
  assert.match(mixCompositionError("только гель — 100"), /2 до 8/);
  assert.match(mixCompositionError("гель — 60, ополаскиватель — 30"), /100/);
  assert.match(mixCompositionError("гель — 51, ополаскиватель — 49"), /шаг 5/);
  assert.equal(requestLaundryMode("sredstva-dlya-stirki"), "all");
  assert.equal(requestLaundryMode("sredstva-dlya-posudy"), "no");
});
