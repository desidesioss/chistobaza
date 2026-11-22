function positionText(line, index) {
  const pack = line.pack ? `, ${line.pack}` : "";
  const arrival = line.arrival ? `. Партия: ${line.arrival}` : "";
  return `${index + 1}. ${line.name}${pack} — ${line.pieces} шт.${arrival}`;
}

function assertNever(value) {
  throw new Error("Неизвестный вариант: " + value);
}

export function buildOrderSubmission({ account, lines, comment, summary }) {
  const subject = summary.headline
    ? `Заявка «Чистобаза» — ${account.company} — ${summary.headline}`
    : `Заявка «Чистобаза» — ${account.company}`;
  const calculation = account.secondOrder ? "Вторая заявка и дальше" : "Первая заявка";
  return {
    subject,
    fields: {
      Компания: account.company,
      ИНН: account.inn,
      Контакт: account.person,
      Телефон: account.phone,
      Почта: account.email,
      "Кто заказывает": account.segment,
      "Ожидаемый объём": account.volume,
      Расчёт: calculation,
      "Комментарий компании": account.comment || "Нет",
      Позиции: lines.map(positionText).join("\n"),
      Итог: [summary.title, summary.detail, summary.metrics].filter(Boolean).join("\n"),
      Условия: [summary.bonus, summary.mix].filter(Boolean).join("\n") || "Без дополнительной пометки",
      "Комментарий к заявке": comment || "Нет",
    },
  };
}

export function submissionResult(payload) {
  const message = payload && typeof payload.message === "string" ? payload.message : "";
  const success = payload && (payload.success === true || payload.success === "true");
  const kind = success ? "sent" : /activat/i.test(message) ? "confirm" : "failed";
  switch (kind) {
    case "sent":
      return { kind, message: "Заявка отправлена. Менеджер получит письмо на почту. Партию это не бронирует." };
    case "confirm":
      return { kind, message: "На почту менеджера ушло письмо со ссылкой. Откройте его и подтвердите адрес, иначе заявки не дойдут. Проверьте и папку «Спам»." };
    case "failed":
      return { kind, message: "Письмо не ушло. Проверьте интернет и попробуйте ещё раз." };
    default:
      return assertNever(kind);
  }
}
