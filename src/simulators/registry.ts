import { financeSims } from './defs/finance';
import { taxSims } from './defs/tax';
import { creditSims } from './defs/credit';
import { marketSims } from './defs/markets';
import { wealthSims } from './defs/wealth';
import type { SimulatorDef } from './types';

export const ALL_SIMULATORS: SimulatorDef[] = [...financeSims, ...taxSims, ...creditSims, ...marketSims, ...wealthSims];
export const getSimulator = (id: string) => ALL_SIMULATORS.find((s) => s.id === id);
