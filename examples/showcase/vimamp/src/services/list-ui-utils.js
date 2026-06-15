export function normalizeEntryType(type) {
  if (type === "dir" || type === "file") {
    return type;
  }
  return "other";
}

export function createEmptyListRow(className, text) {
  const row = document.createElement("li");
  row.className = className;
  row.textContent = text;
  return row;
}

export function createDirectoryEntryRow({
  rowClass,
  nameClass,
  path,
  entryType,
  name,
  selected = false,
  interactive = false,
}) {
  const row = document.createElement("li");
  row.className = rowClass;
  row.dataset.path = path;
  row.dataset.type = entryType;
  if (interactive) {
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
  }
  if (selected) {
    row.classList.add("is-selected");
  }

  const label = document.createElement("span");
  label.className = nameClass;
  label.textContent = name;

  row.appendChild(label);
  return row;
}

export function findListItem(event, selector) {
  return event.target instanceof Element ? event.target.closest(selector) : null;
}

export function readListItemPathType(item) {
  return {
    path: item.getAttribute("data-path") || "",
    type: item.getAttribute("data-type") || "other",
  };
}
