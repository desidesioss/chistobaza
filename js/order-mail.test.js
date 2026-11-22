import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderSubmission, submissionResult } from "./order-mail.js";

const submission = buildOrderSubmission({
  account: {
    company: "ООО Река",
    inn: "7707083893",
    person: "Анна Смирнова",
    phone: "84951234567",
    email: "buyer@example.com",
    segment: "Отель",
    volume: "1–4 палеты",
    comment: "",
    secondOrder: false,
  },
  lines: [
    { name: "Порошок для белого белья", pack: "Мешок 15 кг", pieces: "50", arrival: "6 декабря 2026, 3 000 шт." },
    { name: "Гель для ручной мойки", pack: "Канистра 5 л", pieces: "50", arrival: "" },
  ],
  comment: "На склад отеля",
  summary: {
    headline: "100 шт, палета",
    title: "Палета",
    detail: "Цена палеты.",
    metrics: "Палет 1. Хвост 0 шт.",
    bonus: "В миксе ×2 относится только к позициям стирки.",
    mix: "Микс: от 2 до 8 позиций.",
  },
});

test("письмо менеджеру — таблица с компанией и позициями", () => {
  assert.equal(submission.subject, "Заявка «Чистобаза» — ООО Река — 100 шт, палета");
  assert.equal(submission.fields.Компания, "ООО Река");
  assert.equal(submission.fields.ИНН, "7707083893");
  assert.equal(submission.fields.Почта, "buyer@example.com");
  assert.match(submission.fields.Позиции, /1\. Порошок для белого белья, Мешок 15 кг — 50 шт\./);
  assert.match(submission.fields.Позиции, /Партия: 6 декабря 2026/);
  assert.match(submission.fields.Позиции, /2\. Гель для ручной мойки/);
  assert.match(submission.fields.Условия, /только к позициям стирки/);
  assert.equal(submission.fields["Комментарий к заявке"], "На склад отеля");
  assert.equal(submission.fields.Расчёт, "Первая заявка");
  assert.equal(submission.fields["Комментарий компании"], "Нет");
});

test("вторая заявка подписана в теме расчёта", () => {
  const second = buildOrderSubmission({
    account: {
      company: "Прачечная",
      inn: "1",
      person: "Иван",
      phone: "1",
      email: "a@b.co",
      segment: "Прачечная",
      volume: "фура",
      comment: "Ночная смена",
      secondOrder: true,
    },
    lines: [{ name: "Порошок", pack: "", pieces: "100", arrival: "" }],
    comment: "",
    summary: { headline: "", title: "Палета", detail: "", metrics: "", bonus: "", mix: "" },
  });
  assert.equal(second.subject, "Заявка «Чистобаза» — Прачечная");
  assert.equal(second.fields.Расчёт, "Вторая заявка и дальше");
  assert.equal(second.fields["Комментарий компании"], "Ночная смена");
  assert.equal(second.fields["Комментарий к заявке"], "Нет");
  assert.match(second.fields.Позиции, /1\. Порошок — 100 шт\./);
  assert.equal(second.fields.Условия, "Без дополнительной пометки");
});

test("ответ сервиса отличает отправку, подтверждение адреса и сбой", () => {
  assert.equal(submissionResult({ success: true }).kind, "sent");
  assert.equal(submissionResult({ success: "true" }).kind, "sent");
  assert.equal(submissionResult({ success: "false", message: "This form needs Activation." }).kind, "confirm");
  assert.match(submissionResult({ success: false, message: "Activation link sent" }).message, /Спам/);
  assert.equal(submissionResult({ success: false, message: "nope" }).kind, "failed");
  assert.match(submissionResult(null).message, /интернет/);
});
