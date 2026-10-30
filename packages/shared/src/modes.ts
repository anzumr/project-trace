export const MODES = {
  heavy: { label: 'Heavy / Tank', difficulty: 'Easy', scale: 1.4, speed: 0.85, jump: 0.8 },
  standard: { label: 'Standard / Runner', difficulty: 'Normal', scale: 1, speed: 1, jump: 1 },
  agile: { label: 'Agile / Scout', difficulty: 'Hard', scale: 0.85, speed: 1.1, jump: 1.15 },
  extreme: { label: 'Extreme / Micro', difficulty: 'Very hard', scale: 0.65, speed: 1.2, jump: 1.2 },
} as const;
export type ModeId = keyof typeof MODES;
export function isMode(value: unknown): value is ModeId { return typeof value === 'string' && Object.hasOwn(MODES, value); }
