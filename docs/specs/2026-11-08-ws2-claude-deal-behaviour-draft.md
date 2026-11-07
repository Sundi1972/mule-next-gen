# AFTER RC — draft for the mock, not a spec

**How a Claude seat deals with cards** · WS2 · 7 Nov · for WS6's P4 mock ("Claude's social side")

This page lets WS6 draw P4's deal states now. Claude playing deal cards comes after the first release candidate (PM
ruling A, 7 Nov; Heiko's RC plan). It is not agreed behaviour. The post-RC spec (Spec B v2's C10, with WS7's port)
decides it. Everything here is built only from WS7's slice-3 contract (`docs/specs/2026-11-07-ws7-slice3-deals.md` on
`ws7-politics-rc`) and Spec B v2 (`docs/specs/2026-10-29-ws2-social-play.md`, C10, HC-B1, HC-B6, HC-B7).

## In the RC: every computer seat is keyless

A Smart seat, a Claude Code seat and a Classic seat all deal by WS7's keyless rules. The mock's RC states are WS7's
own:
- **Answering a card offered to it** (S3-RULE-9 answer rows): it declines a proposer whose reputation is below
  `POLITICS.ai.deals.refuseBelow`. Otherwise it accepts when the card's worth to it reaches its persona's bar; a Rookie
  accepts by chance. It answers after a short pause, and always before planning ends.
- **Offering** (S3-RULE-9 offer rows): at most `offersPerMonth` cards a month, in two windows: an election's announce,
  and planning proper. It offers (a) its own vote for a candidate it backs, to that candidate; (b) its vote on a law;
  (c) a pact. It never asks for a vote and never withdraws an offer; an offer simply expires.
- **Keeping or breaking a promised vote** (S3-RULE-10): it keeps unless breaking gains more than its persona's honesty
  times the reputation it would lose. A Rookie always keeps.
- A muted AI sends that player no card (WS7 S3-C11, once WS2's mute exists).

## After the RC: what Claude adds

Through WS7's frozen port, `DealPort { answerFor(card): boolean | null; offersFor(month): DealOffer[] | null }`, null
means the keyless rule. The choice comes only from Claude's **recorded** reasoning, never from chat text (HC-B3).

| Moment | What Claude does | What the screens need to show |
|---|---|---|
| **When it offers** | At its monthly think (the strategy call at upkeep, for the next month), it may plan card offers as part of its playbook (`PlanningPlay.offers`). They are sent when planning opens, each with a short message saying why. | An offer card from an AI seat in the proposer row, with the "· AI" mark (HC-B7), and its message beside it in Talk. |
| **What it offers** | The same card kinds a phone can send: its vote for a candidate, its vote on a law, a pact of N months. A card carries no goods and no money (HC-B6; WS7 S3-HC-1). | The card's terms as WS7 draws them: who, what, until. No "AI-only" card kinds. |
| **How it answers** | An offer to it is answered from its recorded playbook if Claude decided that card's kind or partner, else by the keyless rule. When a whisper about the card reaches it, its reply (Spec B C7) may explain the answer in words. | Accept or decline arriving within planning, with an optional AI line in Talk ("Not this month, Kai, your Crystite plot cost me."). |
| **Keep or break** | It keeps or breaks a promised vote by WS7's rule, with Claude's recorded vote as "own" (the vote seam, Spec B C12). It may bluff about its own intentions in chat, but never about a game fact (HC-B1). A broken card is public. | The broken-card news line and the reputation drop (WS7's), the same as for a human. Nothing on screen says *why* an AI broke a card, unless it says so in chat. |
| **After a broken card** | Its memory counts the break (Spec B C2). Its next monthly think may turn cold toward the breaker, decline that player's cards, and say so. | The "· AI" seat's later lines and answers. No special AI state. |

## Telling an AI's card from a person's

Every computer seat's bubble, whisper and card carries a quiet "· AI" mark, the same mark the Talk desk list shows
(Heiko, 7 Nov; Spec B HC-B7). WS6 styles it and builds the phone; WS4 builds the TV. Apart from the mark, an AI's card
looks and works exactly like a person's: one tap to accept, the same terms, the same keep/break rules.

## States for the mock (mark all "after RC" except row 1)

1. An AI seat's keyless offer and answer (**RC**), shown with the "· AI" mark.
2. A Claude seat's planned offer arriving with its message (after the RC).
3. A Claude seat declining with a line in Talk (after the RC).
4. A Claude seat breaking a promised vote: the public news line, its reputation drop, and its later cold line (after
   the RC).
5. A muted AI: no offers reach that phone; an offer already on the phone stays until Ready (Heiko's mute mock, ws6-ux
   29b792c2).
