import { describe, expect, it } from 'vitest';
import { SPEED_PROFILES, defaultSettings } from './defaults';

describe('setup wizard data', () => {
  it('speed profiles stay inside the engine limits and are distinct', () => {
    for (const p of SPEED_PROFILES) {
      expect(p.connections >= 1 && p.connections <= 32).toBe(true);
      expect(p.limit >= 0).toBe(true);
    }
    expect(new Set(SPEED_PROFILES.map((p) => `${p.connections}/${p.limit}`)).size).toBe(SPEED_PROFILES.length);
  });
  it('first run shows the wizard', () => {
    expect(defaultSettings.setupDone).toBe(false);
  });
});
