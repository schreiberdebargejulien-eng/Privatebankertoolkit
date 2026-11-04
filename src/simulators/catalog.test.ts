import { describe, expect, it } from 'vitest';
import { searchSimulators, SIMULATORS } from './catalog';

describe('Recherche universelle', () => {
  it.each([['lombard', 'lombard'], ['IFI', 'ifi'], ['TRI', 'xirr'], ['donation', 'donation'], ['autocall', 'structured'], ['phoenix', 'structured'], ['compte à terme', 'cat'], ['hypothèque', 'guarantee'], ['assurance vie', 'assurance-vie'], ['démembrement', 'demembrement']])('%s → %s', (q, id) => {
    expect(searchSimulators(q)[0]?.id).toBe(id);
  });
  it('identifiants uniques', () => {
    expect(new Set(SIMULATORS.map((s) => s.id)).size).toBe(SIMULATORS.length);
  });
});
