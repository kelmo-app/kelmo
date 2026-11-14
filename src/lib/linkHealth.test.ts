import { describe, expect, it } from 'vitest';
import { describeHealth } from './linkHealth';

const ctx = { fileName: 'a.iso', totalBytes: 1000, downloadedBytes: 100 };
const ok = { ok: true as const, ms: 42, size: 1000, rangeOk: true, fileName: 'a.iso', contentType: 'application/octet-stream', finalUrl: 'x' };

describe('link health', () => {
  it('healthy link', () => {
    const r = describeHealth(ok, ctx);
    expect(r.state).toBe('alive');
    expect(r.tone).toBe('ok');
  });
  it('tells apart expired, missing, busy, server and offline', () => {
    const f = (status: number, error = 'x') => describeHealth({ ok: false, status, error }, ctx).state;
    expect(f(403)).toBe('expired');
    expect(f(401)).toBe('expired');
    expect(describeHealth({ ok: false, status: 401, error: 'x' }, ctx).title).toMatch(/Login needed/);
    expect(f(404)).toBe('dead');
    expect(f(410)).toBe('dead');
    expect(f(429)).toBe('busy');
    expect(f(503)).toBe('server');
    expect(f(0, 'timeout')).toBe('offline');
    expect(f(0, 'unreachable')).toBe('offline');
  });
  it('a web page instead of a file, and a changed file, are warned about', () => {
    expect(describeHealth({ ...ok, contentType: 'text/html' }, ctx).state).toBe('page');
    expect(describeHealth({ ...ok, contentType: 'text/html' }, { ...ctx, fileName: 'index.html' }).state).toBe('alive');
    expect(describeHealth({ ...ok, size: 2000 }, ctx).state).toBe('changed');
    expect(describeHealth({ ...ok, size: 2000 }, { ...ctx, totalBytes: 0 }).state).toBe('alive');
  });
  it('lost resume support only matters once something is downloaded', () => {
    expect(describeHealth({ ...ok, rangeOk: false }, ctx).state).toBe('noresume');
    expect(describeHealth({ ...ok, rangeOk: false }, { ...ctx, downloadedBytes: 0 }).state).toBe('alive');
  });
});
