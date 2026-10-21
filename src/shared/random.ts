import { randomInt } from 'node:crypto';

export type RandomIndex = (length: number) => number;
export const randomIndex: RandomIndex = (length) => randomInt(length);

export function pick<T>(items: readonly [T, ...T[]], random: RandomIndex): T {
  const item = items[random(items.length)];
  if (item === undefined) throw new Error('El índice aleatorio está fuera de rango.');
  return item;
}
