const { baseEmbed, addFieldsSafe, COLORS } = require('../utils/embeds');
const { unixTime } = require('../utils/format');
const logger = require('../utils/logger');

class AlertService {
  constructor(client, dispatcher, config) {
    this.client = client;
    this.dispatcher = dispatcher;
    this.config = config;
    this.boundStatus = (status) => this.onStatus(status);
    this.boundEvent = (event) => this.onEvent(event);
  }

  start() {
    if (!this.config.alerts?.enabled) return;
    this.dispatcher.on('status', this.boundStatus);
    this.dispatcher.on('dispatcherEvent', this.boundEvent);
  }

  stop() {
    this.dispatcher.off('status', this.boundStatus);
    this.dispatcher.off('dispatcherEvent', this.boundEvent);
  }

  async channel() {
    const id = this.config.channels?.alerts;
    if (!id) return null;
    try {
      const channel = await this.client.channels.fetch(id);
      return channel?.isTextBased() ? channel : null;
    } catch { return null; }
  }

  async onStatus(status) {
    if (!this.config.alerts?.connectionChanges || !['connected','offline'].includes(status)) return;
    const channel = await this.channel();
    if (!channel) return;
    const embed = baseEmbed('Dispatcher Connection', status === 'connected' ? COLORS.ok : COLORS.warn)
      .setDescription(`Advanced Dispatcher System is **${status}**.`);
    await channel.send({ embeds: [embed] }).catch((e) => logger.warn('Alert send failed', e.message));
  }

  async onEvent(event) {
    if (!this.config.alerts?.dispatcherEvents || !event) return;
    const channel = await this.channel();
    if (!channel) return;
    const embed = baseEmbed(`Dispatcher Event: ${event.code || event.type || 'Event'}`, COLORS.info);
    addFieldsSafe(embed, [
      { name: 'Detail', value: event.detail || event.message || '—', inline: false },
      { name: 'Target', value: event.target || event.targetId || '—', inline: true },
      { name: 'Source', value: event.source || '—', inline: true },
      { name: 'Time', value: unixTime(event.time), inline: true },
    ]);
    await channel.send({ embeds: [embed] }).catch((e) => logger.warn('Event alert failed', e.message));
  }
}

module.exports = AlertService;
