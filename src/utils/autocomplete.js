function textOf(item) {
  return String(item?.name || item?.displayName || item?.id || '');
}

function choices(items, focused, id = (x) => x.id, label = textOf) {
  const q = String(focused || '').toLowerCase();
  return items
    .filter(Boolean)
    .filter((x) => `${label(x)} ${id(x)}`.toLowerCase().includes(q))
    .slice(0, 25)
    .map((x) => ({ name: String(label(x)).slice(0, 100), value: String(id(x)).slice(0, 100) }));
}

function commaSeparatedChoices(items, focused, id = (x) => x.id, label = textOf) {
  const parts = String(focused || '').split(',');
  const selected = parts.slice(0, -1).map((value) => value.trim()).filter(Boolean);
  const selectedIds = new Set(selected.map((value) => value.toLowerCase()));
  const current = parts.at(-1)?.trim() || '';
  const query = current.toLowerCase();

  return items
    .filter(Boolean)
    .map((item) => ({
      id: String(id(item) ?? ''),
      label: String(label(item) ?? ''),
    }))
    .filter((item) => item.id && !selectedIds.has(item.id.toLowerCase()))
    .filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(query))
    .map((item) => {
      const value = [...selected, item.id].join(',');
      return {
        name: `${selected.length ? 'Add ' : ''}${item.label}`.slice(0, 100),
        value,
      };
    })
    .filter((choice) => choice.name && choice.value.length <= 100)
    .slice(0, 25);
}

module.exports = { choices, commaSeparatedChoices };
