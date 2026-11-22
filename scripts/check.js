import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEGMENTS, VOLUMES } from "../data/options.js";
import { categories } from "../data/content.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

function fail(message) {
  errors.push(message);
}

const files = walk(root);
const titles = new Map();
const descriptions = new Map();

function resolveHref(fromFile, href) {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("http://") || href.startsWith("https://")) return null;
  const [pathPart, hash = ""] = href.split("#");
  let file = fromFile;
  if (pathPart) {
    if (pathPart.startsWith("/")) {
      const rel = pathPart.replace(/^\/+/, "");
      file = rel === "" ? path.join(root, "index.html") : rel.endsWith("/") ? path.join(root, rel, "index.html") : path.join(root, rel);
    } else {
      file = path.resolve(path.dirname(fromFile), pathPart);
    }
  }
  return { file, hash };
}

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (!html.startsWith("<!DOCTYPE html>")) fail(`${rel}: нет doctype`);
  if (!html.includes('<html lang="ru">')) fail(`${rel}: нет lang=ru`);
  const h1 = html.match(/<h1[\s>]/g) || [];
  if (h1.length !== 1) fail(`${rel}: h1 = ${h1.length}`);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  const description = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "";
  if (!title) fail(`${rel}: пустой title`);
  if (title.length < 20 || title.length > 80) fail(`${rel}: title ${title.length}: ${title}`);
  if (!description) fail(`${rel}: пустой description`);
  if (description.length < 80 || description.length > 200) fail(`${rel}: description ${description.length}: ${description}`);
  if (titles.has(title)) fail(`${rel}: повтор title с ${titles.get(title)}`);
  titles.set(title, rel);
  if (descriptions.has(description)) fail(`${rel}: повтор description с ${descriptions.get(description)}`);
  descriptions.set(description, rel);
  if (!html.includes('rel="canonical"')) fail(`${rel}: нет canonical`);
  if (!html.includes('name="viewport"')) fail(`${rel}: нет viewport`);
  if (html.includes("lorem") || html.includes("TODO")) fail(`${rel}: черновой текст`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const dupes = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (dupes.length) fail(`${rel}: повторяются id ${[...new Set(dupes)].join(", ")}`);
  const idSet = new Set(ids);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith("data:")) continue;
    const target = resolveHref(file, href);
    if (!target) continue;
    if (!fs.existsSync(target.file)) fail(`${rel}: битая ссылка ${href}`);
    else if (target.hash) {
      const linked = fs.readFileSync(target.file, "utf8");
      if (!linked.includes(`id="${target.hash}"`)) fail(`${rel}: нет #${target.hash} в ${path.relative(root, target.file)}`);
    }
  }
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  let previousHeading = 0;
  for (const level of headings) {
    if (previousHeading && level > previousHeading + 1) {
      fail(`${rel}: пропущен уровень заголовка h${previousHeading} → h${level}`);
      break;
    }
    previousHeading = level;
  }
  for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
    if (!/\btype\s*=/.test(match[1])) fail(`${rel}: кнопка без type`);
  }
  let formDepth = 0;
  for (const tag of html.matchAll(/<\/?form\b/g)) {
    if (tag[0].startsWith("</")) formDepth = Math.max(0, formDepth - 1);
    else {
      if (formDepth > 0) fail(`${rel}: форма внутри формы`);
      formDepth += 1;
    }
  }
  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = match[2];
    if (/\btype\s*=\s*["']hidden["']/.test(attrs)) continue;
    if (/\baria-label(?:ledby)?\s*=/.test(attrs)) continue;
    const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/) || [])[1];
    if (id && html.includes(`for="${id}"`)) continue;
    const before = html.slice(0, match.index);
    const openLabels = (before.match(/<label\b/g) || []).length;
    const closeLabels = (before.match(/<\/label>/g) || []).length;
    if (openLabels > closeLabels) continue;
    fail(`${rel}: поле без подписи ${id || match[1]}`);
  }
  const jsonBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!jsonBlocks.length) fail(`${rel}: нет JSON-LD`);
  jsonBlocks.forEach((block) => {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      fail(`${rel}: JSON-LD не разбирается: ${error.message}`);
    }
  });
}

const cabinet = fs.readFileSync(path.join(root, "kabinet", "index.html"), "utf8");
SEGMENTS.forEach((segment) => {
  if (!cabinet.includes(`value="${segment.value}"`)) fail(`кабинет без сегмента ${segment.value}`);
});
VOLUMES.forEach((volume) => {
  if (!cabinet.includes(`value="${volume.value}"`)) fail(`кабинет без объёма ${volume.value}`);
});
if (!cabinet.includes('id="order-lines"')) fail("кабинет без списка заявки");
if (!cabinet.includes("Сохранить черновик")) fail("кабинет без сохранения черновика");
if (!cabinet.includes("Отправить заявку")) fail("кабинет без отправки заявки");
if (!cabinet.includes("noindex")) fail("кабинет попал в индекс");
categories.forEach((category) => {
  const page = fs.readFileSync(path.join(root, "katalog", category.slug, "index.html"), "utf8");
  if (!page.includes("В заявку")) fail(`каталог ${category.slug} без «В заявку»`);
  category.products.forEach((product) => {
    if (!page.includes(`data-product="${product.id}"`)) fail(`нет заявки для ${product.id}`);
    if (!page.includes(`id="add-pieces-${product.id}"`)) fail(`нет поля штук для ${product.id}`);
  });
});

const bonus = fs.readFileSync(path.join(root, "bonusy", "index.html"), "utf8");
["50", "100", "127", "12", "−7%", "микс"].forEach((needle) => {
  if (!bonus.includes(needle)) fail(`бонусы без «${needle}»`);
});

const css = fs.readFileSync(path.join(root, "css", "site.css"), "utf8");
if (!css.includes("[hidden]")) fail("CSS не прячет [hidden]");

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const loc = match[1].replace(/^https?:\/\/[^/]+/, "");
  const rel = loc === "/" ? "index.html" : loc.endsWith("/") ? `${loc.slice(1)}index.html` : loc.slice(1);
  if (!fs.existsSync(path.join(root, rel))) fail(`sitemap ведёт в никуда: ${match[1]}`);
}
if (sitemap.includes("/kabinet/") || sitemap.includes("/404.html")) fail("в sitemap попала служебная страница");

const notFound = fs.readFileSync(path.join(root, "404.html"), "utf8");
for (const match of notFound.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const href = match[1];
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("data:")) continue;
  if (!href.startsWith("/")) fail(`404.html: относительная ссылка ${href} сломается на вложенном адресе`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Проверено HTML: ${files.length}`);
