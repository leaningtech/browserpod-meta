const searchInput = document.querySelector("#cheatSearch");
const searchMeta = document.querySelector("#searchMeta");
const cards = Array.from(document.querySelectorAll(".cheat-card"));

const cardRows = cards.map((card) => {
  const rows = Array.from(card.querySelectorAll("tr[data-command]"));
  return {
    card,
    rows,
    title: String(card.dataset.cardTitle || "").toLowerCase(),
  };
});

const totalCommands = cardRows.reduce((sum, item) => sum + item.rows.length, 0);

function rowText(row) {
  return String(row.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function setMetaText(message) {
  if (!searchMeta) {
    return;
  }
  searchMeta.textContent = message;
}

function applySearch(queryText = "") {
  const query = String(queryText || "").trim().toLowerCase();
  let visibleCommands = 0;
  let visibleCards = 0;

  cardRows.forEach(({ card, rows, title }) => {
    let cardVisibleRows = 0;

    rows.forEach((row) => {
      const matches = !query || title.includes(query) || rowText(row).includes(query);
      row.hidden = !matches;
      row.dataset.match = matches ? "true" : "false";
      if (matches) {
        cardVisibleRows += 1;
      }
    });

    const showCard = cardVisibleRows > 0;
    card.hidden = !showCard;
    if (showCard) {
      visibleCards += 1;
      visibleCommands += cardVisibleRows;
    }
  });

  if (!query) {
    setMetaText(`Showing all ${totalCommands} commands across ${cards.length} sections.`);
    return;
  }

  setMetaText(
    `Showing ${visibleCommands} command${visibleCommands === 1 ? "" : "s"} in ${visibleCards} section${visibleCards === 1 ? "" : "s"}.`
  );
}

searchInput?.addEventListener("input", (event) => {
  applySearch(event.target.value);
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "/") {
    return;
  }

  const target = event.target;
  const tagName = target && typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
  if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) {
    return;
  }

  event.preventDefault();
  searchInput?.focus();
  searchInput?.select();
});

applySearch("");
