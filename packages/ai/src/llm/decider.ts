import type { Choice, Decider, DecisionContext, ShortOption } from '../decider.js';
import type { Persona } from '../personas.js';
import type { Prompt } from './prompt.js';

/** The port to a language model: the prompt and the longest the seat will wait, back comes the model's text. */
export type Complete = (prompt: Prompt, waitMs: number) => Promise<{ text: string }>;

export class LlmDecider implements Decider {
  readonly name = 'llm';

  constructor(private readonly complete: Complete) {}

  decide(_shortlist: ShortOption[], _persona: Persona, _context: DecisionContext): Promise<Choice> {
    throw new Error('NotImplemented: llm-decider');
  }
}
