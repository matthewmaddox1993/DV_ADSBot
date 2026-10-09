function clampText(value, max = 1024) {
  const text = value === undefined || value === null || value === '' ? '—' : String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function num(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function unixTime(ms) {
  if (!Number.isFinite(Number(ms))) return '—';
  return `<t:${Math.floor(Number(ms) / 1000)}:R>`;
}

function stateName(value) {
  if (value === undefined || value === null || value === '') return 'Unknown';
  return String(value).replace(/([a-z])([A-Z])/g, '$1 $2');
}

module.exports = { clampText, num, yesNo, unixTime, stateName };
