import type { DecisionContext, ShortOption } from '../decider.js';
import type { Persona } from '../personas.js';

export interface Prompt {
  system: string;
  user: string;
  schema: object;
}

export function buildPrompt(_shortlist: ShortOption[], _persona: Persona, _context: DecisionContext): Prompt {
  throw new Error('NotImplemented: build-prompt');
}
