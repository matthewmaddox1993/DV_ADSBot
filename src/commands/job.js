const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe } = require('../utils/embeds');
const { canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');
const { num } = require('../utils/format');

function normalizedStatus(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function isInProgress(job) {
  return Boolean(job?.active) || ['active', 'inprogress'].includes(normalizedStatus(job?.state));
}

function filterByStatus(jobs, status) {
  const wanted = normalizedStatus(status);
  if (wanted === 'inprogress') return jobs.filter(isInProgress);
  return jobs.filter((job) => normalizedStatus(job.state) === wanted);
}

function jobState(job) {
  return job.state || (job.active ? 'InProgress' : 'Unknown');
}

function jobProgress(job) {
  const done = Number(job.tasksDone);
  const total = Number(job.tasksTotal);
  if (Number.isFinite(done) && Number.isFinite(total)) {
    const percentage = total > 0 ? ` (${num((done / total) * 100, 1)}%)` : '';
    return `${done}/${total} tasks${percentage}`;
  }
  if (job.progress !== undefined) {
    const progress = Number(job.progress);
    if (Number.isFinite(progress)) return `${num(progress * (progress <= 1 ? 100 : 1), 1)}%`;
  }
  return '—';
}

function statusChoices(jobs, focused) {
  const counts = new Map();
  for (const job of jobs) {
    if (job.state === undefined || job.state === null || job.state === '') continue;
    const value = String(job.state);
    const key = normalizedStatus(value);
    if (['active', 'inprogress'].includes(key)) continue;
    const current = counts.get(key) || { id: value, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }

  const values = [
    { id: 'InProgress', name: `In progress (${jobs.filter(isInProgress).length})` },
    ...[...counts.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((status) => ({ id: status.id, name: `${status.id} (${status.count})` })),
  ];
  return choices(values, focused, (status) => status.id, (status) => status.name);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('View Derail Valley jobs/orders')
    .addSubcommand((s) => s.setName('list').setDescription('List jobs').addStringOption((o) => o.setName('status').setDescription('Filter by status').setAutocomplete(true)).addIntegerOption((o) => o.setName('limit').setDescription('1-20 results').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('active').setDescription('List jobs currently in progress').addIntegerOption((o) => o.setName('limit').setDescription('1-20 results').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('info').setDescription('Show job details').addStringOption((o) => o.setName('id').setDescription('Job ID').setRequired(true).setAutocomplete(true))),
  async autocomplete(interaction, ctx) {
    const jobs = [...ctx.dispatcher.store.jobs.values()];
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'status') return interaction.respond(statusChoices(jobs, focused.value));
    return interaction.respond(choices(jobs, focused.value, (x) => x.id, (x) => `${x.id} • ${x.typeName || x.type || jobState(x)}`));
  },
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view jobs.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    let jobs = [...ctx.dispatcher.store.jobs.values()];
    if (sub === 'list' || sub === 'active') {
      const status = sub === 'list' ? interaction.options.getString('status') : null;
      if (sub === 'active') jobs = jobs.filter(isInProgress);
      else if (status) jobs = filterByStatus(jobs, status);
      const limit = interaction.options.getInteger('limit') || 15;
      const lines = jobs.slice(0, limit).map((j) => `**${j.id}** — ${j.typeName || j.type || 'Job'} • ${jobState(j)}${j.destination ? ` • → ${j.destination}` : ''}`);
      const title = sub === 'active' || normalizedStatus(status) === 'inprogress' ? `Jobs in Progress (${jobs.length})` : `Jobs (${jobs.length})`;
      return interaction.editReply({ embeds: [baseEmbed(title).setDescription(lines.join('\n') || 'No matching jobs.')] });
    }
    const id = interaction.options.getString('id', true);
    const j = ctx.dispatcher.store.findMapItem('jobs', id);
    if (!j) return interaction.editReply({ embeds: [require('../utils/embeds').errorEmbed('Job not found', `No job matched \`${id}\`.`)] });
    const embed = baseEmbed(`Job ${j.id}`);
    addFieldsSafe(embed, [
      { name: 'Type', value: j.typeName || j.type || '—', inline: true },
      { name: 'State', value: jobState(j), inline: true },
      { name: 'Owner / Player', value: j.owner || j.player || j.assignedPlayerName || j.assignedPlayer || '—', inline: true },
      { name: 'Origin', value: j.origin || '—', inline: true },
      { name: 'Destination', value: j.destination || '—', inline: true },
      { name: 'Payment', value: j.payment !== undefined ? String(j.payment) : '—', inline: true },
      { name: 'Cars', value: Array.isArray(j.cars) ? j.cars.join(', ') : String(j.cars || '—'), inline: false },
      { name: 'Cargo', value: Array.isArray(j.cargo) ? j.cargo.join(', ') || '—' : String(j.cargo || '—'), inline: false },
      { name: 'Progress', value: jobProgress(j), inline: true },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
