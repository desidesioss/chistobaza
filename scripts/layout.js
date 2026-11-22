import path from "node:path";
import { SEGMENTS, VOLUMES } from "../data/options.js";
import { categories, clients } from "../data/content.js";

const NAV = [
  { id: "catalog", dir: "katalog", label: "Каталог" },
  { id: "promos", dir: "aktsii", label: "Акции" },
  { id: "arrivals", dir: "postupleniya", label: "Поступления" },
  { id: "clients", dir: "klienty", label: "Клиенты" },
  { id: "bonus", dir: "bonusy", label: "Бонусы" },
  { id: "cabinet", dir: "kabinet", label: "Кабинет" },
];

export function e(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

export function absUrl(pathname) {
  const origin = (process.env.SITE_ORIGIN || "").replace(/\/$/, "");
  return origin ? origin + pathname : pathname;
}

export function pageHref(fromDir, toDir, rootLinks = false) {
  if (rootLinks) return toDir ? `/${toDir}/index.html` : "/index.html";
  const target = toDir ? `${toDir}/index.html` : "index.html";
  const from = fromDir || ".";
  return path.relative(from, target).split(path.sep).join("/");
}

function assetHref(fromDir, file, rootLinks = false) {
  if (rootLinks) return `/${String(file).replace(/^\/+/, "")}`;
  const from = fromDir || ".";
  return path.relative(from, file).split(path.sep).join("/");
}

function navLinks(fromDir, current, rootLinks = false) {
  return NAV.map((item) => {
    const currentAttr = item.id === current ? ' aria-current="page"' : "";
    return `<a class="nav-link" href="${e(pageHref(fromDir, item.dir, rootLinks))}"${currentAttr}>${e(item.label)}</a>`;
  }).join("");
}

export function crumbsHtml(fromDir, crumbs, current) {
  const parts = [`<a href="${e(pageHref(fromDir, ""))}">Главная</a>`];
  crumbs.forEach((crumb) => {
    parts.push(`<a href="${e(pageHref(fromDir, crumb.dir))}">${e(crumb.name)}</a>`);
  });
  parts.push(`<span aria-current="page">${e(current)}</span>`);
  return `<nav class="crumbs" aria-label="Хлебные крошки">${parts.join(' <span aria-hidden="true">/</span> ')}</nav>`;
}

export function breadcrumbLd(crumbs, currentName, canonPath) {
  const items = [{ "@type": "ListItem", position: 1, name: "Главная", item: absUrl("/") }];
  crumbs.forEach((crumb, index) => {
    items.push({
      "@type": "ListItem",
      position: index + 2,
      name: crumb.name,
      item: absUrl(`/${crumb.dir}/`),
    });
  });
  items.push({
    "@type": "ListItem",
    position: items.length + 1,
    name: currentName,
    item: absUrl(canonPath),
  });
  return { "@type": "BreadcrumbList", itemListElement: items };
}

export function pageHero({ dir, crumbs, current, kicker, title, lead, extra = "" }) {
  const leadHtml = lead ? `<p class="lede">${e(lead)}</p>` : "";
  return `<header class="page-hero"><div class="shell">${crumbsHtml(dir, crumbs, current)}
    <p class="kicker">${e(kicker)}</p>
    <h1 class="display">${e(title)}</h1>
    ${leadHtml}
    ${extra}
  </div></header>`;
}

export function actions(dir, items, rootLinks = false) {
  const html = items.map((item) => {
    const href = item.href || pageHref(dir, item.dir, rootLinks);
    const cls = item.primary ? "btn btn-primary" : "btn btn-ghost";
    return `<a class="${cls}" href="${e(href)}">${e(item.label)}</a>`;
  }).join("");
  return `<div class="actions">${html}</div>`;
}

export function faqList(items) {
  return `<div class="faq">${items.map((item) => `<details class="faq-item"><summary>${e(item.q)}</summary><p>${e(item.a)}</p></details>`).join("")}</div>`;
}

export function stepsList(items, textKey = "text") {
  return `<ol class="steps">${items.map((item) => {
    const id = item.anchor ? ` id="${e(item.anchor)}"` : "";
    return `<li${id}><span>${e(item.id)}</span><div><h3>${e(item.title)}</h3><p>${e(item[textKey])}</p></div></li>`;
  }).join("")}</ol>`;
}

export function calculatorMarkup() {
  return `<form class="calc" id="calc" method="post">
    <div class="calc-top">
      <label for="pieces">Штук в заказе</label>
      <div class="calc-input">
        <button type="button" data-step="-50" aria-label="Уменьшить на 50 штук">−50</button>
        <input id="pieces" inputmode="numeric" value="350" autocomplete="off" aria-describedby="calc-result">
        <button type="button" data-step="50" aria-label="Увеличить на 50 штук">+50</button>
      </div>
    </div>
    <div class="calc-chips">
      <button type="button" data-chip="50">50</button>
      <button type="button" data-chip="100">100</button>
      <button type="button" data-chip="500">500</button>
      <button type="button" data-chip="12700">фура</button>
    </div>
    <label class="checkline"><input type="checkbox" id="mix"> Собрать как микс-палету</label>
    <label class="checkline"><input type="checkbox" id="second-order"> Считать как второй заказ и дальше</label>
    <label class="checkline"><input type="checkbox" id="laundry"> Весь заказ — средства для стирки</label>
    <div class="calc-result" id="calc-result" aria-live="polite">
      <p class="calc-title" id="calc-title">Калькулятор включится с JavaScript</p>
      <p id="calc-detail">Минимум 50 штук, палета 100, фура 127 палет.</p>
      <p id="calc-bonus"></p>
      <p id="calc-mix" hidden></p>
    </div>
    <dl class="calc-metrics">
      <div><dt>Палет</dt><dd id="m-pallets">0</dd></div>
      <div><dt>Хвост, шт</dt><dd id="m-loose">0</dd></div>
      <div><dt>Полных фур</dt><dd id="m-trucks">0</dd></div>
      <div><dt>Палет сверх фур</dt><dd id="m-left">0</dd></div>
    </dl>
  </form>`;
}

function optionsHtml(list, valueKey, labelKey) {
  return list.map((item) => `<option value="${e(item[valueKey])}">${e(item[labelKey])}</option>`).join("");
}

export function cabinetMarkup(dir) {
  return `<form class="register" id="register" method="post" novalidate>
    <div class="form-alert" id="form-alert" role="alert" hidden></div>
    <div class="form-grid">
      <label class="field">Компания<input class="field-input" name="company" autocomplete="organization" maxlength="200" aria-required="true"></label>
      <label class="field">ИНН<input class="field-input" name="inn" inputmode="numeric" maxlength="16" aria-required="true"></label>
      <label class="field">Контактное лицо<input class="field-input" name="person" autocomplete="name" maxlength="120" aria-required="true"></label>
      <label class="field">Телефон<input class="field-input" name="phone" inputmode="tel" autocomplete="tel" maxlength="20" aria-required="true"></label>
      <label class="field">Почта<input class="field-input" name="email" type="email" autocomplete="email" maxlength="120" aria-required="true"></label>
      <label class="field">Кто заказывает
        <select class="field-input" name="segment" aria-required="true">
          <option value="">Выберите сегмент</option>
          ${optionsHtml(SEGMENTS, "value", "label")}
        </select>
      </label>
      <label class="field">Ожидаемый объём
        <select class="field-input" name="volume" aria-required="true">
          <option value="">Выберите объём</option>
          ${optionsHtml(VOLUMES, "value", "label")}
        </select>
      </label>
      <label class="field field-wide">Комментарий, если нужен<textarea class="field-input" name="comment" rows="3" maxlength="1000"></textarea></label>
    </div>
    <label class="checkline"><input type="checkbox" name="consent" aria-required="true"><span>Согласен сохранить заявку в этом браузере, чтобы открыть кабинет.</span></label>
    <p class="hint">Что сохранится и как стереть — на странице <a href="${e(pageHref(dir, "dannye"))}">данные заявки</a>. На сервер форма не отправляется.</p>
    <button class="btn btn-primary" type="submit" id="register-submit">Зарегистрировать компанию</button>
    <button class="btn btn-ghost" type="button" id="cancel-edit" hidden>Оставить как есть</button>
  </form>
  <div class="account" id="account" hidden></div>
  <div class="request" id="order">
    <h3 id="order-heading" tabindex="-1">Заявка</h3>
    <p class="hint">Заявку собирают из каталога. В миксе сумма равна 100 штук на каждую палету, хвоста нет.</p>
    <div class="form-alert" id="order-alert" role="alert" hidden></div>
    <ul class="drafts" id="order-lines"></ul>
    <label class="field" for="order-comment">Комментарий к заявке<textarea class="field-input" id="order-comment" rows="3" maxlength="1000"></textarea></label>
    <div class="calc-result" id="order-quote" aria-live="polite">
      <p class="calc-title" id="order-title">Заявка включится с JavaScript</p>
      <p id="order-detail"></p>
      <p id="order-metrics"></p>
      <p id="order-bonus"></p>
      <p id="order-mix" hidden></p>
    </div>
    <p class="hint" id="order-status"></p>
    <button class="btn btn-primary" type="button" id="send-order">Отправить заявку</button>
    <p class="hint" id="send-note">Заявка уходит на почту менеджера таблицей: компания, контакты и позиции. Партию это не бронирует.</p>
    <button class="btn btn-ghost" type="button" id="save-draft">Сохранить черновик</button>
    <p class="hint" id="second-order-note" hidden>Это не статус отгрузки у поставщика. Пометка меняет только расчёт в этом браузере.</p>
    <button class="btn btn-ghost" type="button" id="toggle-second" hidden>Считать следующие заявки как второй заказ</button>
    <h3>Сохранённые черновики</h3>
    <ul class="drafts" id="drafts"></ul>
  </div>`;
}

function header(dir, navId, rootLinks = false) {
  const links = navLinks(dir, navId, rootLinks);
  return `<header class="site-header">
    <div class="shell header-stack">
      <div class="header-row">
        <a class="logo" href="${e(pageHref(dir, "", rootLinks))}">Чистобаза<span>оптовая бытовая химия</span></a>
        <p class="header-aside">Отели, рестораны, прачечные, производства</p>
        <details class="mobile-nav">
          <summary>Меню</summary>
          <nav aria-label="Разделы">${links}</nav>
        </details>
      </div>
      <nav class="desktop-nav" aria-label="Разделы">${links}</nav>
    </div>
  </header>`;
}

function footer(dir, rootLinks = false) {
  const catalog = categories.map((category) => `<li><a href="${e(pageHref(dir, `katalog/${category.slug}`, rootLinks))}">${e(category.name)}</a></li>`).join("");
  const buyers = clients.map((client) => `<li><a href="${e(pageHref(dir, `klienty/${client.slug}`, rootLinks))}">${e(client.name)}</a></li>`).join("");
  return `<footer class="site-footer">
    <div class="shell footer-grid">
      <div>
        <p class="logo">Чистобаза</p>
        <p class="lede">Бытовая химия оптом для объектов, где чистота — часть работы.</p>
      </div>
      <nav aria-label="Каталог">
        <p class="kicker">Каталог</p>
        <ul>${catalog}</ul>
      </nav>
      <nav aria-label="Кому поставляем">
        <p class="kicker">Кому поставляем</p>
        <ul>${buyers}</ul>
      </nav>
      <nav aria-label="Покупателям">
        <p class="kicker">Покупателям</p>
        <ul>
          <li><a href="${e(pageHref(dir, "aktsii", rootLinks))}">Акции</a></li>
          <li><a href="${e(pageHref(dir, "postupleniya", rootLinks))}">Поступления</a></li>
          <li><a href="${e(pageHref(dir, "bonusy", rootLinks))}">Бонусы</a></li>
          <li><a href="${e(pageHref(dir, "kabinet", rootLinks))}">Кабинет</a></li>
          <li><a href="${e(pageHref(dir, "dannye", rootLinks))}">Данные заявки</a></li>
          <li><a href="${e(pageHref(dir, "karta-sayta", rootLinks))}">Карта сайта</a></li>
        </ul>
        <p class="hint">Телефон, адрес склада и реквизиты сообщаем в ответе на заявку.</p>
      </nav>
    </div>
  </footer>`;
}

export function renderPage({
  dir = "",
  title,
  description,
  nav = null,
  robots = "index, follow",
  canonicalPath,
  body,
  jsonLd = [],
  rootLinks = false,
}) {
  const canon = absUrl(canonicalPath);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: title,
        description,
        inLanguage: "ru-RU",
        url: canon,
      },
      ...jsonLd,
    ],
  };
  const ld = JSON.stringify(graph).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <meta name="robots" content="${e(robots)}">
  <meta name="theme-color" content="#f4efe6">
  <link rel="canonical" href="${e(canon)}">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:url" content="${e(canon)}">
  <meta name="twitter:card" content="summary">
  <link rel="icon" href="${e(assetHref(dir, "favicon.svg", rootLinks))}" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${e(assetHref(dir, "css/site.css", rootLinks))}">
  <script type="application/ld+json">${ld}</script>
</head>
<body>
  <a class="skip" href="#content">К содержанию</a>
  ${header(dir, nav, rootLinks)}
  <main id="content">
    <noscript><p class="shell hint">Каталог, условия заказа и тексты разделов доступны без JavaScript. Калькулятор и сохранение кабинета работают при включённом JavaScript.</p></noscript>
    ${body}
  </main>
  ${footer(dir, rootLinks)}
  <script type="module" src="${e(assetHref(dir, "js/site.js", rootLinks))}"></script>
</body>
</html>
`;
}
