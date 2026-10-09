const fs = require('node:fs');
const path = require('node:path');
const { baseEmbed, addFieldsSafe, COLORS } = require('../utils/embeds');
const { num } = require('../utils/format');
const logger = require('../utils/logger');

class BoardService {
  constructor(client, dispatcher, config) {
    this.client = client;
    this.dispatcher = dispatcher;
    this.config = config;
    this.timer = null;
    this.dataFile = path.resolve(config.__rootDir, 'data', 'board.json');
  }

  readData() {
    try { return JSON.parse(fs.readFileSync(this.dataFile, 'utf8')); } catch { return {}; }
  }

  writeData(data) {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
  }

  buildEmbed() {
    const store = this.dispatcher.store;
    const trains = store.trains();
    const activeRoutes = store.routes.filter((r) => !r.endedAt);
    const occupiedBlocks = [...store.blocks.values()].filter((b) => b.occupied).length;
    const activeJobs = [...store.jobs.values()].filter((j) => j.state === 'InProgress' || j.active).length;
    const weather = store.capabilities?.weather || store.capabilities?.conditions || null;
    const embed = baseEmbed('🚂 Derail Valley Dispatch Board', this.dispatcher.status === 'connected' ? COLORS.ok : COLORS.warn)
      .setDescription(this.dispatcher.status === 'connected' ? 'Live data from Advanced Dispatcher System.' : `Dispatcher connection: **${this.dispatcher.status}**`);
    addFieldsSafe(embed, [
      { name: 'Connection', value: this.dispatcher.status, inline: true },
      { name: 'ADS Account', value: this.dispatcher.user ? `${this.dispatcher.user.name || 'Unknown'} (${this.dispatcher.user.role || 'unknown'})` : 'Not signed in', inline: true },
      { name: 'Authority', value: store.capabilities?.authority ? 'Available' : 'Unavailable', inline: true },
      { name: 'Trains', value: String(trains.length), inline: true },
      { name: 'Players', value: String(store.players.size), inline: true },
      { name: 'Active Jobs', value: String(activeJobs), inline: true },
      { name: 'Active Routes', value: String(activeRoutes.length), inline: true },
      { name: 'Occupied Blocks', value: String(occupiedBlocks), inline: true },
      { name: 'Signals', value: String(store.signals.size), inline: true },
      { name: 'Tracks', value: String(store.tracks.size), inline: true },
      { name: 'Cars', value: String(store.cars.size), inline: true },
      { name: 'State Age', value: store.lastMessageAt ? `${num((Date.now() - store.lastMessageAt) / 1000, 1)}s` : '—', inline: true },
      ...(weather ? [{ name: 'Weather', value: typeof weather === 'string' ? weather : JSON.stringify(weather).slice(0, 1000), inline: false }] : []),
    ]);
    return embed;
  }

  async setup(channel) {
    const message = await channel.send({ embeds: [this.buildEmbed()] });
    this.writeData({ channelId: channel.id, messageId: message.id });
    return message;
  }

  async refresh() {
    const data = this.readData();
    if (!data.channelId || !data.messageId) return false;
    try {
      const channel = await this.client.channels.fetch(data.channelId);
      if (!channel?.isTextBased()) return false;
      const message = await channel.messages.fetch(data.messageId);
      await message.edit({ embeds: [this.buildEmbed()] });
      return true;
    } catch (error) {
      logger.warn('Could not refresh dispatch board', error.message);
      return false;
    }
  }

  disable() {
    this.writeData({});
  }

  start() {
    if (!this.config.board?.enabled) return;
    const seconds = Math.max(10, Number(this.config.board?.refreshSeconds || 15));
    this.stop();
    this.timer = setInterval(() => this.refresh().catch(() => {}), seconds * 1000);
    this.refresh().catch(() => {});
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = BoardService;
