const { EventEmitter } = require('node:events');

class StateStore extends EventEmitter {
  constructor() {
    super();
    this.resetAll();
  }

  resetAll() {
    this.serverEpoch = '';
    this.seq = 0n;
    this.topology = null;
    this.capabilities = { status: 'loading' };
    this.routes = [];
    this.events = [];
    this.lastMessageAt = 0;
    this.disconnected = true;
    for (const key of ['tracks','switches','turntables','cars','signals','locations','blocks','occupancy','players','jobs','signs']) {
      this[key] = new Map();
    }
  }

  setConnection(connected) {
    this.disconnected = !connected;
    this.emit('change', { kind: 'connection' });
  }

  topologySet(topology) {
    this.topology = topology || null;
    this.tracks = new Map((topology?.tracks || []).map((x) => [x.id, x]));
    this.junctions = new Map((topology?.junctions || []).map((x) => [x.id, x]));
    this.turntableDefinitions = new Map((topology?.turntables || []).map((x) => [x.id, x]));
  }

  clearDynamic({ keepRoutes = false } = {}) {
    for (const key of ['switches','turntables','cars','signals','locations','blocks','occupancy','players','jobs','signs']) this[key].clear();
    if (!keepRoutes) {
      this.routes = [];
      this.events = [];
    }
  }

  _replaceOrMergeMap(key, payload, replaceFlag) {
    if (payload[replaceFlag]) this[key].clear();
    for (const item of payload[key] || []) this[key].set(item.id, item);
  }

  consume(message) {
    if (!message || typeof message !== 'object') return;
    this.lastMessageAt = Date.now();

    if (message.type === 'receipt') {
      this.emit('receipt', message.payload);
      this.emit('change', { kind: 'receipt', payload: message.payload });
      return;
    }

    if (message.type === 'snapshot') {
      this.serverEpoch = message.serverEpoch || '';
      this.seq = BigInt(message.seq || 0);
      this.clearDynamic();
      const p = message.payload || {};
      this.topologySet(p.topology);
      for (const key of ['switches','turntables','cars','signals','locations','blocks','occupancy','players','jobs','signs']) {
        for (const item of p[key] || []) this[key].set(item.id, item);
      }
      this.routes = Array.isArray(p.routes) ? p.routes : [];
      this.events = Array.isArray(p.events) ? p.events : [];
      this.capabilities = p.capabilities || { status: 'loading' };
      this.emit('snapshot', p);
      this.emit('change', { kind: 'snapshot', payload: p });
      return;
    }

    if (message.type === 'resumed') {
      this.emit('change', { kind: 'resumed' });
      return;
    }

    if (message.serverEpoch && this.serverEpoch && message.serverEpoch !== this.serverEpoch) {
      const err = new Error('Dispatcher server epoch changed; resync required.');
      err.code = 'RESYNC_REQUIRED';
      throw err;
    }

    if (message.seq !== undefined) {
      const next = BigInt(message.seq);
      if (this.seq && next !== this.seq + 1n) {
        const err = new Error(`Dispatcher sequence gap (${this.seq} -> ${next}).`);
        err.code = 'RESYNC_REQUIRED';
        throw err;
      }
      this.seq = next;
    }

    if (message.type === 'topology') {
      this.clearDynamic({ keepRoutes: true });
      this.topologySet(message.payload);
      this.emit('change', { kind: 'topology', payload: message.payload });
      return;
    }

    if (message.type === 'delta') {
      const p = message.payload || {};
      if (p.reset) this.clearDynamic({ keepRoutes: true });
      this._replaceOrMergeMap('jobs', p, 'replaceJobs');
      this._replaceOrMergeMap('locations', p, 'replaceLocations');
      this._replaceOrMergeMap('players', p, 'replacePlayers');
      this._replaceOrMergeMap('signs', p, 'replaceSigns');
      for (const key of ['switches','turntables','cars','signals','blocks','occupancy']) {
        for (const item of p[key] || []) this[key].set(item.id, item);
      }
      for (const motion of p.motions || []) {
        const old = this.cars.get(motion.id);
        if (old) this.cars.set(motion.id, { ...old, ...motion });
      }
      for (const id of p.removedCars || []) this.cars.delete(id);
      for (const id of p.removedSignals || []) this.signals.delete(id);
      for (const id of p.removedBlocks || []) this.blocks.delete(id);
      if (p.capabilities) this.capabilities = p.capabilities;
      this.emit('delta', p);
      this.emit('change', { kind: 'delta', payload: p });
      return;
    }

    if (message.type === 'routes') {
      this.routes = Array.isArray(message.payload) ? message.payload : [];
      this.emit('change', { kind: 'routes', payload: this.routes });
      return;
    }

    if (message.type === 'event') {
      const event = message.payload;
      if (event && !this.events.some((x) => x.id === event.id)) {
        this.events.push(event);
        if (this.events.length > 1000) this.events.shift();
        this.emit('dispatcherEvent', event);
      }
      this.emit('change', { kind: 'event', payload: event });
      return;
    }

    if (message.type === 'capabilities') {
      this.capabilities = message.payload || {};
      this.emit('change', { kind: 'capabilities', payload: this.capabilities });
    }
  }

  get stale() {
    return this.disconnected || !this.lastMessageAt || Date.now() - this.lastMessageAt > 7000 || this.capabilities?.status !== 'ready';
  }

  get canControl() {
    return !this.stale && Boolean(this.capabilities?.authority);
  }

  trains() {
    const groups = new Map();
    for (const car of this.cars.values()) {
      const id = car.consist || car.nativeTrainset || car.id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(car);
    }
    return [...groups.entries()].map(([id, cars]) => {
      cars.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const head = cars.find((x) => x.locomotive) || cars[0];
      return {
        ...head,
        id,
        name: head?.name || id,
        head: head?.id,
        carIds: cars.map((x) => x.id),
        count: cars.length,
        locomotiveCount: cars.filter((x) => x.locomotive).length,
        wagonCount: cars.filter((x) => !x.locomotive).length,
        length: cars.reduce((n, x) => n + (Number(x.length) || 0), 0),
        mass: cars.reduce((n, x) => n + (Number(x.mass) || 0), 0),
        cars,
      };
    });
  }

  findTrain(id) {
    const needle = String(id || '').toLowerCase();
    return this.trains().find((x) => [x.id, x.name, x.head].some((v) => String(v || '').toLowerCase() === needle));
  }

  findMapItem(mapName, id) {
    const map = this[mapName];
    if (!(map instanceof Map)) return null;
    const needle = String(id || '').toLowerCase();
    if (map.has(id)) return map.get(id);
    return [...map.values()].find((x) => [x.id, x.name, x.displayName].some((v) => String(v || '').toLowerCase() === needle)) || null;
  }

  findRoute(id) {
    const needle = String(id || '').toLowerCase();
    return this.routes.find((x) => [x.id, x.name].some((v) => String(v || '').toLowerCase() === needle)) || null;
  }
}

module.exports = StateStore;
