// OBS controller: launches OBS minimized to tray, connects via obs-websocket, starts/stops recordings.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import OBSWebSocket from 'obs-websocket-js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Obs {
  constructor(cfg, log = console) {
    this.cfg = cfg;
    this.log = log;
    this.ws = new OBSWebSocket();
    this.connected = false;
    this.recordStartedAt = null; // Date when OUTPUT_STARTED fired
    this.onRecordStateChanged = null;
    this.ws.on('RecordStateChanged', (e) => {
      if (e.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') this.recordStartedAt = new Date();
      if (e.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') this.recordStartedAt = null;
      this.onRecordStateChanged?.(e);
    });
    this.onClosed = null;
    this.ws.on('ConnectionClosed', () => { const was = this.connected; this.connected = false; this.log.warn('[obs] websocket closed'); if (was) this.onClosed?.(); });
  }

  async launchIfNeeded() {
    const running = await isProcessRunning('obs64.exe');
    if (running) return false;
    if (!existsSync(this.cfg.obsExe)) throw new Error(`OBS not found at ${this.cfg.obsExe}`);
    clearCrashSentinels(this.log);
    this.log.info('[obs] launching OBS minimized to tray');
    const child = spawn(this.cfg.obsExe, ['--minimize-to-tray', '--disable-updater', '--disable-shutdown-check', '--profile', 'ReplayCapture', '--collection', 'Game'], {
      cwd: path.dirname(this.cfg.obsExe), detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
    return true;
  }

  async connect(timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr;
    while (Date.now() < deadline) {
      try {
        await this.ws.connect(this.cfg.obsWs.url, this.cfg.obsWs.password, { rpcVersion: 1 });
        this.connected = true;
        const v = await this.ws.call('GetVersion');
        this.log.info(`[obs] connected: OBS ${v.obsVersion}, websocket ${v.obsWebSocketVersion}`);
        return;
      } catch (e) { lastErr = e; await sleep(1500); }
    }
    throw new Error(`OBS websocket connect failed: ${lastErr?.message ?? lastErr}`);
  }

  async ensureSetup() {
    // Profile + scene are pre-seeded on disk; enforce the few things that matter every start.
    const { currentProfileName, profiles } = await this.ws.call('GetProfileList');
    if (!profiles.includes('ReplayCapture')) await this.ws.call('CreateProfile', { profileName: 'ReplayCapture' });
    if (currentProfileName !== 'ReplayCapture') await this.ws.call('SetCurrentProfile', { profileName: 'ReplayCapture' });
    const v = this.cfg.video ?? { width: 1920, height: 1080, fps: 60, encoder: 'obs_nvenc_hevc_tex' };
    const want = [
      ['Output', 'Mode', 'Advanced'],
      ['AdvOut', 'RecType', 'Standard'],
      ['AdvOut', 'RecFilePath', this.cfg.libraryDir],
      ['AdvOut', 'RecFormat2', 'hybrid_mp4'],
      ['AdvOut', 'RecEncoder', v.encoder ?? 'obs_nvenc_hevc_tex'],
      ['Output', 'FilenameFormatting', '%CCYY-%MM-%DD %hh-%mm-%ss'],
      ['Video', 'BaseCX', String(v.width)], ['Video', 'BaseCY', String(v.height)],
      ['Video', 'OutputCX', String(v.width)], ['Video', 'OutputCY', String(v.height)],
      ['Video', 'FPSType', '0'], ['Video', 'FPSCommon', String(v.fps)],
    ];
    for (const [c, n, v] of want) await this.ws.call('SetProfileParameter', { parameterCategory: c, parameterName: n, parameterValue: v });
    const { currentProgramSceneName } = await this.ws.call('GetSceneList');
    if (currentProgramSceneName !== 'Game') {
      const { scenes } = await this.ws.call('GetSceneList');
      if (!scenes.some((s) => s.sceneName === 'Game')) await this.ws.call('CreateScene', { sceneName: 'Game' });
      await this.ws.call('SetCurrentProgramScene', { sceneName: 'Game' });
    }
    const { inputs } = await this.ws.call('GetInputList');
    if (!inputs.some((i) => i.inputKind === 'game_capture')) {
      await this.ws.call('CreateInput', { sceneName: 'Game', inputName: 'Game Capture', inputKind: 'game_capture', inputSettings: { capture_mode: 'any_fullscreen', capture_cursor: true } });
    }
  }

  async isRecording() { return (await this.ws.call('GetRecordStatus')).outputActive; }

  async startRecord() {
    if (await this.isRecording()) return;
    await this.ws.call('StartRecord');
    const t0 = Date.now();
    while (!this.recordStartedAt && Date.now() - t0 < 10000) await sleep(100);
    if (!this.recordStartedAt) this.recordStartedAt = new Date();
  }

  /** Returns the output path of the finished file. */
  async stopRecord() {
    if (!(await this.isRecording())) return null;
    const { outputPath } = await this.ws.call('StopRecord');
    return outputPath;
  }

  async disconnect() { try { await this.ws.disconnect(); } catch {} }
}

/**
 * OBS 32 leaves a run_* marker in %APPDATA%/obs-studio/.sentinel for every session that didn't exit
 * cleanly (reboots, crashes, kills) and then blocks startup on a hidden "Crash Detected" dialog,
 * ignoring --disable-shutdown-check. Only call while OBS is not running, so every marker is stale.
 */
function clearCrashSentinels(log) {
  const dir = path.join(process.env.APPDATA ?? '', 'obs-studio', '.sentinel');
  if (!process.env.APPDATA || !existsSync(dir)) return;
  const stale = readdirSync(dir).filter((f) => f.startsWith('run_'));
  for (const f of stale) { try { unlinkSync(path.join(dir, f)); } catch {} }
  if (stale.length) log.info(`[obs] cleared ${stale.length} stale crash marker(s)`);
}

export async function isProcessRunning(exeName) {
  const names = await listProcessNames();
  return names.has(exeName.toLowerCase());
}

/** Set of lowercase exe names currently running (tasklist, no PowerShell startup cost). */
export function listProcessNames() {
  return new Promise((resolve) => {
    const p = spawn('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => {
      const set = new Set();
      for (const line of out.split(/\r?\n/)) { const m = line.match(/^"([^"]+)"/); if (m) set.add(m[1].toLowerCase()); }
      resolve(set);
    });
    p.on('error', () => resolve(new Set()));
  });
}
