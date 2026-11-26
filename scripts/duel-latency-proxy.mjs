// Loopback-only QA relay for delayed commands and interrupted trap responses.
import { createServer, request } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { DuelClientMessage, DuelServerMessage, OnlineCommandType } from '../src/duel-command.js';

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const target = new URL(argument('target', 'ws://127.0.0.1:5178/duel'));
if (target.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('QA relay requires a loopback ws target');
const targetHostname = target.hostname.replace(/^\[|\]$/g, '');
const port = Number(argument('port', '5182'));
const delayMs = Number(argument('delay-ms', '2000'));
const summonNumber = Number(argument('summon-number', '2'));
const dropResponseRequest = process.argv.includes('--drop-response-request');
const dropResponseAck = process.argv.includes('--drop-response-ack');
let responseFaultInjected = false;
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000
  || !Number.isInteger(summonNumber) || summonNumber < 1 || summonNumber > 10 || (dropResponseRequest && dropResponseAck)) throw new Error('Invalid QA relay options');

const server = createServer((incoming, outgoing) => {
  const upstream = request({ hostname: targetHostname, port: target.port, method: incoming.method,
    path: incoming.url, headers: { ...incoming.headers, host: target.host } }, response => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end('QA backend unavailable'); });
  incoming.pipe(upstream);
});
const sockets = new WebSocketServer({ noServer: true });
server.on('upgrade', (incoming, socket, head) => {
  if (incoming.url !== '/duel') return socket.destroy();
  const upstream = new WebSocket(target, { headers: { ...(incoming.headers.cookie ? { cookie: incoming.headers.cookie } : {}), ...(incoming.headers.origin ? { origin: incoming.headers.origin } : {}) } });
  upstream.on('error', () => socket.destroy());
  upstream.once('open', () => sockets.handleUpgrade(incoming, socket, head, downstream => {
    let summons = 0;
    let responseRequestId = null;
    const timers = new Set();
    const send = raw => { if (upstream.readyState === WebSocket.OPEN) upstream.send(raw.toString()); };
    downstream.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return send(raw); }
      if (!responseFaultInjected && message.type === DuelClientMessage.command && message.payload?.action?.type === OnlineCommandType.respondTrap) {
        if (dropResponseRequest) {
          responseFaultInjected = true;
          console.log('QA dropped the trap response before forwarding it');
          downstream.terminate();
          return;
        }
        if (dropResponseAck) responseRequestId = message.requestId;
      }
      if (message.type === DuelClientMessage.command && message.payload?.action?.type === OnlineCommandType.summonMonster && ++summons === summonNumber) {
        const timer = setTimeout(() => { timers.delete(timer); send(raw); }, delayMs);
        timers.add(timer);
      } else send(raw);
    });
    upstream.on('message', raw => {
      if (responseRequestId && !responseFaultInjected) {
        const reply = JSON.parse(raw.toString());
        if (reply.requestId === responseRequestId) {
          responseRequestId = null;
          if (reply.type === DuelServerMessage.ack) {
            responseFaultInjected = true;
            console.log('QA dropped the committed trap response acknowledgement');
            downstream.terminate();
            return;
          }
        }
      }
      if (downstream.readyState === WebSocket.OPEN) downstream.send(raw.toString());
    });
    downstream.on('error', () => upstream.terminate());
    downstream.on('close', () => { for (const timer of timers) clearTimeout(timer); upstream.close(); });
    upstream.on('close', () => downstream.close());
  }));
});
server.listen(port, '127.0.0.1', () => console.log(`QA latency relay http://127.0.0.1:${port} -> ${target.origin} (${delayMs}ms summon ${summonNumber})`));
