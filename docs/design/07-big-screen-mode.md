# Big screen mode

An optional way to play together in one room. One shared screen (a TV, a laptop or a PC) becomes the game board, and every player's phone becomes their private controller. It is the closest thing to the original M.U.L.E. on a C64 with four joysticks: everyone looks at the same picture and shouts at each other, but now each player also has secrets in their hand.

Without a big screen the game works exactly as before: every phone shows the map itself. The big screen is a host setting, not a different game.

## The one rule

**Public things go on the big screen, private things stay on the phone.** The big screen never shows anything a player could want to hide: stock, survey results, secret orders, whispers, the AI's private plans. Money and plots stay public, as in the original. If a phone ever needs the big screen to make a private decision, or the big screen ever needs a phone to follow the game, the design is wrong.

## Getting started

1. On the PC, open the game website and press **Big screen**. It shows a large QR code and a 4-letter room code.
2. Everyone scans the code with their phone and picks a name, colour and species. Their avatar walks onto the big screen as they join.
3. The first phone to join is the host: it chooses the settings, adds AI players and presses Start. The PC itself has no seat and no controls, so nobody needs to sit at the keyboard.
4. The PC can be cast to a TV with Chromecast, AirPlay or an HDMI cable. No app is needed on the PC or the TV.

## Who is in control

**No device is the master. The game runs on our server**, and every phone and the big screen are just screens connected to it.

- **The big screen does not mirror a phone.** Mirroring would show the host's secrets to everyone and tie up the host's phone. Instead the big screen opens its own page, the board, which joins the room by its code and only ever receives the public view.
- **The board has no controls.** All control is on the phones. The first phone to join is the host. If the host's phone dies or leaves, the next phone becomes host.
- **Any screen with a browser can be the board, with no TV app needed:**
  - a laptop or PC, on its own or connected to a TV with HDMI
  - a smart TV's built-in browser
  - casting from a phone to a Chromecast or Google TV. The phone only tells the TV which page to open, then the TV connects by itself and the phone is free again. This is the smoothest way and the one we design for first.
- **Native TV apps come later.** Apps for Samsung (Tizen) and LG (webOS) TVs are web apps underneath, so the same board page can be packaged for their stores. Android TV, Fire TV and Apple TV follow the same way.
- **The game must always work without a big screen.** Every phone can show the full map. If the board disconnects, the phones switch to full view and the game carries on.
- **The game needs internet**, even at the kitchen table, because the server runs the game. A fully offline mode, where one device acts as the server, is not planned for the first version.

## What each screen shows, phase by phase

| Phase | Big screen | Your phone |
| --- | --- | --- |
| Planning (council table) | The map, the month's news and forecasts, the timer, public deal offers and the table chat, with AI players speaking in speech bubbles | Your stock and money, deal cards, whispers, secret sabotage orders, insurance and survey orders, a Ready button |
| Council vote | The Governor's proposal in big type, then a dramatic reveal of the result | Your secret vote and how many votes you hold |
| Land grant | The classic sweeping cursor moving across the free plots | One huge CLAIM button, plus your claims left |
| Land auction | The plot up for sale and the live bids | A bid slider |
| Development | The whole map with every player's avatar walking around at the same time, carrying MULEs | A close-up of your own land: tap a plot to walk there, buy, outfit and install MULEs, start surveys |
| Production and events | Animated production, events and sabotage reveals, with sound | Your own results: what you made, what you lost, what spoiled |
| Goods auction | The original auction screen: buyers at the top, sellers at the bottom, everyone's line moving live, the store's prices as two bars | A vertical slider you drag up and down to move your line, and a sell/buy switch |
| End of game | Final scores, awards and a replay of the colony's story | Your own score breakdown |

## Why it is fun

- **The auction comes back.** The original auction was everyone pushing joysticks up and down while watching one screen. With phones as sliders it plays exactly like that again, for up to 6 people.
- **The land grant cursor.** Everyone watches the same cursor and slams their phone at the right moment. It is loud and quick.
- **Secrets in public.** You can sit next to your sister, smile at her across the table, and order sabotage on her Crystite mine from your phone. The reveal happens on the big screen in front of everyone.
- **Look-up moments.** When something big happens (a pirate raid, a vote result, a sabotage reveal), phones vibrate and say "Look at the screen", so everyone looks up together.
- **Sound on one speaker.** Music and sound effects play only on the big screen. Phones stay silent and use vibration, so the room doesn't turn into six speakers playing out of sync.

## Mixed rooms and remote players

A big screen game can still have remote players, for example grandpa at home. Remote players get both views on their own device: the board and their controller, as in normal online play. Their table chat appears on the big screen, and AI players fill the empty seats as usual.

## Design rules for the big screen

- Readable from 3 metres: large type, few words, no small numbers that matter.
- Every player has a colour and a shape, so colour-blind players can tell avatars apart.
- Landscape 16:9 only. Phones stay portrait.
- The host's phone has a Pause button for dinner and phone calls, and pauses show on the big screen.
- If the big screen disconnects, the game keeps running and the phones switch to their full map view until it comes back.

## Fairness in real-time phases

The cursor is on the TV but the button is on the phone, so a slow Wi-Fi connection must not decide who gets a plot. The server moves the cursor on a fixed schedule from a shared clock, every phone knows where the cursor is at every moment, and a claim counts for the plot the cursor was on when the player pressed, as long as the press reaches the server within a short grace window. The same goes for the auction: the slider position counts from when it was set, not when it arrived.

## When it is built

The first prototype already has a simple version: an optional board view that shows the map and auctions. The full controller layout for phones, the look-up moments and the big-screen auction come right after the first playable month, before the art pass.
