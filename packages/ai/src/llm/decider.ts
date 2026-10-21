import { AI_HANDS, BRAIN } from '@mule/engine';
import type { Choice, Decider, DecisionContext, ShortOption } from '../decider.js';
import type { DecisionKind, Persona } from '../personas.js';
import { buildPrompt, type Prompt } from './prompt.js';
import { parseReply } from './reply.js';

/** The port to a language model: the prompt and the longest the seat will wait, back comes the model's text. */
export type Complete = (prompt: Prompt, waitMs: number) => Promise<{ text: string }>;

/** What the hands wait for the decider, by kind of decision; the port's client enforces it. */
const WAIT_MS: Record<DecisionKind, number> = {
  develop: AI_HANDS.develop.decideWaitMs,
  trade: AI_HANDS.auction.decideWaitMs,
  land: BRAIN.landTimeoutMs,
};

/** Asks a language model through the port. A reply it cannot use rejects with the reason, so Brain plays the top pick. */
export class LlmDecider implements Decider {
  readonly name = 'llm';

  constructor(private readonly complete: Complete) {}

  async decide(shortlist: ShortOption[], persona: Persona, context: DecisionContext): Promise<Choice> {
    const { text } = await this.complete(buildPrompt(shortlist, persona, context), WAIT_MS[context.kind]);
    const reply = parseReply(text, shortlist);
    if (!reply.ok) throw new Error(reply.reason);
    return { optionId: reply.optionId, line: reply.line, by: 'llm' };
  }
}
