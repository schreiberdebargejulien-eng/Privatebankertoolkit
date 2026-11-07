import { describe, expect, it } from 'vitest';
import { parseFrNumber, toggleSign } from './fields';

describe('toggleSign (bouton ± du clavier décimal)', () => {
  it('ajoute puis retire le signe moins', () => {
    expect(toggleSign('12,5')).toBe('-12,5');
    expect(toggleSign('-12,5')).toBe('12,5');
  });
  it('fonctionne sur un champ vide pour saisir ensuite le nombre', () => {
    expect(toggleSign('')).toBe('-');
    expect(toggleSign('-')).toBe('');
    expect(parseFrNumber('-')).toBeNull();
    expect(parseFrNumber(toggleSign('') + '3,2')).toBe(-3.2);
  });
});
