const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { ViewerVideoConnection, findWatchedBroadcaster } = require('../public/viewer/video-connection');

test('viewer resumes the same machine and monitor after reconnects, but respects manual disconnect', async () => {
  const timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor() {
      this.options = [];
      this.value = '';
      this.style = {};
      this.attributes = {};
      this.srcObject = null;
      this.classList = { add() {}, remove() {} };
    }
    set innerHTML(value) { this.options = []; }
    get selectedIndex() {
      const index = this.options.findIndex(o => o.value === this.value);
      return index < 0 ? 0 : index;
    }
    set selectedIndex(index) { this.value = this.options[index]?.value || ''; }
    addEventListener() {}
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
    appendChild(option) {
      this.options.push(option);
      if (option.selected || !this.value) this.value = option.value;
    }
    insertBefore(option) { this.options.unshift(option); if (option.selected) this.value = option.value; }
  }
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  element('monitorSelect').value = '2';
  class Socket {
    static OPEN = 1;
    static instances = [];
    constructor() { this.readyState = 1; this.sent = []; Socket.instances.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; this.onclose(); }
    async receive(message) { await this.onmessage({ data: JSON.stringify(message) }); }
  }
  let initialize;
  const context = {
    document: {
      addEventListener: (_, fn) => { initialize = fn; },
      getElementById: id => id === 'pq-list' ? null : element(id),
      createElement: () => new Element()
    },
    localStorage: { getItem: () => 'test-session', removeItem() {} },
    location: { protocol: 'https:', host: 'test.local' }, window: {},
    fetch: async () => ({ ok: false }),
    WebSocket: Socket, ViewerVideoConnection, findWatchedBroadcaster,
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), clearInterval() {},
    console: { log() {}, warn() {}, error: err => { throw err; } }
  };
  vm.runInNewContext(fs.readFileSync('public/viewer/viewer.js', 'utf8'), context);
  initialize();
  let socket = Socket.instances.at(-1);
  socket.onopen();
  await socket.receive({ type: 'broadcaster-list', broadcasters: [
    { id: 'original', name: 'machine', installation_id: 42, db_id: 1 }
  ] });
  element('watchButton').onclick();
  assert.equal(socket.sent.at(-1).targetId, 'original');
  assert.equal(socket.sent.at(-1).monitor_number, '2');

  socket.close();
  assert.equal(timers.size, 1, 'only the WebSocket reconnect timer remains');
  const [timerId, reconnect] = timers.entries().next().value;
  timers.delete(timerId);
  reconnect();
  socket = Socket.instances.at(-1);
  socket.onopen();
  await socket.receive({ type: 'broadcaster-list', broadcasters: [
    { id: 'wrong', name: 'another machine', installation_id: 41, db_id: 1 },
    { id: 'reconnected', name: 'machine', installation_id: 42, db_id: 1 }
  ] });
  assert.equal(socket.sent.at(-1).targetId, 'reconnected');
  assert.equal(socket.sent.at(-1).monitor_number, '2');

  await socket.receive({ type: 'broadcaster-left', broadcasterId: 'reconnected' });
  await socket.receive({ type: 'new-broadcaster', broadcasterId: 'back-again', computer_name: 'machine', installation_id: 42, db_id: 1 });
  assert.equal(socket.sent.at(-1).targetId, 'back-again');
  assert.equal(socket.sent.at(-1).monitor_number, '2');

  element('disconnectButton').onclick();
  assert.equal(timers.size, 0);
  element('connectButton').onclick();
  socket = Socket.instances.at(-1);
  socket.onopen();
  await socket.receive({ type: 'broadcaster-list', broadcasters: [
    { id: 'back-again', name: 'machine', installation_id: 42, db_id: 1 }
  ] });
  assert.equal(socket.sent.filter(message => message.type === 'watch').length, 0);
});
