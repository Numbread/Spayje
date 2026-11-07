const API = "https://filipinoxstories.com/wp-json/wp/v2";
const PAGE_SIZE = 10;
const AUTHOR_PAGE_SIZE = 24;
const LIST_EMBED = "author,wp:term,wp:featuredmedia";
const LIST_FIELDS = "id,date,link,title,excerpt,author,categories,_links,_embedded";

const view = document.querySelector("#view");
const sidebar = document.querySelector("#sidebar");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#q");
const gate = document.querySelector("#gate");

const cache = {
  categories: null,
  totals: null,
  chapters: new Map(),
};

init();

function init() {
  const admitted = localStorage.getItem("spayje-adult-ok") === "yes";
  gate.hidden = admitted;

  document.querySelector("#gate-enter").addEventListener("click", () => {
    localStorage.setItem("spayje-adult-ok", "yes");
    gate.hidden = true;
    render();
    view.focus();
  });

  document.querySelector("#gate-leave").addEventListener("click", () => {
    gate.querySelector("h1").textContent = "You can close this tab.";
    gate.querySelector(".gate-actions").hidden = true;
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const route = parseRoute();
    const params = new URLSearchParams();
    const q = searchInput.value.trim();
    if (q) params.set("q", q);
    if (route.params.get("cat")) params.set("cat", route.params.get("cat"));
    go("#/" + (params.toString() ? `?${params}` : ""));
  });

  window.addEventListener("hashchange", () => {
    render();
  });

  if (!location.hash) location.hash = "#/";
  render();
}

function parseRoute() {
  const raw = (location.hash || "#/").slice(1);
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, params: new URLSearchParams(query) };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function render() {
  if (localStorage.getItem("spayje-adult-ok") !== "yes") return;
  const route = parseRoute();
  const section = route.parts[0] || "stories";
  highlightNav(section);
  const onAuthors = section === "authors" || section === "author";
  searchInput.value = onAuthors ? "" : (route.params.get("q") || "");

  try {
    await ensureCategories();
    renderSidebar(route);
    if (section === "story" && route.parts[1]) return renderStory(route.parts[1]);
    if (section === "authors") return renderAuthors(route);
    if (section === "author" && route.parts[1]) return renderAuthor(route);
    if (section === "categories") return renderCategories();
    return renderStories(route);
  } catch (error) {
    view.innerHTML = "";
    view.append(messageBlock(
      "The catalog could not be loaded.",
      "Open this folder with a local web server, then try again. FilipinoX Stories must be reachable from your browser."
    ));
    console.error(error);
  }
}

function highlightNav(section) {
  const name = section === "author" || section === "authors" ? "authors" : section === "categories" ? "categories" : "stories";
  document.querySelectorAll(".main-nav a").forEach((link) => {
    if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

async function ensureCategories() {
  if (cache.categories) return;
  const categories = await api("/categories?per_page=100");
  cache.categories = categories.data
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count);
}

async function ensureTotals() {
  if (cache.totals) return cache.totals;
  const [posts, authors] = await Promise.all([
    api("/posts?per_page=1&_fields=id"),
    api("/users?per_page=1&_fields=id"),
  ]);
  cache.totals = {
    posts: posts.total,
    authors: authors.total,
    categories: cache.categories.length,
  };
  return cache.totals;
}

function renderSidebar(route) {
  const active = route.parts[0] ? "" : route.params.get("cat") || "";
  sidebar.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = "Categories";
  const list = document.createElement("div");
  list.className = "cat-list";

  const all = document.createElement("a");
  all.className = "cat-link";
  all.href = keepSearch("#/");
  if (!active && !route.parts[0]) all.setAttribute("aria-current", "true");
  all.append(labelSpan("All stories"), labelSpan(""));
  list.append(all);

  cache.categories.forEach((category) => {
    const link = document.createElement("a");
    link.className = "cat-link";
    const params = new URLSearchParams();
    const q = searchInput.value.trim();
    if (q) params.set("q", q);
    params.set("cat", String(category.id));
    link.href = `#/?${params}`;
    if (String(category.id) === active) link.setAttribute("aria-current", "true");
    const name = document.createElement("span");
    name.textContent = category.name;
    const count = document.createElement("span");
    count.textContent = formatNumber(category.count);
    link.append(name, count);
    list.append(link);
  });

  sidebar.append(title, list);
}

function keepSearch(hash) {
  const q = searchInput.value.trim();
  if (!q) return hash;
  return `${hash}?q=${encodeURIComponent(q)}`;
}

async function renderStories(route) {
  const page = clampPage(route.params.get("page"));
  const q = route.params.get("q") || "";
  const cat = route.params.get("cat") || "";
  setStatus("Loading stories…");

  const params = new URLSearchParams({
    per_page: String(PAGE_SIZE),
    page: String(page),
    _embed: LIST_EMBED,
    _fields: LIST_FIELDS,
  });
  if (q) params.set("search", q);
  if (cat) params.set("categories", cat);

  const [result, totals] = await Promise.all([
    api(`/posts?${params}`),
    ensureTotals(),
  ]);

  const category = cache.categories.find((item) => String(item.id) === cat);
  view.innerHTML = "";

  const hero = document.createElement("section");
  hero.className = "hero";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = q ? "Search" : category ? category.name : "Latest stories";
  const heading = document.createElement("h1");
  heading.textContent = q ? `Results for “${q}”` : category ? category.name : "Read the catalog";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "Titles, authors, and full stories come from FilipinoX Stories. Open any title to read it here.";
  hero.append(eyebrow, heading, lede);

  if (!q && !category) {
    const stats = document.createElement("div");
    stats.className = "stats";
    stats.append(
      stat(totals.posts, "Stories"),
      stat(totals.authors, "Authors"),
      stat(totals.categories, "Categories")
    );
    hero.append(stats);
  }

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const summary = document.createElement("p");
  summary.textContent = result.total
    ? `${formatNumber(result.total)} ${result.total === 1 ? "story" : "stories"}`
    : "No stories matched.";
  toolbar.append(summary);

  const list = document.createElement("div");
  list.className = "story-list";
  if (!Array.isArray(result.data) || !result.data.length) {
    list.append(messageBlock("Nothing matched.", "Try another title, author name, or category."));
  } else {
    result.data.forEach((post) => list.append(storyRow(post)));
  }

  view.append(hero, toolbar, list, pager(page, result.pages, (next) => storiesHash(q, cat, next)));
}

function storiesHash(q, cat, page) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (cat) params.set("cat", cat);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `#/?${query}` : "#/";
}

function storyRow(post) {
  const link = document.createElement("article");
  link.className = "story-row";
  const cover = coverImage(post, ["inkbound-thumb", "post-thumbnail", "medium"], "cover");
  if (!cover) link.classList.add("no-cover");
  const copy = document.createElement("div");
  copy.className = "story-copy";
  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = `#/story/${post.id}`;
  titleLink.textContent = plain(post.title.rendered);
  title.append(titleLink);
  const meta = document.createElement("div");
  meta.className = "meta";
  const author = authorFrom(post);
  if (author) {
    const authorLink = document.createElement("a");
    authorLink.href = `#/author/${author.id}`;
    authorLink.textContent = author.name;
    meta.append(authorLink);
  }
  const date = document.createElement("span");
  date.textContent = formatDate(post.date);
  meta.append(date);
  const excerpt = document.createElement("p");
  excerpt.className = "excerpt";
  excerpt.textContent = plain(post.excerpt.rendered);
  const tags = document.createElement("div");
  tags.className = "tags";
  categoriesFrom(post).slice(0, 4).forEach((category) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = category.name;
    tags.append(tag);
  });
  copy.append(title, meta, excerpt, tags);
  if (cover) link.append(cover);
  link.append(copy);
  return link;
}

async function renderStory(id) {
  setStatus("Opening story…");
  const post = await api(
    `/posts/${encodeURIComponent(id)}?_embed=${LIST_EMBED}&_fields=id,date,modified,link,title,content,excerpt,author,meta,_links,_embedded`
  );
  const story = post.data;
  if (!story || story.code) {
    view.innerHTML = "";
    view.append(messageBlock("That story is not available.", "It may have been removed from FilipinoX Stories."));
    return;
  }

  view.innerHTML = "";
  const sheet = document.createElement("article");
  sheet.className = "story-sheet";
  const head = document.createElement("div");
  head.className = "story-head";
  const cover = coverImage(story, ["inkbound-cover", "inkbound-hero", "medium_large"], "story-cover");
  if (!cover) head.classList.add("no-cover");
  const intro = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Story";
  const title = document.createElement("h1");
  title.textContent = plain(story.title.rendered);
  const meta = document.createElement("div");
  meta.className = "meta";
  const author = authorFrom(story);
  if (author) {
    const authorLink = document.createElement("a");
    authorLink.href = `#/author/${author.id}`;
    authorLink.textContent = author.name;
    meta.append(authorLink);
  }
  const published = document.createElement("span");
  published.textContent = formatDate(story.date);
  meta.append(published);
  categoriesFrom(story).forEach((category) => {
    const categoryLink = document.createElement("a");
    categoryLink.href = `#/?cat=${category.id}`;
    categoryLink.textContent = category.name;
    meta.append(categoryLink);
  });

  intro.append(eyebrow, title, meta);
  if (cover) head.append(cover);
  head.append(intro);

  const fullStory = await loadFullStory(story);
  const body = document.createElement("div");
  body.className = "story-body";
  if (plain(fullStory.html)) {
    body.innerHTML = sanitizeStoryHtml(fullStory.html);
  } else {
    const note = document.createElement("p");
    note.textContent = "The full story is not included in this catalog entry.";
    body.append(note);
  }

  const navSection = document.createElement("div");
  navSection.className = "story-nav-section";

  const actions = document.createElement("div");
  actions.className = "story-actions";
  const back = document.createElement("a");
  back.className = "btn";
  back.href = "#/";
  back.textContent = "Back to stories";
  const original = document.createElement("a");
  original.className = "btn btn-primary";
  original.href = fullStory.source || story.link;
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  original.textContent = "Open on FilipinoX Stories";
  actions.append(back, original);

  sheet.append(head, body, navSection, actions);
  view.append(sheet);
  view.focus();
  window.scrollTo(0, 0);

  findAdjacentChapters(story).then((adj) => {
    const currentRoute = parseRoute();
    if (currentRoute.parts[0] !== "story" || String(currentRoute.parts[1]) !== String(story.id)) {
      return;
    }

    if (adj.next) {
      original.className = "btn";

      const card = document.createElement("div");
      card.className = "next-chapter-card";

      const info = document.createElement("div");
      info.className = "next-chapter-text";
      const cardEyebrow = document.createElement("p");
      cardEyebrow.className = "eyebrow";
      cardEyebrow.textContent = "Next chapter";
      const nextTitle = document.createElement("h2");
      nextTitle.className = "next-chapter-title";
      nextTitle.textContent = plain((adj.next.title && adj.next.title.rendered) || adj.next.title);
      info.append(cardEyebrow, nextTitle);

      const nextBtn = document.createElement("a");
      nextBtn.className = "btn btn-primary next-chapter-btn";
      nextBtn.href = `#/story/${adj.next.id}`;
      nextBtn.innerHTML = `<span>Read next chapter</span> <span aria-hidden="true">&rarr;</span>`;

      card.append(info, nextBtn);
      navSection.append(card);

      const nextAction = document.createElement("a");
      nextAction.className = "btn btn-primary";
      nextAction.href = `#/story/${adj.next.id}`;
      nextAction.textContent = "Next chapter \u2192";
      actions.prepend(nextAction);
    } else if (adj.prev) {
      const note = document.createElement("p");
      note.className = "series-end-note";
      note.textContent = "You're caught up! This is the latest chapter available for this story.";
      navSection.append(note);
    }

    if (adj.prev) {
      const prevAction = document.createElement("a");
      prevAction.className = "btn";
      prevAction.href = `#/story/${adj.prev.id}`;
      prevAction.textContent = "\u2190 Previous chapter";
      actions.insertBefore(prevAction, back);
    }
  }).catch((err) => {
    console.warn("Could not check for adjacent chapters:", err);
  });
}

async function renderAuthors(route) {
  const page = clampPage(route.params.get("page"));
  const q = route.params.get("q") || "";
  setStatus("Loading authors…");
  const params = new URLSearchParams({
    per_page: String(AUTHOR_PAGE_SIZE),
    page: String(page),
    _fields: "id,name,slug,description,avatar_urls",
  });
  if (q) params.set("search", q);
  const result = await api(`/users?${params}`);
  view.innerHTML = "";

  const hero = document.createElement("section");
  hero.className = "hero";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Authors";
  const heading = document.createElement("h1");
  heading.textContent = q ? `Authors matching “${q}”` : "Authors";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "Every public author on FilipinoX Stories. Open a name to see their stories.";
  const form = document.createElement("form");
  form.className = "search";
  form.style.marginTop = "16px";
  const input = document.createElement("input");
  input.type = "search";
  input.name = "author-q";
  input.value = q;
  input.placeholder = "Search authors";
  input.setAttribute("aria-label", "Search authors");
  const button = document.createElement("button");
  button.className = "btn btn-primary";
  button.type = "submit";
  button.textContent = "Search";
  form.append(input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    const term = input.value.trim();
    if (term) next.set("q", term);
    go(`#/authors${next.toString() ? `?${next}` : ""}`);
  });
  hero.append(eyebrow, heading, lede, form);

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const summary = document.createElement("p");
  summary.textContent = `${formatNumber(result.total)} ${result.total === 1 ? "author" : "authors"}`;
  toolbar.append(summary);

  const grid = document.createElement("div");
  grid.className = "people";
  if (!Array.isArray(result.data) || !result.data.length) {
    grid.append(messageBlock("No authors matched.", "Try a different name."));
  } else {
    result.data.forEach((author) => {
      const card = document.createElement("a");
      card.className = "person";
      card.href = `#/author/${author.id}`;
      card.append(avatar(author), personText(author.name, author.description));
      grid.append(card);
    });
  }

  view.append(
    hero,
    toolbar,
    grid,
    pager(page, result.pages, (next) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (next > 1) params.set("page", String(next));
      const query = params.toString();
      return query ? `#/authors?${query}` : "#/authors";
    })
  );
}

async function renderAuthor(route) {
  const id = route.parts[1];
  const page = clampPage(route.params.get("page"));
  setStatus("Loading author…");
  const [userResult, posts] = await Promise.all([
    api(`/users/${encodeURIComponent(id)}?_fields=id,name,description,avatar_urls,link`),
    api(`/posts?author=${encodeURIComponent(id)}&per_page=${PAGE_SIZE}&page=${page}&_embed=${LIST_EMBED}&_fields=${LIST_FIELDS}`),
  ]);
  const author = userResult.data;
  view.innerHTML = "";
  if (!author || author.code) {
    view.append(messageBlock("Author not found.", "This profile is not public on FilipinoX Stories."));
    return;
  }

  const hero = document.createElement("section");
  hero.className = "hero";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Author";
  const heading = document.createElement("h1");
  heading.textContent = author.name;
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = plain(author.description) || "No biography is published for this author.";
  const profile = document.createElement("div");
  profile.className = "person";
  profile.style.marginTop = "16px";
  profile.append(avatar(author));
  const original = document.createElement("a");
  original.href = author.link;
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  original.textContent = "Profile on FilipinoX Stories";
  original.style.color = "var(--gold)";
  profile.append(original);
  hero.append(eyebrow, heading, lede, profile);

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const summary = document.createElement("p");
  summary.textContent = `${formatNumber(posts.total)} ${posts.total === 1 ? "story" : "stories"}`;
  toolbar.append(summary);

  const list = document.createElement("div");
  list.className = "story-list";
  if (!posts.data.length) {
    list.append(messageBlock("No stories yet.", "This author has no public stories in the catalog."));
  } else {
    posts.data.forEach((post) => list.append(storyRow(post)));
  }

  view.append(
    hero,
    toolbar,
    list,
    pager(page, posts.pages, (next) => (next > 1 ? `#/author/${id}?page=${next}` : `#/author/${id}`))
  );
}

function renderCategories() {
  view.innerHTML = "";
  const hero = document.createElement("section");
  hero.className = "hero";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Browse";
  const heading = document.createElement("h1");
  heading.textContent = "Categories";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "The same categories used on FilipinoX Stories. Counts update from the live catalog.";
  hero.append(eyebrow, heading, lede);

  const grid = document.createElement("div");
  grid.className = "category-grid";
  cache.categories.forEach((category) => {
    const card = document.createElement("a");
    card.className = "category-card";
    card.href = `#/?cat=${category.id}`;
    const title = document.createElement("h2");
    title.textContent = category.name;
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${formatNumber(category.count)} stories`;
    card.append(title, meta);
    grid.append(card);
  });
  view.append(hero, grid);
}

function pager(page, pages, hrefFor) {
  const nav = document.createElement("nav");
  nav.className = "pager";
  nav.setAttribute("aria-label", "Pagination");
  if (pages <= 1) return nav;

  const addLink = (label, target, current = false) => {
    if (current) {
      const span = document.createElement("span");
      span.className = "current";
      span.textContent = label;
      span.setAttribute("aria-current", "page");
      nav.append(span);
      return;
    }
    const link = document.createElement("a");
    link.href = hrefFor(target);
    link.textContent = label;
    nav.append(link);
  };

  if (page > 1) addLink("Previous", page - 1);
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  if (start > 1) addLink("1", 1);
  for (let number = start; number <= end; number += 1) addLink(String(number), number, number === page);
  if (end < pages) addLink(String(pages), pages);
  if (page < pages) addLink("Next", page + 1);
  return nav;
}

function stat(value, label) {
  const box = document.createElement("div");
  box.className = "stat";
  const strong = document.createElement("b");
  strong.textContent = formatNumber(value);
  const span = document.createElement("span");
  span.textContent = label;
  box.append(strong, span);
  return box;
}

function avatar(author) {
  const url = author.avatar_urls && (author.avatar_urls["96"] || author.avatar_urls["48"]);
  if (url) {
    const image = document.createElement("img");
    image.className = "avatar";
    image.alt = "";
    image.src = url;
    image.addEventListener("error", () => {
      image.replaceWith(fallbackAvatar(author.name));
    });
    return image;
  }
  return fallbackAvatar(author.name);
}

function fallbackAvatar(name) {
  const span = document.createElement("span");
  span.className = "avatar avatar-fallback";
  span.textContent = (name || "?").slice(0, 1).toUpperCase();
  return span;
}

function personText(name, description) {
  const wrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = name;
  wrap.append(title);
  const bio = plain(description);
  if (bio) {
    const text = document.createElement("p");
    text.className = "excerpt";
    text.textContent = bio.length > 110 ? `${bio.slice(0, 107)}…` : bio;
    wrap.append(text);
  }
  return wrap;
}

function coverImage(post, sizeNames, className) {
  const image = featuredImage(post, sizeNames);
  if (!image) return null;
  const element = document.createElement("img");
  element.className = className;
  element.src = image.src;
  element.alt = image.alt;
  element.loading = "lazy";
  element.decoding = "async";
  return element;
}

function featuredImage(post, sizeNames) {
  const media = post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0];
  if (!media || media.code || !media.source_url) return null;
  const sizes = (media.media_details && media.media_details.sizes) || {};
  const size = sizeNames.map((name) => sizes[name]).find(Boolean);
  return {
    src: (size && size.source_url) || media.source_url,
    alt: media.alt_text || plain(post.title && post.title.rendered),
  };
}

function authorFrom(post) {
  const embedded = post._embedded && post._embedded.author && post._embedded.author[0];
  if (!embedded || embedded.code) return null;
  return embedded;
}

function categoriesFrom(post) {
  const groups = (post._embedded && post._embedded["wp:term"]) || [];
  return groups.flat().filter((term) => term.taxonomy === "category");
}

function setStatus(text) {
  view.innerHTML = "";
  const status = document.createElement("p");
  status.className = "status";
  status.textContent = text;
  view.append(status);
}

function messageBlock(title, detail) {
  const wrap = document.createElement("div");
  wrap.className = "empty";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const text = document.createElement("p");
  text.className = "muted";
  text.textContent = detail;
  wrap.append(heading, text);
  return wrap;
}

function labelSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

async function loadFullStory(story) {
  const html = (story.content && story.content.rendered) || "";
  const linked = story.meta && story.meta._links_to;
  if (plain(html) || !linked) return { html, source: story.link };
  try {
    const url = new URL(linked);
    const slug = url.pathname.split("/").filter(Boolean).pop();
    if (!slug) return { html: "", source: linked };
    const response = await fetch(`${url.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=link,content`);
    if (!response.ok) return { html: "", source: linked };
    const posts = await response.json();
    const post = Array.isArray(posts) ? posts[0] : null;
    if (!post || !post.content) return { html: "", source: linked };
    return { html: post.content.rendered || "", source: post.link || linked };
  } catch {
    return { html: "", source: linked };
  }
}

async function api(path) {
  const response = await fetch(`${API}${path}`);
  const total = Number(response.headers.get("X-WP-Total") || 0);
  const pages = Number(response.headers.get("X-WP-TotalPages") || 0);
  const data = await response.json();
  if (!response.ok && !data.code) {
    throw new Error(`Request failed (${response.status})`);
  }
  return { data, total, pages };
}

function plain(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html || "";
  return (holder.textContent || "").replace(/\s+/g, " ").trim();
}

function sanitizeStoryHtml(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const blocked = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "form", "svg"]);
  doc.body.querySelectorAll("*").forEach((element) => {
    if (blocked.has(element.tagName.toLowerCase())) {
      element.remove();
      return;
    }
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";
      if (name.startsWith("on") || name === "style" || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      }
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A") {
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
  });
  return doc.body.innerHTML;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function clampPage(value) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function findAdjacentChapters(currentStory) {
  if (!currentStory || !currentStory.id) return { next: null, prev: null };
  if (cache.chapters.has(currentStory.id)) {
    return cache.chapters.get(currentStory.id);
  }

  const currentTitle = cleanTitleString((currentStory.title && currentStory.title.rendered) || currentStory.title);
  const currentSlug = currentStory.slug || "";
  const seriesInfo = parseStorySeries(currentTitle, currentSlug);
  const currentNum = seriesInfo.number;
  const baseKey = normalizeSeriesKey(seriesInfo.base);

  const candidateMap = new Map();
  const addCandidates = (result) => {
    const posts = Array.isArray(result) ? result : (result && result.data);
    if (!Array.isArray(posts)) return;
    for (const p of posts) {
      if (p.id !== currentStory.id && !candidateMap.has(p.id)) {
        candidateMap.set(p.id, p);
      }
    }
  };

  const author = authorFrom(currentStory);
  const authorId = author ? author.id : (typeof currentStory.author === "number" ? currentStory.author : null);
  const cleanSearch = seriesInfo.base
    .replace(/&#[0-9]+;/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const authorPromises = [];
  if (authorId) {
    if (cleanSearch) {
      authorPromises.push(
        api(`/posts?author=${authorId}&search=${encodeURIComponent(cleanSearch)}&per_page=50&_fields=id,title,slug,date,author`)
          .then(addCandidates)
          .catch(() => {})
      );
    }
    if (currentStory.date) {
      authorPromises.push(
        api(`/posts?author=${authorId}&after=${encodeURIComponent(currentStory.date)}&order=asc&orderby=date&per_page=15&_fields=id,title,slug,date,author`)
          .then(addCandidates)
          .catch(() => {})
      );
    }
  }

  await Promise.all(authorPromises);

  const filterMatches = () => {
    const matches = [];
    for (const post of candidateMap.values()) {
      const postTitle = cleanTitleString((post.title && post.title.rendered) || post.title);
      const postSeries = parseStorySeries(postTitle, post.slug);
      const postBaseKey = normalizeSeriesKey(postSeries.base);

      const isBaseMatch = postBaseKey === baseKey ||
        postBaseKey.startsWith(baseKey) ||
        baseKey.startsWith(postBaseKey) ||
        (currentSlug && post.slug && post.slug.startsWith(currentSlug.replace(/-\d+$/, "")));

      if (!isBaseMatch) continue;

      matches.push({
        post,
        number: postSeries.number,
        title: postTitle,
        date: new Date(post.date).getTime() || 0,
      });
    }
    return matches;
  };

  let matches = filterMatches();

  const hasNextInMatches = currentNum !== null
    ? matches.some((m) => m.number !== null && m.number > currentNum)
    : matches.some((m) => m.number === 2 || m.date >= new Date(currentStory.date).getTime());

  if (!hasNextInMatches && cleanSearch.length >= 3) {
    try {
      const res = await api(`/posts?search=${encodeURIComponent(cleanSearch)}&per_page=30&_fields=id,title,slug,date,author`);
      addCandidates(res);
      matches = filterMatches();
    } catch {}
  }

  let next = null;
  let prev = null;

  if (currentNum !== null) {
    const nextExact = matches.find((m) => m.number === currentNum + 1);
    if (nextExact) {
      next = nextExact.post;
    } else {
      const greater = matches.filter((m) => m.number !== null && m.number > currentNum).sort((a, b) => a.number - b.number);
      if (greater.length > 0) next = greater[0].post;
    }

    const prevExact = matches.find((m) => m.number === currentNum - 1);
    if (prevExact) {
      prev = prevExact.post;
    } else {
      const lesser = matches.filter((m) => m.number !== null && m.number < currentNum).sort((a, b) => b.number - a.number);
      if (lesser.length > 0) prev = lesser[0].post;
    }
  } else {
    const ch2 = matches.find((m) => m.number === 2);
    if (ch2) {
      next = ch2.post;
    } else {
      const after = matches.filter((m) => m.date >= new Date(currentStory.date).getTime()).sort((a, b) => a.date - b.date);
      if (after.length > 0) next = after[0].post;
    }
  }

  const result = { next, prev, series: seriesInfo };
  cache.chapters.set(currentStory.id, result);
  return result;
}

function parseStorySeries(title, slug = "") {
  const clean = cleanTitleString(title);

  const patterns = [
    /^(.*?)\s*[-:]?\s*(?:chapter|part|ch|act)\s*([0-9]+|[ivxlcdm]+)\s*[-:–—(]\s*(.*)$/i,
    /^(.*?)\s+([0-9]+)\s*[-:–—]\s*(.*)$/i,
    /^(.*?)\s*[-:]?\s*\(?\s*(?:chapter|part|ch|act)\s*([0-9]+|[ivxlcdm]+)\s*\)?$/i,
    /^(.*?)\s*\(([0-9]+|[ivxlcdm]+)\)$/i,
    /^(.*?)\s+([0-9]+)$/i,
    /^(.*?)\s+([ivxlcdm]{2,})$/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      const base = match[1].trim().replace(/[-–—:]$/, "").trim();
      const rawNum = match[2];
      const num = /^[0-9]+$/.test(rawNum) ? parseInt(rawNum, 10) : romanToNumber(rawNum);
      if (num !== null && base.length >= 2) {
        return { base, number: num, cleanTitle: clean };
      }
    }
  }

  if (slug) {
    const slugMatch = slug.match(/^(.*?)(?:-(?:part|chapter|ch|act))?-([0-9]+)(?:-[0-9]+)?$/i);
    if (slugMatch) {
      const num = parseInt(slugMatch[2], 10);
      if (!Number.isNaN(num)) {
        return { base: clean, number: num, cleanTitle: clean, fromSlug: true };
      }
    }
  }

  return { base: clean, number: null, cleanTitle: clean };
}

function cleanTitleString(title) {
  return plain(title)
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSeriesKey(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function romanToNumber(str) {
  if (!str) return null;
  const roman = str.toUpperCase().trim();
  if (!/^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i.test(roman)) return null;
  const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
  let num = 0;
  let i = 0;
  for (const [r, val] of Object.entries(lookup)) {
    while (roman.substr(i, r.length) === r) {
      num += val;
      i += r.length;
    }
  }
  return num > 0 ? num : null;
}
