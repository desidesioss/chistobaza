import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  arrivals,
  bonusFaq,
  categories,
  clients,
  homeFaq,
  priceOrder,
  promos,
  tiers,
} from "../data/content.js";
import { formatNumber, MIN_ORDER, PALLET, TRUCK_PALLETS } from "../js/pricing.js";
import {
  absUrl,
  actions,
  breadcrumbLd,
  cabinetMarkup,
  calculatorMarkup,
  e,
  faqList,
  pageHero,
  pageHref,
  renderPage,
  stepsList,
} from "./layout.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const truckPieces = PALLET * TRUCK_PALLETS;
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const urls = [];

const products = new Map();
categories.forEach((category) => {
  category.products.forEach((product) => {
    if (products.has(product.id)) throw new Error("Повторяется id товара " + product.id);
    products.set(product.id, { ...product, category });
  });
});

function ruDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function productById(id) {
  const product = products.get(id);
  if (!product) throw new Error("Нет товара " + id);
  return product;
}

function clientBySlug(slug) {
  const client = clients.find((item) => item.slug === slug);
  if (!client) throw new Error("Нет клиента " + slug);
  return client;
}

function categoryBySlug(slug) {
  const category = categories.find((item) => item.slug === slug);
  if (!category) throw new Error("Нет категории " + slug);
  return category;
}

function faqLd(items) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

function arrivalItem(dir, arrival) {
  const product = productById(arrival.productId);
  const href = `${pageHref(dir, `katalog/${product.category.slug}`)}#${product.id}`;
  return `<li><time datetime="${e(arrival.iso)}">${e(ruDate(arrival.iso))}</time><strong><a href="${e(href)}">${e(product.name)}</a></strong><span>${e(product.pack)}, ${e(formatNumber(arrival.qty))} шт</span></li>`;
}

function arrivalList(dir, list) {
  return `<ul class="quiet-arrivals">${list.map((item) => arrivalItem(dir, item)).join("")}</ul>`;
}

function orderRules(dir) {
  return `<ul class="meta-row">
    <li>Минимум ${e(formatNumber(MIN_ORDER))} штук</li>
    <li>Палета ${e(formatNumber(PALLET))} штук</li>
    <li>Фура ${e(formatNumber(TRUCK_PALLETS))} палет, ${e(formatNumber(truckPieces))} штук</li>
    <li><a href="${e(pageHref(dir, "bonusy"))}">Бонусы и микс</a></li>
  </ul>`;
}

function writePage(page) {
  const html = renderPage(page);
  const file = page.outFile
    ? path.join(root, page.outFile)
    : page.dir
      ? path.join(root, page.dir, "index.html")
      : path.join(root, "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf8");
  if (!page.robots || !page.robots.includes("noindex")) {
    urls.push({
      loc: page.canonicalPath,
      priority: page.priority,
      changefreq: page.changefreq || "monthly",
    });
  }
}

function homeBody() {
  const catalog = categories.map((category, index) => `<a href="${e(pageHref("", `katalog/${category.slug}`))}"><span>${e(String(index + 1).padStart(2, "0"))}</span><div><h3>${e(category.name)}</h3><p>${e(category.cardText)}</p></div><em>${e(category.short)}</em></a>`).join("");
  const clientCards = clients.map((client) => `<article id="${e(client.slug)}"><h3><a href="${e(pageHref("", `klienty/${client.slug}`))}">${e(client.name)}</a></h3><p>${e(client.cardText)}</p></article>`).join("");
  const promoCards = promos.map((promo) => `<article><p>${e(promo.figure)}</p><h3><a href="${e(pageHref("", "aktsii"))}">${e(promo.title)}</a></h3><span>${e(promo.homeNote)}</span></article>`).join("");
  return `<section class="belizna-hero">
      <p class="ghost" aria-hidden="true">чисто</p>
      <div class="shell belizna-hero-grid">
        <div>
          <p class="kicker">Оптовая бытовая химия</p>
          <h1 class="display">Бытовая химия оптом для объектов</h1>
          <p class="lede">Стирка, посуда, дезинфекция и уборка поверхностей. Для отелей, ресторанов, прачечных, производств и социальных учреждений.</p>
          ${actions("", [
            { dir: "katalog", label: "Смотреть группы", primary: true },
            { dir: "klienty", label: "Кому поставляем" },
          ])}
        </div>
        <aside class="quiet-card">
          <p>Условия отгрузки</p>
          <strong>от ${e(formatNumber(MIN_ORDER))} штук</strong>
          <ul>
            <li>Первый заказ после регистрации: −7%, кроме фуры</li>
            <li>Дальше бонусы, а не вторая скидка сверху</li>
            <li>Микс, если на кухне и в номерах нужны разные канистры</li>
          </ul>
          <a class="text-link" href="${e(pageHref("", "bonusy"))}">Как считаются бонусы</a>
        </aside>
      </div>
    </section>
    <section class="section" id="katalog">
      <div class="shell">
        <p class="kicker">Каталог</p>
        <h2>Четыре полки, без лишнего ассортимента</h2>
        <div class="editorial-list">${catalog}</div>
      </div>
    </section>
    <section class="section" id="klienty">
      <div class="shell">
        <p class="kicker">С кем работаем</p>
        <h2>Один поставщик на разные типы объектов</h2>
        <div class="client-columns">${clientCards}</div>
      </div>
    </section>
    <section class="section">
      <div class="shell split">
        <div id="zakaz">
          <p class="kicker">Как устроен заказ</p>
          <h2>Сначала порог, потом бонус</h2>
          ${stepsList(tiers, "short")}
          <a class="text-link" href="${e(pageHref("", "bonusy"))}">Полный порядок скидок</a>
        </div>
        <div id="postupleniya">
          <p class="kicker">Ближайшие партии</p>
          <h2>Чтобы объект не ждал пустую полку</h2>
          ${arrivalList("", arrivals.slice(0, 4))}
          <a class="text-link" href="${e(pageHref("", "postupleniya"))}">Весь план поступлений</a>
        </div>
      </div>
    </section>
    <section class="section" id="aktsii">
      <div class="shell">
        <p class="kicker">Акции</p>
        <h2>Что действует сейчас</h2>
        <div class="promo-band">${promoCards}</div>
      </div>
    </section>
    <section class="section" id="raschet">
      <div class="shell split">
        <div>
          <p class="kicker">Объём до отгрузки</p>
          <h2>Соберите количество, потом регистрируйтесь</h2>
          ${calculatorMarkup()}
        </div>
        <div>
          ${faqList(homeFaq)}
          ${actions("", [
            { dir: "bonusy", label: "Все правила бонусов" },
            { dir: "kabinet", label: "Открыть кабинет", primary: true },
          ])}
        </div>
      </div>
    </section>`;
}

function catalogBody() {
  const dir = "katalog";
  const list = categories.map((category, index) => `<a href="${e(pageHref(dir, `katalog/${category.slug}`))}"><span>${e(String(index + 1).padStart(2, "0"))}</span><div><h2>${e(category.name)}</h2><p>${e(category.cardText)}</p></div><em>${e(category.short)}</em></a>`).join("");
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Каталог",
    kicker: "Каталог",
    title: "Четыре группы бытовой химии",
    lead: "Стирка, посуда, дезинфекция и уборка поверхностей. Другого ассортимента нет: так проще держать палету и не раздувать хвост заказа.",
  })}
  <section class="section"><div class="shell">
    <div class="editorial-list">${list}</div>
    ${orderRules(dir)}
    ${actions(dir, [
      { dir: "bonusy", label: "Как собрать заказ" },
      { dir: "postupleniya", label: "Ближайшие партии" },
    ])}
  </div></section>`;
}

function addToOrderForm(dir, product) {
  const id = product.id;
  return `<form class="add-line" method="post" data-product="${e(id)}">
    <p class="form-alert" id="add-alert-${e(id)}" role="alert" hidden></p>
    <label class="field" for="add-pieces-${e(id)}">Штук<input class="field-input" id="add-pieces-${e(id)}" name="pieces" inputmode="numeric" value="50" maxlength="6" autocomplete="off"></label>
    <button class="btn btn-primary" type="submit">В заявку</button>
    <p class="hint">В заявке <span data-order-count="${e(id)}">0</span> шт. <a href="${e(pageHref(dir, "kabinet"))}">Открыть кабинет</a></p>
  </form>`;
}

function categoryBody(category) {
  const dir = `katalog/${category.slug}`;
  const cards = category.products.map((product) => `<article class="product" id="${e(product.id)}">
      <p class="kicker">${e(product.pack)}</p>
      <h3>${e(product.name)}</h3>
      <p>${e(product.text)}</p>
      <ul class="meta-row"><li>Штука: ${e(product.unit)}</li><li>${e(product.fit)}</li></ul>
      ${addToOrderForm(dir, product)}
    </article>`).join("");
  const related = category.clients.map((slug) => {
    const client = clientBySlug(slug);
    return `<li><a href="${e(pageHref(dir, `klienty/${client.slug}`))}">${e(client.name)}</a></li>`;
  }).join("");
  const batch = arrivals.filter((item) => productById(item.productId).category.slug === category.slug);
  const batchBlock = batch.length
    ? `<h2>Ближайшие партии этой группы</h2>${arrivalList(dir, batch)}`
    : "";
  return `${pageHero({
    dir,
    crumbs: [{ dir: "katalog", name: "Каталог" }],
    current: category.name,
    kicker: category.kicker,
    title: category.h1,
    lead: category.lead,
    extra: orderRules(dir),
  })}
  <section class="section"><div class="shell">
    <h2>Что лежит в группе</h2>
    <div class="product-grid">${cards}</div>
    <h2>Кому это обычно нужно</h2>
    <ul>${related}</ul>
    ${batchBlock}
    <h2>Короткие ответы</h2>
    ${faqList(category.faqs)}
    ${actions(dir, [
      { dir: "kabinet", label: "Зарегистрировать компанию", primary: true },
      { dir: "bonusy", label: "Посчитать объём" },
    ])}
  </div></section>`;
}

function clientsBody() {
  const dir = "klienty";
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Клиенты",
    kicker: "С кем работаем",
    title: "Один поставщик на разные объекты",
    lead: "Отели, рестораны, гостиницы, производства, химчистки, прачечные самообслуживания и социальные учреждения. Частным лицам от одной канистры не отгружаем.",
  })}
  <section class="section"><div class="shell">
    <h2>Семь типов объектов</h2>
    <div class="client-columns">${clients.map((client) => `<article id="${e(client.slug)}"><h3><a href="${e(pageHref(dir, `klienty/${client.slug}`))}">${e(client.name)}</a></h3><p>${e(client.lead)}</p></article>`).join("")}</div>
  </div></section>`;
}

function clientBody(client) {
  const dir = `klienty/${client.slug}`;
  const paragraphs = client.paragraphs.map((paragraph) => `<p>${e(paragraph)}</p>`).join("");
  const cats = client.categories.map((slug) => {
    const category = categoryBySlug(slug);
    return `<li><a href="${e(pageHref(dir, `katalog/${category.slug}`))}">${e(category.name)}</a></li>`;
  }).join("");
  return `${pageHero({
    dir,
    crumbs: [{ dir: "klienty", name: "Клиенты" }],
    current: client.name,
    kicker: client.kicker,
    title: client.h1,
    lead: client.lead,
  })}
  <section class="section"><div class="shell prose">
    ${paragraphs}
    <h2>Какой объём обычно берут</h2>
    <p>${e(client.volume)}</p>
    <h2>Какие группы смотреть</h2>
    <ul>${cats}</ul>
    ${actions(dir, [
      { dir: "kabinet", label: "Оставить заявку компании", primary: true },
      { dir: "bonusy", label: "Правила мелкого опта и опта" },
    ])}
  </div></section>`;
}

function promosBody() {
  const dir = "aktsii";
  const list = promos.map((promo) => `<article>
      <p class="promo-figure">${e(promo.figure)}</p>
      <div><h2>${e(promo.title)}</h2><ul>${promo.points.map((point) => `<li>${e(point)}</li>`).join("")}</ul></div>
    </article>`).join("");
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Акции",
    kicker: "Акции",
    title: "Что можно получить к цене",
    lead: "Скидки не складываются стопкой. Сначала действует более узкое условие: договор фуры, квартальная фиксация, затем первый заказ, и только со второго — бонус.",
  })}
  <section class="section"><div class="shell">
    <div class="promo-list">${list}</div>
    ${actions(dir, [{ dir: "kabinet", label: "Зарегистрировать компанию", primary: true }, { dir: "bonusy", label: "Порядок применения" }])}
  </div></section>`;
}

function arrivalsBody() {
  const dir = "postupleniya";
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Поступления",
    kicker: "Ближайшие партии",
    title: "Что приедет на склад",
    lead: "План склада, не остаток в наличии. Число — сколько штук будет в партии. Штука — канистра, мешок, ведро или короб. Опт от 500 штук получает приоритет, если партия меньше суммы заявок.",
  })}
  <section class="section"><div class="shell">
    <h2>План склада</h2>
    ${arrivalList(dir, arrivals)}
    <p class="hint">Если пятновыводителя или порошка нет в ближайшей партии, химчистке и прачечной лучше закрыть запас заранее.</p>
    ${actions(dir, [{ dir: "kabinet", label: "Попросить место в партии", primary: true }, { dir: "katalog", label: "Открыть группы" }])}
  </div></section>`;
}

function bonusBody() {
  const dir = "bonusy";
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Бонусы",
    kicker: "Мелкий опт и опт",
    title: "Сначала порог, потом бонус",
    lead: `Продаём от ${formatNumber(MIN_ORDER)} штук. В палете ${formatNumber(PALLET)} штук, в фуре ${formatNumber(TRUCK_PALLETS)} палет — ${formatNumber(truckPieces)} штук. Первый заказ после регистрации: −7%. Дальше бонус, не вторая скидка.`,
  })}
  <section class="section"><div class="shell">
    <dl class="fact-row">
      <div><strong>${e(formatNumber(MIN_ORDER))}</strong><span>минимум, штук</span></div>
      <div><strong>${e(formatNumber(PALLET))}</strong><span>штук в палете</span></div>
      <div><strong>${e(formatNumber(TRUCK_PALLETS))}</strong><span>палет в фуре</span></div>
      <div><strong>${e(formatNumber(truckPieces))}</strong><span>штук в фуре</span></div>
    </dl>
  </div></section>
  <section class="section"><div class="shell split">
    <div>
      <p class="kicker">Уровни</p>
      <h2>Чем больше ровный объём, тем другой уровень цены</h2>
      ${stepsList(tiers)}
    </div>
    <div>
      <p class="kicker">Один механизм</p>
      <h2>В каком порядке применяется цена</h2>
      ${stepsList(priceOrder)}
    </div>
  </div></section>
  <section class="section"><div class="shell split">
    <div>
      <p class="kicker">Калькулятор</p>
      <h2>Проверьте штуки до заявки</h2>
      <p class="lede">Калькулятор не называет рублёвую цену: прайс живёт в счёте. Здесь уровень, скидка первого заказа и процент, который начислится со второго.</p>
      ${calculatorMarkup()}
    </div>
    <div>
      <h2>Вопросы, по которым спорят в заявке</h2>
      ${faqList(bonusFaq)}
    </div>
  </div></section>`;
}

function cabinetBody() {
  const dir = "kabinet";
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Кабинет",
    kicker: "Личный кабинет",
    title: "Кабинет компании",
    lead: "После регистрации первая отгрузка, кроме фуры и квартальной фиксации, идёт со скидкой 7%. Отправленная заявка приходит менеджеру письмом и партию не бронирует.",
  })}
  <section class="section"><div class="shell split">
    <div class="form-card">
      <h2 id="cabinet-title">Регистрация, с которой начинается скидка</h2>
      <p class="lede" id="cabinet-lede">Компания, ИНН и тип объекта. Комментарий можно не заполнять.</p>
      ${cabinetMarkup(dir)}
    </div>
    <div>
      <p class="kicker">Прикидка объёма</p>
      <h2>Калькулятор не меняет заявку</h2>
      <p class="lede">Здесь можно прикинуть штуки, палеты и бонус. Строки заявки он не переписывает.</p>
      ${calculatorMarkup()}
      <a class="text-link" href="${e(pageHref(dir, "bonusy"))}">Полные правила бонусов</a>
    </div>
  </div></section>`;
}

function dataBody() {
  const dir = "dannye";
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Данные заявки",
    kicker: "Данные",
    title: "Что происходит с заявкой",
    lead: "Черновик остаётся в браузере. Кнопка «Отправить заявку» передаёт письмо менеджеру и партию не бронирует.",
  })}
  <section class="section"><div class="shell prose">
    <h2>Где лежат поля</h2>
    <p>В локальном хранилище этого браузера лежат компания, ИНН, контактное лицо, телефон, почта, сегмент, ожидаемый объём, комментарий и признак «вторая заявка». Признак только меняет расчёт в этом браузере и не означает, что поставщик уже отгрузил заказ.</p>
    <p>Текущая заявка — строки с позицией каталога и числом штук, плюс комментарий. Черновик — снимок такой заявки: позиции, штуки, комментарий и дата. Старый черновик мог хранить группу и общее число штук. Черновик менеджеру не виден и партию не бронирует.</p>
    <h2>Как менеджер видит заявку</h2>
    <p>Кнопка «Отправить заявку» отправляет менеджеру название компании, контакты, позиции и расчёт. Письмо приходит таблицей, ответить можно на почту покупателя. Доставку делает сервис FormSubmit.</p>
    <p>Сайт свою копию заявки не хранит. Черновик в браузере менеджеру не виден. Партию письмо не бронирует.</p>
    <h2>Чего на сайте нет</h2>
    <ul>
      <li>Нет cookie аналитики и рекламных пикселей.</li>
      <li>Нет общей базы заявок, пока к сайту не подключён сервер.</li>
      <li>Шрифты запрашиваются у Google Fonts. При открытии страницы браузер обращается к серверам Google.</li>
    </ul>
    <h2>Как стереть</h2>
    <p>В кабинете кнопка «Стереть данные этого браузера» удаляет компанию, текущую заявку и черновики. Тот же эффект даёт очистка данных сайта в настройках браузера.</p>
    <p>Не вводите данные компании, если компьютером пользуются другие люди: хранилище браузера видно на этом устройстве.</p>
    ${actions(dir, [{ dir: "kabinet", label: "Вернуться в кабинет", primary: true }])}
  </div></section>`;
}

function mapBody() {
  const dir = "karta-sayta";
  const group = (title, links) => `<h2>${e(title)}</h2><ul class="map-list">${links.join("")}</ul>`;
  const link = (to, label) => `<li><a href="${e(pageHref(dir, to))}">${e(label)}</a></li>`;
  return `${pageHero({
    dir,
    crumbs: [],
    current: "Карта сайта",
    kicker: "Навигация",
    title: "Все разделы",
    lead: "Каталог, объекты, акции, поступления, бонусы и кабинет.",
  })}
  <section class="section"><div class="shell">
    ${group("Сайт", [
      link("", "Главная"),
      link("aktsii", "Акции"),
      link("postupleniya", "Поступления"),
      link("bonusy", "Бонусы"),
      link("kabinet", "Кабинет"),
      link("dannye", "Данные заявки"),
    ])}
    ${group("Каталог", [link("katalog", "Все группы"), ...categories.map((category) => link(`katalog/${category.slug}`, category.name))])}
    ${group("Клиенты", [link("klienty", "Все типы объектов"), ...clients.map((client) => link(`klienty/${client.slug}`, client.name))])}
  </div></section>`;
}

function notFoundBody() {
  return `<header class="page-hero"><div class="shell">
    <p class="kicker">404</p>
    <h1 class="display">Такой страницы нет</h1>
    <p class="lede">Проверьте адрес или откройте каталог и карту сайта.</p>
    ${actions("", [{ dir: "", label: "На главную", primary: true }, { dir: "katalog", label: "Каталог" }, { dir: "karta-sayta", label: "Карта сайта" }], true)}
  </div></header>`;
}

const organization = {
  "@type": "Organization",
  name: "Чистобаза",
  url: absUrl("/"),
  description: "Оптовая бытовая химия для отелей, ресторанов, прачечных и производств. Отгрузка от 50 штук.",
};

const pages = [
  {
    dir: "",
    title: "Бытовая химия оптом от 50 штук — Чистобаза",
    description: "Оптовая бытовая химия для отелей, ресторанов, прачечных и производств. От 50 штук, палета 100, в фуре 127 палет. Первый заказ после регистрации −7%, кроме фуры.",
    nav: null,
    canonicalPath: "/",
    priority: "1.0",
    changefreq: "weekly",
    body: homeBody(),
    jsonLd: [organization, { "@type": "WebSite", name: "Чистобаза", url: absUrl("/"), inLanguage: "ru-RU" }],
  },
  {
    dir: "katalog",
    title: "Каталог бытовой химии оптом — Чистобаза",
    description: "Четыре группы оптом: стирка, посуда, дезинфекция и уборка поверхностей. Заказ от 50 штук, палета 100, микс до 8 позиций.",
    nav: "catalog",
    canonicalPath: "/katalog/",
    priority: "0.9",
    crumbs: [],
    crumbName: "Каталог",
    body: catalogBody(),
    jsonLd: [{
      "@type": "ItemList",
      name: "Каталог бытовой химии",
      itemListElement: categories.map((category, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: category.name,
        url: absUrl(`/katalog/${category.slug}/`),
      })),
    }],
  },
];

categories.forEach((category) => {
  pages.push({
    dir: `katalog/${category.slug}`,
    title: category.title,
    description: category.description,
    nav: "catalog",
    canonicalPath: `/katalog/${category.slug}/`,
    priority: "0.8",
    crumbs: [{ dir: "katalog", name: "Каталог" }],
    crumbName: category.name,
    body: categoryBody(category),
    jsonLd: [
      faqLd(category.faqs),
      {
        "@type": "ItemList",
        name: category.name,
        itemListElement: category.products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: product.name,
            description: product.text,
            category: category.name,
            brand: { "@type": "Brand", name: "Чистобаза" },
            additionalProperty: [
              { "@type": "PropertyValue", name: "Упаковка", value: product.pack },
              { "@type": "PropertyValue", name: "Учётная единица", value: product.unit },
              { "@type": "PropertyValue", name: "Минимальный заказ", value: "50 штук" },
            ],
          },
        })),
      },
    ],
  });
});

pages.push({
  dir: "klienty",
  title: "Поставки бытовой химии для объектов — Чистобаза",
  description: "Поставляем бытовую химию оптом отелям, ресторанам, гостиницам, производствам, химчисткам, прачечным самообслуживания и социальным учреждениям.",
  nav: "clients",
  canonicalPath: "/klienty/",
  priority: "0.9",
  crumbs: [],
  crumbName: "Клиенты",
  body: clientsBody(),
});

clients.forEach((client) => {
  pages.push({
    dir: `klienty/${client.slug}`,
    title: client.title,
    description: client.description,
    nav: "clients",
    canonicalPath: `/klienty/${client.slug}/`,
    priority: "0.7",
    crumbs: [{ dir: "klienty", name: "Клиенты" }],
    crumbName: client.name,
    body: clientBody(client),
  });
});

pages.push(
  {
    dir: "aktsii",
    title: "Акции на бытовую химию оптом — Чистобаза",
    description: "Скидка 7% на первый заказ, микс-палета без доплаты, квартальная цена для социальных учреждений и двойные бонусы на стирку до 31 декабря 2026.",
    nav: "promos",
    canonicalPath: "/aktsii/",
    priority: "0.8",
    changefreq: "weekly",
    crumbs: [],
    crumbName: "Акции",
    body: promosBody(),
  },
  {
    dir: "postupleniya",
    title: "Ближайшие поступления бытовой химии — Чистобаза",
    description: "План ближайших партий: посуда, пищеблок, порошок, стекло и антисептик. Опт от 500 штук получает приоритет, если партия ограничена.",
    nav: "arrivals",
    canonicalPath: "/postupleniya/",
    priority: "0.8",
    changefreq: "weekly",
    crumbs: [],
    crumbName: "Поступления",
    body: arrivalsBody(),
  },
  {
    dir: "bonusy",
    title: "Мелкий опт и опт: бонусы и палеты — Чистобаза",
    description: "Мелкий опт от 50 штук, палета 100, опт от 500, фура 127 палет. Скидка 7% только на первый заказ, дальше бонус 1–3% без второй скидки сверху.",
    nav: "bonus",
    canonicalPath: "/bonusy/",
    priority: "0.9",
    crumbs: [],
    crumbName: "Бонусы",
    body: bonusBody(),
    jsonLd: [faqLd(bonusFaq)],
  },
  {
    dir: "kabinet",
    title: "Личный кабинет оптового покупателя — Чистобаза",
    description: "Регистрация компании для оптовой закупки бытовой химии. Первый заказ, кроме фуры, со скидкой 7%. Отправленная заявка приходит менеджеру письмом.",
    nav: "cabinet",
    canonicalPath: "/kabinet/",
    robots: "noindex, follow",
    crumbs: [],
    crumbName: "Кабинет",
    body: cabinetBody(),
  },
  {
    dir: "dannye",
    title: "Данные заявки в браузере — Чистобаза",
    description: "Кнопка «Отправить заявку» отправляет менеджеру компанию, контакты и позиции. Сайт свою копию не хранит и партию не бронирует.",
    nav: null,
    canonicalPath: "/dannye/",
    priority: "0.3",
    crumbs: [],
    crumbName: "Данные заявки",
    body: dataBody(),
  },
  {
    dir: "karta-sayta",
    title: "Карта сайта оптовой бытовой химии — Чистобаза",
    description: "Все разделы сайта: каталог бытовой химии, типы объектов, акции, поступления, бонусная система и кабинет покупателя.",
    nav: null,
    canonicalPath: "/karta-sayta/",
    priority: "0.3",
    crumbs: [],
    crumbName: "Карта сайта",
    body: mapBody(),
  },
  {
    dir: "",
    outFile: "404.html",
    title: "Страница не найдена — Чистобаза",
    description: "Такой страницы на сайте оптовой бытовой химии нет. Откройте каталог, карту сайта или главную.",
    nav: null,
    canonicalPath: "/404.html",
    robots: "noindex, follow",
    rootLinks: true,
    body: notFoundBody(),
  },
);

pages.forEach((page) => {
  const jsonLd = [...(page.jsonLd || [])];
  if (page.crumbs && page.crumbName) {
    jsonLd.push(breadcrumbLd(page.crumbs, page.crumbName, page.canonicalPath));
  }
  writePage({ ...page, jsonLd });
});

const origin = (process.env.SITE_ORIGIN || "").replace(/\/$/, "");
const lastmod = new Date().toISOString().slice(0, 10);
const body = urls.map((url) => `  <url><loc>${e(absUrl(url.loc))}</loc><lastmod>${lastmod}</lastmod><changefreq>${url.changefreq}</changefreq><priority>${url.priority}</priority></url>`).join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
fs.writeFileSync(path.join(root, "sitemap.xml"), sitemap, "utf8");
fs.writeFileSync(path.join(root, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${origin ? `${origin}/sitemap.xml` : "/sitemap.xml"}\n`, "utf8");

console.log(`Страниц: ${pages.length}, в карте: ${urls.length}`);
