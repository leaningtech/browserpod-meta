function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createSectionCard({ title, items }) {
  const card = document.createElement("section");
  card.className = "cheatsheet-section";

  const heading = document.createElement("h3");
  heading.className = "cheatsheet-section-title";
  heading.textContent = title;
  card.append(heading);

  const list = document.createElement("div");
  list.className = "cheatsheet-section-list";

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "cheatsheet-item";

    const command = document.createElement("p");
    command.className = "cheatsheet-item-command";
    command.textContent = item.command;
    row.append(command);

    const description = document.createElement("p");
    description.className = "cheatsheet-item-description";
    description.textContent = item.description;
    row.append(description);

    list.append(row);
  });

  card.append(list);
  return card;
}

function parseSectionsFromDocument(doc) {
  const cards = Array.from(doc.querySelectorAll(".cheat-card"));
  const sections = [];

  cards.forEach((card) => {
    const title = sanitizeText(card.querySelector("h2")?.textContent || "Section");
    const rows = Array.from(card.querySelectorAll("tr[data-command]"));
    const items = rows
      .map((row) => {
        const cells = row.querySelectorAll("td");
        const command = sanitizeText(cells[0]?.textContent || "");
        const description = sanitizeText(cells[1]?.textContent || "");
        if (!command || !description) {
          return null;
        }
        return { command, description };
      })
      .filter(Boolean);

    if (items.length === 0) {
      return;
    }
    sections.push({ title, items });
  });

  return sections;
}

function createFallbackSections() {
  return [
    {
      title: "Core Motions",
      items: [
        { command: "h j k l", description: "Move left, down, up, right." },
        { command: "w b e", description: "Word forward, backward, and end." },
        { command: "0 ^ $", description: "Start, first non-blank, end of line." },
        { command: "gg G", description: "Jump to top or bottom of file." },
      ],
    },
    {
      title: "Edit Basics",
      items: [
        { command: "i a o", description: "Insert, append, open line below." },
        { command: "dd yy p", description: "Delete line, yank line, paste." },
        { command: "u <C-r>", description: "Undo and redo." },
        { command: ":w :q :wq", description: "Save, quit, save + quit." },
      ],
    },
  ];
}

export function createCheatSheetPanelService({ ui }) {
  const runtime = {
    loaded: false,
    loading: false,
  };

  function setMeta(message) {
    if (!ui.cheatSheetPanelMeta) {
      return;
    }
    ui.cheatSheetPanelMeta.textContent = message;
  }

  function renderSections(sections) {
    if (!ui.cheatSheetPanelList) {
      return;
    }

    ui.cheatSheetPanelList.textContent = "";
    const safeSections = Array.isArray(sections) ? sections : [];
    if (safeSections.length === 0) {
      setMeta("No commands available.");
      return;
    }

    let commandCount = 0;
    safeSections.forEach((section) => {
      commandCount += Array.isArray(section.items) ? section.items.length : 0;
      ui.cheatSheetPanelList.append(
        createSectionCard({
          title: section.title,
          items: section.items || [],
        })
      );
    });

    setMeta(`${commandCount} commands across ${safeSections.length} sections.`);
  }

  async function loadCheatSheetSections() {
    const response = await fetch("/vim-cheatsheet.html", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Failed to load cheat sheet (${response.status}).`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return parseSectionsFromDocument(doc);
  }

  async function ensureLoaded() {
    if (runtime.loaded || runtime.loading) {
      return;
    }

    runtime.loading = true;
    setMeta("Loading commands...");
    try {
      const sections = await loadCheatSheetSections();
      renderSections(sections);
      runtime.loaded = true;
    } catch (error) {
      console.warn("Cheat sheet panel load failed", error);
      renderSections(createFallbackSections());
      runtime.loaded = true;
    } finally {
      runtime.loading = false;
    }
  }

  return {
    ensureLoaded,
  };
}
