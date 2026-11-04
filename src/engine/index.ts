/**
 * Point d'entrée du moteur de calcul.
 * Toutes les fonctions sont pures, déterministes, validées par Zod et testées (Vitest).
 * Aucune dépendance à React ni au DOM.
 */
export * from './core/errors';
export * from './core/math';
export * from './core/dates';
export * from './finance/investment';
export * from './finance/xirr';
export * from './finance/netYield';
export * from './finance/termDeposit';
export * from './tax/types';
export * from './tax/fr/rules';
export * from './tax/fr/ir';
export * from './tax/fr/ifi';
export * from './tax/fr/dmtg';
export * from './tax/fr/assuranceVie';
export * from './tax/fr/per';
export * from './tax/fr/succession';
export * from './tax/fr/investmentTax';
export * from './credit/loans';
export * from './credit/lombard';
export * from './credit/guarantee';
export * from './bonds/bond';
export * from './structured/structured';
export * from './wealth/wealth';
