const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { X509Certificate } = require('node:crypto');
const { Agent, fetch } = require('undici');
const WebSocket = require('ws');
const StateStore = require('./StateStore');
const logger = require('../../utils/logger');

class DispatcherClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.baseUrl = String(config.dispatcher.baseUrl).replace(/\/$/, '');
    this.origin = new URL(this.baseUrl).origin;
    this.username = config.dispatcher.username;
    this.password = config.dispatcher.password;
    this.cookie = '';
    this.user = null;
    this.ws = null;
    this.enabled = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.waiters = new Map();
    this.status = 'offline';
    this.store = new StateStore();
    this.ca = this.loadCa();
    this.rejectUnauthorized = config.dispatcher.rejectUnauthorized !== false;
    this.httpAgent = new Agent({ connect: { rejectUnauthorized: this.rejectUnauthorized, ca: this.ca || undefined } });
    this.store.on('dispatcherEvent', (event) => this.emit('dispatcherEvent', event));
  }

  loadCa() {
    const file = this.config.dispatcher.caFile;
    if (!file) return null;
    const resolved = path.isAbsolute(file) ? file : path.resolve(this.config.__rootDir, file);
    if (!fs.existsSync(resolved)) {
      if (this.config.dispatcher.rejectUnauthorized !== false) logger.warn(`Dispatcher CA file not found: ${resolved}`);
      return null;
    }
    const raw = fs.readFileSync(resolved);
    try {
      const certificate = new X509Certificate(raw);
      logger.info(`Loaded dispatcher CA certificate: ${resolved} (SHA-256 ${certificate.fingerprint256})`);
      return certificate.toString();
    } catch (error) {
      logger.warn('Could not parse dispatcher CA certificate; TLS may fail.', error.message);
      return raw;
    }
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.store.setConnection(status === 'connected');
    this.emit('status', status);
    logger.info(`Dispatcher connection: ${status}`);
  }

  headers(extra = {}) {
    return {
      Accept: 'application/json',
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...extra,
    };
  }

  describeNetworkError(error) {
    const parts = [];
    let current = error;
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const code = current.code || current.errno;
      const message = current.message;
      if (code || message) parts.push([code, message].filter(Boolean).join(': '));
      current = current.cause;
    }
    return [...new Set(parts)].join(' -> ') || String(error);
  }

  async request(route, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.config.dispatcher.connectTimeoutMs || 10000);
    try {
      try {
        const method = String(options.method || 'GET').toUpperCase();
        const requestHeaders = {
          ...(method !== 'GET' && method !== 'HEAD'
            ? { Origin: this.origin, Referer: `${this.origin}/` }
            : {}),
          ...(options.headers || {}),
        };
        const response = await fetch(`${this.baseUrl}${route}`, {
          method,
          headers: this.headers(requestHeaders),
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          cache: 'no-store',
          signal: options.signal || controller.signal,
          dispatcher: this.httpAgent,
        });
        const setCookies = response.headers.getSetCookie?.() || [];
        if (setCookies.length) this.cookie = setCookies[0].split(';', 1)[0];
        return response;
      } catch (error) {
        const detail = this.describeNetworkError(error);
        const wrapped = new Error(`Dispatcher request ${route} failed: ${detail}`);
        wrapped.cause = error;
        throw wrapped;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async me() {
    const response = await this.request('/api/me');
    if (!response.ok) return null;
    this.user = await response.json();
    return this.user;
  }

  async login() {
    const response = await this.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { name: this.username, password: this.password },
    });
    if (!response.ok) {
      let detail = '';
      try {
        const raw = (await response.text()).trim();
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            detail = parsed.code || parsed.error || parsed.message || parsed.detail || raw;
          } catch {
            detail = raw;
          }
        }
      } catch {}
      const suffix = detail ? ` ADS response: ${String(detail).slice(0, 500)}` : '';
      const err = new Error(`Dispatcher login failed with HTTP ${response.status}.${suffix}`);
      err.code = response.status === 401
        ? 'AUTH_REQUIRED'
        : response.status === 403
          ? 'FORBIDDEN'
          : response.status === 429
            ? 'RATE_LIMITED'
            : 'LOGIN_FAILED';
      throw err;
    }
    this.user = await response.json();
    logger.info(`Authenticated to Advanced Dispatcher System as ${this.user?.name || this.username} (${this.user?.role || 'unknown'})`);
    return this.user;
  }

  async ensureAuthenticated() {
    try {
      const current = await this.me();
      if (current) return current;
    } catch (error) {
      logger.debug('Session restore failed', error.message);
    }
    this.cookie = '';
    return this.login();
  }

  async health() {
    let response = await this.request('/api/health');
    if (response.status === 401) {
      await this.login();
      response = await this.request('/api/health');
    }
    if (!response.ok) throw new Error(`Dispatcher health returned HTTP ${response.status}.`);
    return response.json();
  }

  async previewRoute({ from, to, train = '', via = [] }) {
    const query = new URLSearchParams({ from, to, train: train || '' });
    if (via?.length) query.set('via', via.join(','));
    let response = await this.request(`/api/route?${query.toString()}`, { timeoutMs: 30000 });
    if (response.status === 401) {
      await this.login();
      response = await this.request(`/api/route?${query.toString()}`, { timeoutMs: 30000 });
    }
    if (!response.ok) {
      let detail = null;
      try { detail = await response.json(); } catch {}
      const error = new Error(detail?.code || `Route preview failed with HTTP ${response.status}.`);
      error.code = detail?.code || 'NO_ROUTE';
      throw error;
    }
    return response.json();
  }

  async start() {
    this.enabled = true;
    await this.ensureAuthenticated();
    this.connectWebSocket();
  }

  async reconnect({ resetState = false } = {}) {
    this.stopSocket();
    this.cookie = '';
    this.user = null;
    if (resetState) {
      const old = this.store;
      this.store = new StateStore();
      this.store.on('dispatcherEvent', (event) => this.emit('dispatcherEvent', event));
      this.emit('storeReplaced', this.store, old);
    }
    this.enabled = true;
    await this.ensureAuthenticated();
    this.connectWebSocket();
  }

  wsUrl() {
    const url = new URL('/api/ws', this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('epoch', this.store.serverEpoch || '');
    url.searchParams.set('seq', this.store.seq.toString());
    return url.toString();
  }

  connectWebSocket() {
    clearTimeout(this.reconnectTimer);
    if (!this.enabled) return;
    if (this.ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.ws.readyState)) return;

    this.setStatus(this.reconnectAttempt ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(this.wsUrl(), {
      origin: this.origin,
      headers: this.cookie ? { Cookie: this.cookie } : {},
      rejectUnauthorized: this.rejectUnauthorized,
      ca: this.ca || undefined,
      handshakeTimeout: this.config.dispatcher.connectTimeoutMs || 10000,
    });
    this.ws = socket;

    socket.on('open', () => {
      if (socket !== this.ws) return;
      this.reconnectAttempt = 0;
      this.setStatus('connected');
    });

    socket.on('message', (data, isBinary) => {
      if (socket !== this.ws) return;
      try {
        let text;
        if (isBinary) text = zlib.gunzipSync(Buffer.from(data)).toString('utf8');
        else text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const message = JSON.parse(text);
        this.store.consume(message);
        if (message.type === 'receipt' && message.payload?.status !== 'accepted') this.resolveReceipt(message.payload);
      } catch (error) {
        logger.warn('Dispatcher stream requires resync', error.message);
        this.store.serverEpoch = '';
        this.store.seq = 0n;
        socket.close();
      }
    });

    socket.on('error', (error) => logger.warn('Dispatcher WebSocket error', this.describeNetworkError(error)));

    socket.on('close', async (code) => {
      if (socket !== this.ws) return;
      this.ws = null;
      this.setStatus('offline');
      this.resolveAllWaiters({ status: 'outcomeUnknown', code: 'GAME_DISCONNECTED' });
      if (!this.enabled) return;

      // Session expiry or host restart can invalidate the cookie. Refresh auth before reconnecting.
      try {
        const current = await this.me();
        if (!current) await this.login();
      } catch (error) {
        logger.warn(`Dispatcher re-authentication failed after socket close (${code})`, this.describeNetworkError(error));
      }
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (!this.enabled) return;
    const min = this.config.dispatcher.reconnectMinMs || 1000;
    const max = this.config.dispatcher.reconnectMaxMs || 15000;
    const delay = Math.min(max, min * (2 ** Math.min(5, this.reconnectAttempt++)));
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
  }

  stopSocket() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.close(); } catch {}
    }
    this.resolveAllWaiters({ status: 'outcomeUnknown', code: 'GAME_DISCONNECTED' });
    this.setStatus('offline');
  }

  async stop() {
    this.enabled = false;
    this.stopSocket();
    try {
      if (this.cookie) await this.request('/api/logout', { method: 'POST' });
    } catch {}
    this.cookie = '';
    this.user = null;
  }

  resolveReceipt(receipt) {
    const waiter = this.waiters.get(receipt?.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.waiters.delete(receipt.id);
    waiter.resolve(receipt);
  }

  resolveAllWaiters(base) {
    for (const [id, waiter] of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id, ...base });
    }
    this.waiters.clear();
  }

  command(kind, fields = {}) {
    const id = crypto.randomUUID();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ id, status: 'rejected', code: 'GAME_DISCONNECTED' });
    }
    if (!this.store.canControl || !this.user || this.user.role === 'viewer') {
      return Promise.resolve({ id, status: 'rejected', code: 'FORBIDDEN' });
    }
    if (kind === 'loco' && (this.user.role !== 'admin' || !this.store.capabilities?.locoControls)) {
      return Promise.resolve({ id, status: 'rejected', code: 'FORBIDDEN' });
    }
    if (this.waiters.size >= 64) return Promise.resolve({ id, status: 'rejected', code: 'QUEUE_FULL' });

    const payload = {
      id,
      kind,
      epoch: this.store.topology?.epoch,
      topologyRevision: this.store.topology?.revision,
      ...fields,
    };
    const longKinds = new Set(['planRoute','applyRoute','reserveRoute','reserveRouteSignals','releaseRouteSignals']);
    const timeoutMs = kind === 'setTurntable'
      ? 50000
      : longKinds.has(kind)
        ? (this.config.dispatcher.longCommandTimeoutMs || 240000)
        : (this.config.dispatcher.commandTimeoutMs || 22000);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        resolve({ id, status: 'outcomeUnknown', code: 'COMMAND_TIMEOUT' });
      }, timeoutMs);
      this.waiters.set(id, { resolve, timer });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timer);
        this.waiters.delete(id);
        resolve({ id, status: 'outcomeUnknown', code: 'GAME_DISCONNECTED' });
      }
    });
  }

  setSwitch(target, branch, expectedRevision) {
    return this.command('setSwitch', { target, branch, expectedRevision });
  }

  setTurntable(target, index, expectedRevision) {
    return this.command('setTurntable', { target, index, expectedRevision });
  }

  planRoute({ from, to, train = null, via = [] }) {
    return this.command('planRoute', { from, to, train: train || null, via });
  }
}

module.exports = DispatcherClient;
