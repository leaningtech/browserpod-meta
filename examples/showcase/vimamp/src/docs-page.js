const ui = {
  search: document.querySelector("#docsSearch"),
  meta: document.querySelector("#docsMeta"),
  toc: document.querySelector("#docsToc"),
  sections: Array.from(document.querySelectorAll("[data-doc-section]")),
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSectionIndex(section) {
  const titleElement = section.querySelector("h2");
  const title = String(titleElement?.textContent || "").trim();
  const id = String(section.id || "").trim();
  const text = normalizeText(section.textContent || "");
  return { id, title, text };
}

const indexedSections = ui.sections.map((section) => ({
  section,
  ...buildSectionIndex(section),
}));

function buildToc() {
  if (!ui.toc) {
    return;
  }
  ui.toc.innerHTML = "";
  indexedSections.forEach((entry) => {
    const link = document.createElement("a");
    link.className = "docs-toc-link";
    link.href = `#${entry.id}`;
    link.textContent = entry.title;
    link.dataset.target = entry.id;
    ui.toc.appendChild(link);
  });
}

function setMeta(message) {
  if (ui.meta) {
    ui.meta.textContent = message;
  }
}

function updateTocActiveState() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  const links = Array.from(document.querySelectorAll(".docs-toc-link"));
  links.forEach((link) => {
    const target = String(link.dataset.target || "");
    link.classList.toggle("is-active", Boolean(hash) && target === hash);
  });
}

function applyFilter(rawQuery) {
  const query = normalizeText(rawQuery);
  let visible = 0;

  indexedSections.forEach((entry) => {
    const shouldShow = !query || entry.title.toLowerCase().includes(query) || entry.text.includes(query);
    entry.section.hidden = !shouldShow;
    if (shouldShow) {
      visible += 1;
    }
  });

  if (!query) {
    setMeta(`${indexedSections.length} sections`);
    return;
  }

  setMeta(`${visible} of ${indexedSections.length} sections match "${query}"`);
}

function installHandlers() {
  ui.search?.addEventListener("input", () => {
    applyFilter(ui.search.value);
  });

  window.addEventListener("hashchange", () => {
    updateTocActiveState();
  });
}

buildToc();
applyFilter("");
updateTocActiveState();
installHandlers();
