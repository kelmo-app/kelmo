/* "When all downloads finish": quit KDM, put the computer to sleep, or shut it down.
 *
 * Sleep and shut down are never instant: a countdown dialog gives the person 60 seconds to say Cancel
 * (they may have walked away from the computer, or started something else). Pure: every system call is injected. */

const COMMANDS = {
  linux: { sleep: ['systemctl', ['suspend']], shutdown: ['systemctl', ['poweroff']] },
  win32: { sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']], shutdown: ['shutdown', ['/s', '/t', '0']] },
  darwin: { sleep: ['pmset', ['sleepnow']], shutdown: ['osascript', ['-e', 'tell application "System Events" to shut down']] },
};

const LABEL = { quit: 'quit KDM', sleep: 'put the computer to sleep', shutdown: 'shut the computer down' };
const MODES = ['none', 'quit', 'sleep', 'shutdown'];

/** The program and arguments for a mode on this system, or null when it cannot be done here. */
function commandFor(platform, mode) {
  return (COMMANDS[platform] && COMMANDS[platform][mode]) || null;
}

/**
 * @param {{
 *   platform: string,
 *   execFile: (file: string, args: string[], cb: (err: Error | null) => void) => void,
 *   quit: () => void,
 *   confirm: (o: { message: string, detail: string, signal: AbortSignal }) => Promise<boolean>, // true = go ahead now, false = cancelled
 *   setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout,
 *   seconds?: number,
 *   log?: (m: string) => void,
 * }} d
 */
function createPower(d) {
  const setT = d.setTimer || setTimeout;
  const clearT = d.clearTimer || clearTimeout;
  const seconds = d.seconds ?? 60;
  const log = d.log || (() => {});
  let pending = null; // the countdown that is on screen

  function run(mode) {
    if (mode === 'quit') {
      log('after-all: quitting');
      d.quit();
      return 'quit';
    }
    const cmd = commandFor(d.platform, mode);
    if (!cmd) {
      log(`after-all: ${mode} is not available on ${d.platform}`);
      return 'unsupported';
    }
    log(`after-all: ${mode}`);
    d.execFile(cmd[0], cmd[1], (err) => err && log(`after-all: ${mode} failed: ${err.message}`));
    return 'done';
  }

  /** Returns what happened: 'none' | 'quit' | 'done' | 'cancelled' | 'unsupported' | 'busy'. */
  async function trigger(mode) {
    if (!MODES.includes(mode) || mode === 'none') return 'none';
    if (mode === 'quit') return run('quit');
    if (!commandFor(d.platform, mode)) return run(mode);
    if (pending) return 'busy';
    const ctl = new AbortController();
    pending = ctl;
    let timer;
    const timeout = new Promise((res) => {
      timer = setT(() => res(true), seconds * 1000);
    });
    const answer = d
      .confirm({
        message: `KDM will ${LABEL[mode]} in ${seconds} seconds`,
        detail: 'All downloads have finished. Press Cancel to stay on.',
        signal: ctl.signal,
      })
      .catch(() => true);
    const go = await Promise.race([answer, timeout]);
    clearT(timer);
    pending = null;
    ctl.abort(); // closes the dialog if it is still open
    if (!go) {
      log(`after-all: ${mode} cancelled`);
      return 'cancelled';
    }
    return run(mode);
  }

  return { trigger, commandFor: (m) => commandFor(d.platform, m) };
}

module.exports = { createPower, commandFor, MODES };
