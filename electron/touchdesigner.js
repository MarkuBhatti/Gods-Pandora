/**
 * God's Pandora <-> TouchDesigner Bridge
 * Handles: OSC send/receive, WebSocket client, file-watch on TD output, process launch
 */

const { UDPPort } = require('node-osc');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

class TouchDesignerBridge extends EventEmitter {
  constructor() {
    super();
    this.oscPort = null;
    this.ws = null;
    this.tdProcess = null;
    this.watcher = null;
    this.connected = false;
    this.wsConnected = false;
    this.outputFolder = null;
    this.config = {
      oscHost: '127.0.0.1',
      oscSendPort: 7000,     // God's Pandora -> TD
      oscRecvPort: 7001,     // TD -> God's Pandora
      wsPort: 9980,          // TD WebSocket DAT default
      tdExePath: 'C:\\Program Files\\Derivative\\TouchDesigner\\bin\\TouchDesigner.exe',
    };
  }

  // ── OSC ─────────────────────────────────────────────────────────────────────

  async connectOSC(config = {}) {
    Object.assign(this.config, config);
    if (this.oscPort) { try { this.oscPort.close(); } catch (_) {} }

    return new Promise((resolve) => {
      try {
        this.oscPort = new UDPPort({
          localAddress: '0.0.0.0',
          localPort: this.config.oscRecvPort,
          remoteAddress: this.config.oscHost,
          remotePort: this.config.oscSendPort,
          metadata: true,
        });

        this.oscPort.on('message', (msg) => {
          this.emit('osc:message', msg);
        });

        this.oscPort.on('error', (err) => {
          console.warn('[TD-OSC] Error:', err.message);
          this.connected = false;
          this.emit('status', this._status());
        });

        this.oscPort.open();
        this.connected = true;
        this.emit('status', this._status());
        resolve({ ok: true });
        console.log('[TD-OSC] Bridge open — send:', this.config.oscSendPort, 'recv:', this.config.oscRecvPort);
      } catch (err) {
        console.error('[TD-OSC] Failed to open:', err.message);
        resolve({ ok: false, error: err.message });
      }
    });
  }

  sendOSC(address, ...args) {
    if (!this.oscPort || !this.connected) return false;
    try {
      this.oscPort.send({ address, args: args.map((v) => {
        if (typeof v === 'number') return { type: typeof v === 'number' && Number.isInteger(v) ? 'i' : 'f', value: v };
        if (typeof v === 'string') return { type: 's', value: v };
        return { type: 'f', value: Number(v) };
      })});
      return true;
    } catch (err) {
      console.warn('[TD-OSC] Send failed:', err.message);
      return false;
    }
  }

  sendParams(paramMap) {
    // paramMap: { '/pandora/speed': 0.5, '/pandora/color/r': 1.0, ... }
    for (const [addr, val] of Object.entries(paramMap)) {
      this.sendOSC(addr, val);
    }
  }

  // ── WebSocket ────────────────────────────────────────────────────────────────

  connectWS(port) {
    const p = port || this.config.wsPort;
    if (this.ws) { try { this.ws.terminate(); } catch (_) {} }

    const url = 'ws://' + this.config.oscHost + ':' + p;
    try {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => {
        this.wsConnected = true;
        this.emit('ws:open');
        this.emit('status', this._status());
        console.log('[TD-WS] Connected to', url);
      });
      this.ws.on('message', (data) => {
        try { this.emit('ws:message', JSON.parse(data.toString())); }
        catch (_) { this.emit('ws:message', data.toString()); }
      });
      this.ws.on('close', () => {
        this.wsConnected = false;
        this.emit('ws:close');
        this.emit('status', this._status());
      });
      this.ws.on('error', (err) => {
        this.wsConnected = false;
        console.warn('[TD-WS]', err.message);
        this.emit('status', this._status());
      });
    } catch (err) {
      console.warn('[TD-WS] Connect failed:', err.message);
    }
  }

  sendWS(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
      return true;
    } catch (err) {
      console.warn('[TD-WS] Send failed:', err.message);
      return false;
    }
  }

  // ── Process launch ────────────────────────────────────────────────────────────

  launch(toePath, exePath) {
    const exe = exePath || this.config.tdExePath;
    if (!fs.existsSync(exe)) {
      return { ok: false, error: 'TouchDesigner not found at: ' + exe + '\nUpdate the path in the TD Studio settings.' };
    }
    try {
      const args = toePath ? [toePath] : [];
      this.tdProcess = spawn(exe, args, { detached: true, stdio: 'ignore' });
      this.tdProcess.unref();
      console.log('[TD] Launched:', exe, toePath || '(no project)');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Output folder watcher ─────────────────────────────────────────────────────

  watchOutput(folder, callback) {
    if (this.watcher) { try { this.watcher.close(); } catch (_) {} }
    if (!folder) return;
    this.outputFolder = folder;
    fs.mkdirSync(folder, { recursive: true });

    const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov']);
    this.watcher = fs.watch(folder, (event, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      if (!EXTS.has(ext)) return;
      const full = path.join(folder, filename);
      // small delay to make sure write is complete
      setTimeout(() => {
        if (fs.existsSync(full)) callback(full);
      }, 300);
    });
    console.log('[TD] Watching output folder:', folder);
  }

  stopWatcher() {
    if (this.watcher) { try { this.watcher.close(); } catch (_) {} this.watcher = null; }
  }

  // ── Disconnect all ────────────────────────────────────────────────────────────

  disconnect() {
    this.stopWatcher();
    if (this.oscPort) { try { this.oscPort.close(); } catch (_) {} this.oscPort = null; }
    if (this.ws) { try { this.ws.terminate(); } catch (_) {} this.ws = null; }
    this.connected = false;
    this.wsConnected = false;
    this.emit('status', this._status());
  }

  _status() {
    return { osc: this.connected, ws: this.wsConnected, outputFolder: this.outputFolder || null };
  }

  status() { return this._status(); }
}

module.exports = new TouchDesignerBridge();
