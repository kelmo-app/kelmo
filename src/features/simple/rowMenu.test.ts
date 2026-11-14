import { describe, expect, it } from 'vitest';
import type { DownloadItem, Queue } from '@/types';
import { buildRowMenu, menuTargets, resumeKind, type MenuEntry } from './rowMenu';

const mk = (id: string, status: DownloadItem['status'], queueId = 'q1') => ({ id, status, queueId, fileName: id }) as DownloadItem;
const queues = [{ id: 'q1', name: 'Main' }, { id: 'q2', name: 'Night' }] as Queue[];
const flat = (m: MenuEntry[]) => m.flatMap((e) => (e.kind === 'item' ? [e] : []));
const byAction = (m: MenuEntry[], a: string) => flat(m).find((e) => e.kind === 'item' && e.action === a);
const sub = (m: MenuEntry[]) => m.find((e) => e.kind === 'sub') as Extract<MenuEntry, { kind: 'sub' }>;

describe('right-click menu (IDM style)', () => {
  it('a finished download can be opened, a running one can be stopped but not resumed', () => {
    const done = buildRowMenu([mk('a', 'completed')], queues);
    expect(byAction(done, 'open')?.disabled).toBe(false);
    expect(byAction(done, 'stop')?.disabled).toBe(true);
    expect(byAction(done, 'resume')?.disabled).toBe(true);
    const run = buildRowMenu([mk('b', 'downloading')], queues);
    expect(byAction(run, 'open')?.disabled).toBe(true);
    expect(byAction(run, 'stop')?.disabled).toBe(false);
    expect(byAction(run, 'redownload')?.disabled).toBe(true);
  });
  it('paused, failed and cancelled downloads can be resumed', () => {
    for (const s of ['paused', 'failed', 'cancelled'] as const) expect(byAction(buildRowMenu([mk('x', s)], queues), 'resume')?.disabled).toBe(false);
  });
  it('"Add to queue" lists the other queues, never the one the download is already in', () => {
    const s = sub(buildRowMenu([mk('a', 'paused', 'q1')], queues));
    expect(s.disabled).toBe(false);
    expect(s.children.map((c) => (c.kind === 'item' ? c.action : ''))).toEqual(['queue:q2']);
    expect(sub(buildRowMenu([mk('a', 'paused')], [queues[0]])).disabled).toBe(true);
  });
  it('remove is marked dangerous; properties and copy are always there', () => {
    const m = buildRowMenu([mk('a', 'failed')], queues);
    expect(byAction(m, 'remove')).toMatchObject({ danger: true });
    expect(byAction(m, 'properties')).toBeTruthy();
    expect(byAction(m, 'copy')).toBeTruthy();
  });
  it('several selected downloads get the bulk menu only', () => {
    const m = buildRowMenu([mk('a', 'paused'), mk('b', 'completed')], queues);
    expect(flat(m).map((e) => (e.kind === 'item' ? e.action : ''))).toEqual(['resume', 'stop', 'remove']);
    expect(byAction(m, 'resume')?.disabled).toBe(false);
    expect(byAction(m, 'stop')?.disabled).toBe(true);
    expect(byAction(m, 'remove')).toMatchObject({ label: 'Remove 2 downloads' });
    expect(sub(m).children).toHaveLength(2);
  });
  it('nothing selected gives no menu', () => expect(buildRowMenu([], queues)).toEqual([]));
});

describe('menu targets', () => {
  const all = [mk('a', 'paused'), mk('b', 'paused'), mk('c', 'paused')];
  it('right-click inside the selection acts on all of it', () => expect(menuTargets('b', ['a', 'b'], all).map((i) => i.id)).toEqual(['a', 'b']));
  it('right-click outside the selection acts on that row only', () => expect(menuTargets('c', ['a', 'b'], all).map((i) => i.id)).toEqual(['c']));
  it('resume means resume for paused and retry for failed or cancelled', () => {
    expect(resumeKind(mk('a', 'paused'))).toBe('resume');
    expect(resumeKind(mk('a', 'failed'))).toBe('retry');
    expect(resumeKind(mk('a', 'cancelled'))).toBe('retry');
    expect(resumeKind(mk('a', 'completed'))).toBeNull();
  });
});
