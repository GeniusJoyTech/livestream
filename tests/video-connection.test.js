const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ViewerVideoConnection, findWatchedBroadcaster } = require('../public/viewer/video-connection');
const { createPeer, peers, broadcasters, deletePeer } = require('../services/peers');
const { handleDisconnect, handleWatch } = require('../handlers/handlers');

class FakePeerConnection {
  constructor() { this.received = []; this.remoteDescription = null; }
  async setRemoteDescription(sdp) { this.remoteDescription = sdp; }
  async addIceCandidate(candidate) {
    assert.ok(this.remoteDescription, 'ICE requires a remote description');
    this.received.push(candidate);
  }
  async createAnswer() { return { type: 'answer', sdp: 'test' }; }
  async setLocalDescription(answer) {
    this.localDescription = answer;
    this.onicecandidate({ candidate: { candidate: 'early' } });
  }
  close() { this.connectionState = 'closed'; }
}

function connection() {
  const sent = [], statuses = [];
  const video = { play: async () => {} };
  const session = new ViewerVideoConnection({
    PeerConnection: FakePeerConnection, video,
    send: msg => sent.push(msg),
    onStatus: (...args) => statuses.push(args), onPlaying: () => {}
  });
  return { session, sent, statuses, video };
}

test('sends the answer before candidates gathered during setLocalDescription', async () => {
  const { session, sent } = connection();
  await session.acceptOffer({ type: 'offer', sdp: 'test' });
  assert.deepEqual(sent.map(m => m.type), ['answer', 'candidate']);
  session.pc.onicecandidate({ candidate: { candidate: 'late' } });
  assert.equal(sent.at(-1).candidate.candidate, 'late');
});

test('retains remote ICE candidates that arrive before the offer', async () => {
  const { session } = connection();
  await session.addCandidate({ candidate: 'remote' });
  assert.equal(session.pc.received.length, 0);
  await session.acceptOffer({ type: 'offer', sdp: 'test' });
  assert.equal(session.pc.received[0].candidate, 'remote');
});

test('shows a network failure instead of claiming the stream is connected', () => {
  const { session, statuses } = connection();
  session.pc.connectionState = 'failed';
  session.pc.onconnectionstatechange();
  assert.equal(statuses.at(-1)[1], false);
  assert.match(statuses.at(-1)[0], /rede\/firewall/);
});

test('supports streamless tracks and plays muted video', () => {
  const oldStream = global.MediaStream;
  global.MediaStream = class { constructor(tracks) { this.tracks = tracks; } };
  try {
    const { session, video } = connection();
    const track = {};
    session.pc.ontrack({ streams: [], track });
    assert.deepEqual(video.srcObject.tracks, [track]);
    assert.equal(video.muted, true);
  } finally { global.MediaStream = oldStream; }
});

test('closing a session clears queued candidates and ignores new ones', async () => {
  const { session, sent } = connection();
  await session.addCandidate({ candidate: 'remote' });
  session.close();
  await session.addCandidate({ candidate: 'late' });
  session.pc.onicecandidate({ candidate: { candidate: 'late' } });
  assert.equal(session.incomingCandidates.length, 0);
  assert.equal(sent.length, 0);
});

function fakeSocket() {
  const ws = new EventEmitter();
  ws.readyState = ws.OPEN = 1;
  ws.sent = [];
  ws.send = text => ws.sent.push(JSON.parse(text));
  return ws;
}

test('close preserves broadcaster info until viewers get broadcaster-left', async () => {
  const broadcaster = fakeSocket(), viewer = fakeSocket();
  const id = createPeer(broadcaster);
  peers.get(id).role = 'broadcaster';
  broadcasters.set(id, { ws: broadcaster, db_id: null });
  peers.set('test-viewer', { ws: viewer, role: 'viewer' });
  broadcaster.emit('close');
  assert.ok(peers.has(id));
  await handleDisconnect(broadcaster, id, peers, broadcasters, deletePeer);
  assert.equal(viewer.sent[0].type, 'broadcaster-left');
  assert.equal(viewer.sent[0].broadcasterId, id);
  assert.equal(peers.has(id), false);
  peers.delete('test-viewer');
});

test('watching a missing machine returns a visible error', async () => {
  const viewer = fakeSocket();
  await handleWatch(viewer, 'viewer', { targetId: 'missing' }, new Map(), new Map());
  assert.equal(viewer.sent[0].type, 'error');
});

test('switching machines releases the previous broadcaster connection', async () => {
  const viewer = fakeSocket(), previous = fakeSocket(), next = fakeSocket();
  const testPeers = new Map([['viewer', { watchingBroadcaster: 'previous' }]]);
  const testBroadcasters = new Map([
    ['previous', { ws: previous }],
    ['next', { ws: next, name: 'next' }]
  ]);
  await handleWatch(viewer, 'viewer', { targetId: 'next' }, testPeers, testBroadcasters);
  assert.equal(previous.sent[0].type, 'viewer-disconnected');
  assert.equal(next.sent[0].type, 'new-viewer');
  assert.equal(testPeers.get('viewer').watchingBroadcaster, 'next');
});

test('a temporary interruption gets a grace period and recovery cancels the retry', () => {
  let retry = null, delay = null, count = 0;
  const session = new ViewerVideoConnection({
    PeerConnection: FakePeerConnection, video: {}, send() {}, onStatus() {}, onPlaying() {},
    onRetry: () => count++,
    setTimer: (fn, ms) => { retry = fn; delay = ms; return 1; },
    clearTimer: () => { retry = null; }
  });
  session.pc.connectionState = 'disconnected';
  session.pc.onconnectionstatechange();
  assert.equal(delay, 15000);
  session.pc.connectionState = 'connected';
  session.pc.onconnectionstatechange();
  assert.equal(retry, null);
  assert.equal(count, 0);
});

test('a sustained video failure retries automatically, once, with bounded delay', () => {
  let retry, delay, scheduled = 0, count = 0;
  const session = new ViewerVideoConnection({
    PeerConnection: FakePeerConnection, video: {}, send() {}, onStatus() {}, onPlaying() {},
    retryDelay: 30000, onRetry: () => count++,
    setTimer: (fn, ms) => { retry = fn; delay = ms; scheduled++; return 1; },
    clearTimer() {}
  });
  session.pc.connectionState = 'failed';
  session.pc.onconnectionstatechange();
  session.pc.onconnectionstatechange();
  assert.equal(scheduled, 1);
  assert.equal(delay, 30000);
  retry();
  assert.equal(count, 1);
});

test('a manually closed video session cannot retry', () => {
  let retry, count = 0;
  const session = new ViewerVideoConnection({
    PeerConnection: FakePeerConnection, video: {}, send() {}, onStatus() {}, onPlaying() {},
    onRetry: () => count++, setTimer: fn => { retry = fn; return 1; }, clearTimer() {}
  });
  session.pc.connectionState = 'failed';
  session.pc.onconnectionstatechange();
  session.close();
  retry();
  assert.equal(count, 0);
});

test('resumes the same installation after its WebSocket ID changes', () => {
  const wanted = { id: 'old', installation_id: 42 };
  const machines = [{ id: 'other', installation_id: 41, db_id: 1 }, { id: 'new', installation_id: '42', db_id: 1 }];
  assert.equal(findWatchedBroadcaster(machines, wanted).id, 'new');
  assert.equal(findWatchedBroadcaster(machines.slice(0, 1), wanted), null);
});
