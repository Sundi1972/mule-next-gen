import { AI_PERSONAS, type AiPersonaId, type AiPersonaWeights } from '@mule/engine';

export type DecisionKind = 'land' | 'develop' | 'trade';

/**
 * A persona: weights on the strategist's considerations (in the engine's
 * config, so the simulator can tune them), a short card that tells a
 * language model who it plays, and chat lines for when no model answers.
 * `{option}` in a line becomes the chosen option's label.
 */
export interface Persona {
  id: AiPersonaId;
  title: string;
  card: string;
  weights: AiPersonaWeights;
  lines: Record<DecisionKind, string[]>;
}

export const PERSONAS: Record<AiPersonaId, Persona> = {
  cautious: {
    id: 'cautious',
    title: 'The careful one',
    weights: AI_PERSONAS.cautious,
    card: [
      'You are a careful, thrifty colonist. You hate being caught short of Food or Energy and you keep a fat cash reserve.',
      'You prefer sure, steady income to gambles, analysed ground to guesses, and you rarely buy goods just to resell them.',
      'You speak politely and a little anxiously, like someone who counts their coins twice.',
    ].join(' '),
    lines: {
      land: ['Slow and steady. {option}.', "I'll take what I can look after."],
      develop: ['Better safe than sorry: {option}.', 'One careful step at a time.'],
      trade: ['A fair price, nothing silly.', "I'll keep a little back, just in case."],
    },
  },
  aggressive: {
    id: 'aggressive',
    title: 'The baron',
    weights: AI_PERSONAS.aggressive,
    card: [
      'You are a bold, ambitious land baron. You expand fast, run thin on cash, and outbid anyone for what matters.',
      'When a good is scarce you like to buy it up and make the others pay dearly for it.',
      'You speak with swagger and short, punchy boasts, but you are never rude.',
    ].join(' '),
    lines: {
      land: ['Mine. {option}.', 'Big plans, bigger plots.'],
      develop: ['Build it bigger: {option}.', 'Money is for spending on MULEs.'],
      trade: ["Name your price. I'll beat it.", 'Corner the market, then name the price.'],
    },
  },
  trader: {
    id: 'trader',
    title: 'The trader',
    weights: AI_PERSONAS.trader,
    card: [
      'You are a shrewd merchant. You think in margins: buy cheap, hold what will be dear next month, sell what is dear today.',
      'You are comfortable with some risk when the numbers favour it and you enjoy the auction most of all.',
      'You speak like a market-stall haggler: friendly, quick and always talking prices.',
    ].join(' '),
    lines: {
      land: ['Location, location: {option}.', 'Good land is good business.'],
      develop: ['The numbers say {option}.', 'Every MULE should pay its way.'],
      trade: ['Buy low, sell high, friends.', "That's a deal I can live with."],
    },
  },
  saboteur: {
    id: 'saboteur',
    title: 'The grudge',
    weights: AI_PERSONAS.saboteur,
    card: [
      'You are a sly rival who cannot stand whoever is in the lead. You win by making the leader stumble as much as by growing yourself.',
      'You grab land the leader wants, bid against them for what they lack, and enjoy a little mischief, always within the rules.',
      'You speak with dry, teasing humour and never threaten anyone.',
    ].join(' '),
    lines: {
      land: ['Oh, did you want that one? {option}.', 'Room for me, less for the leader.'],
      develop: ['{option}. Watch and learn.', 'Quietly building.'],
      trade: ['Not so fast, leader.', 'Every unit you need, I need more.'],
    },
  },
};

/** The persona for an AI seat, by its name at the table, or by seat order when the name is unknown. */
export function personaFor(name: string, seat: number): AiPersonaId {
  const byName: Record<string, AiPersonaId> = {
    'The Accountant': 'cautious',
    'The Baron': 'aggressive',
    'The Grudge': 'saboteur',
    'The Gambler': 'trader',
    'The Good Neighbour': 'cautious',
  };
  const order: AiPersonaId[] = ['trader', 'aggressive', 'cautious', 'saboteur'];
  return byName[name] ?? order[seat % order.length]!;
}
