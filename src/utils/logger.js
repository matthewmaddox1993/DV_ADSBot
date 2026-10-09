function stamp() {
  return new Date().toISOString();
}

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`;
  const line = `[${stamp()}] [${level}] ${message}${suffix}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

module.exports = {
  info: (m, e) => log('INFO', m, e),
  warn: (m, e) => log('WARN', m, e),
  error: (m, e) => log('ERROR', m, e),
  debug: (m, e) => process.env.DEBUG && log('DEBUG', m, e),
};
