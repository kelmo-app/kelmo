import { describe, expect, it } from 'vitest';
import { freshWatch, stepAfterAll } from './afterAll';

const L = (...s: Array<[string, string]>) => s.map(([id, status]) => ({ id, status }));

describe('after all downloads finish', () => {
  it('fires when the last running download completes', () => {
    let w = freshWatch(L(['a', 'downloading'], ['b', 'downloading']));
    let r = stepAfterAll(w, L(['a', 'completed'], ['b', 'downloading']));
    expect(r.fire).toBe(false);
    r = stepAfterAll(r.watch, L(['a', 'completed'], ['b', 'completed']));
    expect(r.fire).toBe(true);
  });
  it('waits for queued downloads too', () => {
    const w = freshWatch(L(['a', 'downloading'], ['b', 'queued']));
    expect(stepAfterAll(w, L(['a', 'completed'], ['b', 'queued'])).fire).toBe(false);
  });
  it('never fires just because everything was paused', () => {
    const w = freshWatch(L(['a', 'downloading']));
    expect(stepAfterAll(w, L(['a', 'paused'])).fire).toBe(false);
  });
  it('does not fire for downloads that were already finished when it was armed', () => {
    const w = freshWatch(L(['a', 'completed']));
    expect(stepAfterAll(w, L(['a', 'completed'])).fire).toBe(false);
  });
  it('counts a download that failed after another one finished', () => {
    let r = stepAfterAll(freshWatch(L(['a', 'downloading'], ['b', 'downloading'])), L(['a', 'completed'], ['b', 'downloading']));
    r = stepAfterAll(r.watch, L(['a', 'completed'], ['b', 'failed']));
    expect(r.fire).toBe(true);
  });
  it('sees a download added and finished after arming', () => {
    let r = stepAfterAll(freshWatch([]), L(['n', 'downloading']));
    expect(r.fire).toBe(false);
    r = stepAfterAll(r.watch, L(['n', 'completed']));
    expect(r.fire).toBe(true);
  });
});
