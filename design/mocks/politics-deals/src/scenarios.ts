import type { DealCard } from '@mule/engine';
import { baseWorld, card, LAW_YES, PACT, VOTE_BRIX, VOTE_OSSA, type Seat, type World } from './fixture';

/**
 * Every state the mock draws, by screen. A state is a world (what the server holds), a door per phone (where its hub
 * opens: `whisper:<id>`, `compose:<id>[:pact|vote]`, `deals`, `cards`, `card:<id>`), and what the TV shows.
 */
export interface State {
  id: string;
  label: string;
  /** One line: what this state shows and what to try in it. */
  note: string;
  world: () => World;
  /** The phones drawn, each with its door. */
  phones: Partial<Record<Seat, string | null>>;
  /** Open the standings sheet on these phones. */
  standings?: Seat[];
  tv?: boolean;
}

export interface Screen {
  id: string;
  piece: string;
  title: string;
  graft: string;
  /** The composer is on this screen: offer both variants. */
  composer?: boolean;
  states: State[];
}

// ---- Cards the states reuse ----

const pact = (over: Partial<DealCard> = {}) => card({ id: 'deal-q7k2m9', from: 'lena', to: 'brix', terms: PACT, offered: 5, until: 7, ...over });
const vote = (over: Partial<DealCard> = {}) => card({ id: 'deal-b3x8re', from: 'lena', to: 'brix', terms: VOTE_BRIX, offered: 5, until: 8, ...over });
const law = (over: Partial<DealCard> = {}) => card({ id: 'deal-m1v0tz', from: 'lena', to: 'brix', terms: LAW_YES, offered: 5, until: 6, ...over });

const BROKE_VOTE = 'Lena broke a promise to Brix: a vote for Brix. Reputation −10.';
const BROKE_PACT = 'Lena broke a pact with Brix. Reputation −20.';

/** Month 8, after the ceremony: Lena held a vote card for Brix and voted otherwise. */
const brokenVoteWorld = (stage: World['stage'] = 'planning') =>
  baseWorld({ month: 8, stage, rep: { lena: 40, ossa: 72, brix: 61, kai: 44 }, cards: [vote({ status: 'broken', brokenBy: 'lena', settled: 8 }), pact({ status: 'kept', settled: 7 })], news: [BROKE_VOTE] });

const ALL_STATUSES = () =>
  baseWorld({
    month: 6,
    rep: { lena: 50, ossa: 72, brix: 61, kai: 44 },
    cards: [
      card({ id: 'deal-k9p4wd', from: 'kai', to: 'lena', terms: { kind: 'vote', office: 'governor', candidate: 'ossa' }, offered: 6, until: 8 }),
      card({ id: 'deal-h2c6sn', from: 'lena', to: 'ossa', terms: VOTE_OSSA, offered: 6, until: 8 }),
      pact({ status: 'active', offered: 6, until: 8 }),
      card({ id: 'deal-u8f3ja', from: 'lena', to: 'kai', terms: PACT, offered: 5, until: 5, status: 'kept', settled: 5 }),
      card({ id: 'deal-z5n1yq', from: 'brix', to: 'lena', terms: LAW_YES, offered: 5, until: 6, status: 'declined', settled: 5 }),
      card({ id: 'deal-e4r7lb', from: 'lena', to: 'kai', terms: VOTE_OSSA, offered: 5, until: 8, status: 'withdrawn', settled: 5 }),
      card({ id: 'deal-x1x1x1', from: 'ossa', to: 'lena', terms: PACT, offered: 5, until: 7, status: 'expired', settled: 5 }),
    ],
  });

export const SCREENS: Screen[] = [
  {
    id: 'walk',
    piece: 'P1–P5',
    title: 'The table, moment by moment',
    graft: 'Every graft target below, together: the spec’s “What the table sees”, walked',
    composer: true,
    states: [
      { id: 'talk', label: '1 · They talk', note: 'Brix and Lena whisper. No card yet; Kai’s phone and the TV know nothing.', world: () => baseWorld(), phones: { lena: 'whisper:brix', brix: 'whisper:lena', kai: null }, tv: true },
      { id: 'offer', label: '2 · Lena taps + Deal', note: 'The composer opens from the whisper. Pick 3 months and Offer: the card lands on Brix’s phone at once.', world: () => baseWorld(), phones: { lena: 'compose:brix:pact', brix: 'whisper:lena', kai: null }, tv: true },
      { id: 'arrives', label: '3 · The card arrives', note: 'Brix: “1 deal offer” leads the agenda; tap it for the card in the thread. Lena: Waiting for Brix, Withdraw. Kai and the TV: nothing.', world: () => baseWorld({ cards: [pact()] }), phones: { lena: 'whisper:brix', brix: null, kai: null }, tv: true },
      { id: 'accepted', label: '4 · Brix accepts', note: 'Both phones list the pact in My cards as active, until month 7. Nothing anywhere else.', world: () => baseWorld({ cards: [pact({ status: 'active' })] }), phones: { lena: 'cards', brix: 'cards', kai: null }, tv: true },
      { id: 'expired', label: '5 · Planning ends, unanswered', note: 'Month 6: the card Brix never answered expired when planning ended. Both see it settled; nobody else ever did.', world: () => baseWorld({ month: 6, cards: [pact({ status: 'expired', settled: 5 })] }), phones: { lena: 'cards', brix: 'cards' } },
      { id: 'asks', label: '6 · A candidate asks for a vote', note: 'Brix asks in a whisper (a card is always its proposer’s own promise). Lena sends her vote: My vote → Brix.', world: () => baseWorld({ cards: [pact({ status: 'active' })] }), phones: { lena: 'compose:brix:vote', brix: 'whisper:lena' } },
      { id: 'ballot', label: '7 · The ballot, with a promise', note: 'Month 8. Lena’s ballot: “You promised Brix your vote”, Brix picked on her phone only. She still casts; try Ossa.', world: () => baseWorld({ month: 8, stage: 'ballot', cards: [vote({ status: 'active' }), pact({ status: 'kept', settled: 7 })] }), phones: { lena: null, brix: null, kai: null }, tv: true },
      { id: 'kept', label: '8a · She keeps it: +3', note: 'The result has shown. Lena 50 → 53 beside her name everywhere; My cards: kept. No banner, no news, no public card.', world: () => baseWorld({ month: 8, rep: { lena: 53, ossa: 72, brix: 61, kai: 44 }, cards: [vote({ status: 'kept', settled: 8 }), pact({ status: 'kept', settled: 7 })] }), phones: { lena: 'cards', brix: 'cards', kai: 'card:lena' }, tv: true },
      { id: 'broken', label: '8b · She breaks it: −10', note: 'Lena 50 → 40 everywhere. The TV’s banner and the news say who promised what to whom; Kai sees it on Lena’s card.', world: () => brokenVoteWorld(), phones: { lena: 'cards', brix: 'cards', kai: 'card:lena' }, tv: true },
      { id: 'pact-kept', label: '9 · A pact runs out: Pact kept', note: 'The pact ran months 5 to 7 unbroken: +3 each at month 7’s end (only where sabotage is on).', world: () => baseWorld({ month: 8, rep: { lena: 53, ossa: 72, brix: 64, kai: 44 }, cards: [pact({ status: 'kept', settled: 7 })] }), phones: { lena: 'cards', brix: 'cards' }, tv: true },
      { id: 'pact-broken', label: '10 · Caught during a pact', note: 'Slice 4 catches Lena sabotaging Brix in month 6: the pact breaks, −20 (and S4’s −10 for being caught). Lena drops under 30.', world: () => baseWorld({ month: 6, rep: { lena: 20, ossa: 72, brix: 64, kai: 44 }, cards: [pact({ status: 'broken', brokenBy: 'lena', settled: 6 })], news: [BROKE_PACT] }), phones: { lena: 'cards', brix: 'cards', kai: 'card:lena' }, tv: true },
      { id: 'ai', label: '11 · An AI seat answers', note: 'Lena offers Ossa (AI) her vote for Ossa. Send it: Ossa answers in under two seconds, well before planning can end.', world: () => baseWorld(), phones: { lena: 'compose:ossa:vote' } },
      { id: 'ai-refuses', label: '12 · An AI refuses a low name', note: 'Lena is at 20. The composer warns before she sends; Ossa declines when it answers (S3-RULE-9 row 1).', world: () => baseWorld({ month: 6, rep: { lena: 20, ossa: 72, brix: 64, kai: 44 }, cards: [pact({ status: 'broken', brokenBy: 'lena', settled: 6 })] }), phones: { lena: 'compose:ossa:pact' } },
      { id: 'month-end', label: '13 · The month end', note: 'Month 8 ends: the month’s broken cards on every phone and the TV, beside the league’s chips.', world: () => brokenVoteWorld('monthEnd'), phones: { lena: null, kai: null }, tv: true },
    ],
  },
  {
    id: 'composer',
    piece: 'P1',
    title: 'The composer: + Deal',
    graft: 'Deals.tsx DealComposerSheet (A) / DealComposerInline (B); phone/parts.tsx::Chat’s whisper input',
    composer: true,
    states: [
      { id: 'pact', label: 'Pact', note: 'From a whisper to Brix: a pact, 1, 3 or 6 months, and what it binds.', world: () => baseWorld(), phones: { lena: 'compose:brix:pact' } },
      { id: 'vote', label: 'My vote', note: 'Her own vote: for a declared candidate in the month-8 election, or yes/no on the law vote of month 6.', world: () => baseWorld(), phones: { lena: 'compose:brix:vote' } },
      { id: 'vote-taken', label: 'Vote already promised', note: 'She promised Ossa her vote: the other Governor choice gives the engine’s words instead (row 13). The law vote is still open.', world: () => baseWorld({ cards: [card({ id: 'deal-h2c6sn', from: 'lena', to: 'ossa', terms: VOTE_OSSA, status: 'active', until: 8 })] }), phones: { lena: 'compose:brix:vote' } },
      { id: 'pact-taken', label: 'Pact already held', note: 'An active pact with Brix: the pact choice says so, in the engine’s words (row 7).', world: () => baseWorld({ cards: [pact({ status: 'active' })] }), phones: { lena: 'compose:brix:pact' } },
      { id: 'limit', label: 'Three waiting', note: 'Three cards out unanswered: the composer says so and will not send (row 4).', world: () => baseWorld({ cards: [card({ id: 'deal-k9p4wd', from: 'lena', to: 'ossa', terms: PACT }), card({ id: 'deal-h2c6sn', from: 'lena', to: 'kai', terms: PACT }), card({ id: 'deal-u8f3ja', from: 'lena', to: 'kai', terms: LAW_YES })] }), phones: { lena: 'compose:brix:pact' } },
      { id: 'refused', label: 'Refused by the engine', note: 'A race the phone could not see: the server’s RuleError words, in the composer, where she tapped.', world: () => baseWorld({ toasts: { lena: [{ id: 1, message: 'Brix has not answered your last card' }] } }), phones: { lena: 'compose:brix:pact' } },
      { id: 'ai-warning', label: 'To an AI, under 30', note: 'Ossa turns down a name under 30: said before the send; still sendable, Ossa’s answer is the rule.', world: () => baseWorld({ rep: { lena: 24, ossa: 72, brix: 61, kai: 44 } }), phones: { lena: 'compose:ossa:pact' } },
      { id: 'waiting', label: 'Sent: waiting', note: 'After Offer: the card in the thread, Waiting for Brix, Withdraw; + Deal waits too.', world: () => baseWorld({ cards: [pact()] }), phones: { lena: 'whisper:brix' } },
      { id: 'from-name', label: 'From a name', note: 'A name or chip opens the player’s card: reputation, why it moved, Whisper and + Deal.', world: () => baseWorld(), phones: { lena: 'card:brix' } },
      { id: 'from-standings', label: 'From the standings', note: 'The standings row: the chip, and + Deal at the row’s end.', world: () => baseWorld(), phones: { lena: null }, standings: ['lena'] },
    ],
  },
  {
    id: 'incoming',
    piece: 'P2',
    title: 'The incoming card',
    graft: 'Deals.tsx IncomingDeal, in Chat’s thread; today.tsx’s agenda (DEALS_AGENDA)',
    states: [
      { id: 'agenda', label: 'On the agenda', note: 'Brix’s hub: “1 deal offer · From Lena” leads This month, and the Talk tab carries a 1. Tap the door.', world: () => baseWorld({ cards: [pact()] }), phones: { brix: null } },
      { id: 'from-ai', label: 'From an AI seat', note: 'Ossa (an AI seat) offers Lena a pact: “Card from Ossa · AI”, on the agenda and in their thread (Heiko, 8 Nov). Tap the door.', world: () => baseWorld({ cards: [card({ id: 'deal-k9p4wd', from: 'ossa', to: 'lena', terms: PACT, until: 7 })] }), phones: { lena: null } },
      { id: 'from-ai-thread', label: 'From an AI, in the thread', note: 'The same card in the Lena–Ossa whisper: the mark after Ossa’s name on the label, the names and the stakes.', world: () => baseWorld({ cards: [card({ id: 'deal-k9p4wd', from: 'ossa', to: 'lena', terms: PACT, until: 7 })] }), phones: { lena: 'deals' } },
      { id: 'thread', label: 'In the thread', note: 'The card in the pair’s whisper: both reputations, what it binds, Accept / Decline.', world: () => baseWorld({ cards: [pact()] }), phones: { brix: 'deals' } },
      { id: 'vote', label: 'A vote card', note: 'Lena’s vote for Brix: he promises nothing; what Lena risks.', world: () => baseWorld({ cards: [vote()] }), phones: { brix: 'deals' } },
      { id: 'two', label: 'Two offers', note: 'Lena and Kai both: the door opens My cards, the two together.', world: () => baseWorld({ cards: [pact(), card({ id: 'deal-k9p4wd', from: 'kai', to: 'brix', terms: { kind: 'vote', office: 'governor', candidate: 'brix' }, until: 8 })] }), phones: { brix: 'deals' } },
      { id: 'answered', label: 'Accepted', note: 'One tap: the thread keeps a line, the card moves to My cards as active.', world: () => baseWorld({ cards: [pact({ status: 'active' })] }), phones: { brix: 'whisper:lena', lena: 'whisper:brix' } },
      { id: 'declined', label: 'Declined', note: 'Declined: a line in the thread on both phones; settled in My cards.', world: () => baseWorld({ cards: [pact({ status: 'declined', settled: 5 })] }), phones: { brix: 'whisper:lena', lena: 'whisper:brix' } },
    ],
  },
  {
    id: 'cards',
    piece: 'P3',
    title: 'My cards',
    graft: 'Deals.tsx MyDeals, one section of desks.tsx::TalkDesk',
    states: [
      { id: 'all', label: 'Every kind', note: 'For you to answer, waiting (with Withdraw and offers left), active (what it binds, until when), settled.', world: ALL_STATUSES, phones: { lena: 'cards' } },
      { id: 'broken', label: 'With a broken card', note: 'Lena broke her vote card: settled as broken, −10, in public.', world: () => brokenVoteWorld(), phones: { lena: 'cards', brix: 'cards' } },
      { id: 'empty', label: 'None yet', note: 'No card: where to start one.', world: () => baseWorld(), phones: { lena: 'cards' } },
    ],
  },
  {
    id: 'chip',
    piece: 'P4',
    title: 'The reputation chip',
    graft: 'parts.tsx::RepChip and Who; Standings.tsx; ReadyBar.tsx::WaitingFor; TableApp.tsx’s ready list and Players; MonthEnd.tsx::LeagueTable',
    states: [
      { id: 'bands', label: 'The three bands', note: 'A star at 70+, a dashed edge and a warning under 30: readable in greyscale. Phone and TV sizes.', world: () => baseWorld({ rep: { lena: 50, ossa: 72, brix: 61, kai: 24 }, unrest: { kai: [3, 4] } }), phones: {} },
      { id: 'standings', label: 'Standings', note: 'The header’s “2nd of 4”: every name with its chip; tap one for the player’s card.', world: () => brokenVoteWorld(), phones: { kai: null }, standings: ['kai'] },
      { id: 'card', label: 'Tapped: the reasons', note: 'Lena’s card on Kai’s phone: 40, fair, broke a promise to Brix (−10). Kept cards never show.', world: () => brokenVoteWorld(), phones: { kai: 'card:lena' } },
      { id: 'tv', label: 'On the TV', note: 'The TV’s ready list and waiting box carry the chips; the TV has no taps.', world: () => baseWorld({ rep: { lena: 50, ossa: 72, brix: 61, kai: 24 } }), phones: {}, tv: true },
    ],
  },
  {
    id: 'ballots',
    piece: 'C21',
    title: '“You promised” on the ballots',
    graft: 'ElectionDay.tsx’s ballot paper; LawBallot.tsx::CouncilBallot',
    states: [
      { id: 'election', label: 'Election', note: 'Lena promised Brix: the line, PROMISED on Brix, Brix picked on her phone only. Kai, with no promise, sees today’s ballot.', world: () => baseWorld({ month: 8, stage: 'ballot', cards: [vote({ status: 'active' })] }), phones: { lena: null, kai: null }, tv: true },
      { id: 'law', label: 'Law vote', note: 'Lena promised Brix a yes on the land tax: the line, PROMISED on Yes, Yes picked on her phone only.', world: () => baseWorld({ month: 6, stage: 'lawBallot', cards: [law({ status: 'active' })] }), phones: { lena: null, kai: null }, tv: true },
    ],
  },
  {
    id: 'tv',
    piece: 'P5',
    title: 'The public break, on the TV',
    graft: 'new table/TvDeals.tsx (TvBreakBanner); TableApp.tsx’s planning; MonthEnd.tsx (BrokenCards)',
    states: [
      { id: 'vote', label: 'A vote broken', note: 'The banner under the header as the result takes effect: who, to whom, what; 50 → 40.', world: () => brokenVoteWorld(), phones: { kai: null }, tv: true },
      { id: 'law', label: 'A law vote broken', note: 'The same banner for a law card: “a yes on the law”.', world: () => baseWorld({ month: 6, rep: { lena: 40, ossa: 72, brix: 61, kai: 44 }, cards: [law({ status: 'broken', brokenBy: 'lena', settled: 6 })], news: ['Lena broke a promise to Brix: a yes on the law. Reputation −10.'] }), phones: {}, tv: true },
      { id: 'pact', label: 'A pact broken', note: 'Slice 4’s capture breaks a pact: −20.', world: () => baseWorld({ month: 6, rep: { lena: 20, ossa: 72, brix: 64, kai: 44 }, cards: [pact({ status: 'broken', brokenBy: 'lena', settled: 6 })], news: [BROKE_PACT] }), phones: {}, tv: true },
      { id: 'ai', label: 'An AI seat breaks one', note: 'Ossa (AI) promised Kai a yes and voted no: the banner names “Ossa · AI” (Heiko, 8 Nov).', world: () => baseWorld({ month: 6, rep: { lena: 50, ossa: 62, brix: 61, kai: 44 }, cards: [card({ id: 'deal-z5n1yq', from: 'ossa', to: 'kai', terms: LAW_YES, offered: 5, until: 6, status: 'broken', brokenBy: 'ossa', settled: 6 })], news: ['Ossa broke a promise to Kai: a yes on the law. Reputation −10.'] }), phones: { kai: 'card:ossa' }, tv: true },
      { id: 'month-end', label: 'Month end', note: 'The month’s broken cards under the colony panel, on the TV and every phone: one by a person, one by an AI seat.', world: () => { const w = brokenVoteWorld('monthEnd'); return { ...w, rep: { ...w.rep, ossa: 62 }, cards: [card({ id: 'deal-z5n1yq', from: 'ossa', to: 'kai', terms: VOTE_BRIX, offered: 6, until: 8, status: 'broken', brokenBy: 'ossa', settled: 8 }), ...w.cards] }; }, phones: { kai: null }, tv: true },
    ],
  },
];

export const screenOf = (id: string | null) => SCREENS.find((s) => s.id === id) ?? null;
