# Asset packs: Heiko's follow-up questions

*Read 6 Nov 2026, 15:12–15:30 UTC, from the sellers' own pages only. Nothing bought, no accounts made. "Unclear in writing" means the seller's text does not settle the point.*

Notes on what could be read:
- **KitBash3D:** the `kitbash3d.com/products/...` pages answer HTTP 429 "local_rate_limited" to this machine. The same product pages read fine on KitBash3D's own Cargo host, `cargo-app.kitbash3d.com/products/...`, and the kit facts below come from there. Heiko's browser can open either address.
- **Fab:** listing pages read fine. The binding Fab EULA text does not show without login.

KitBash3D sources:
- **[LIC]** KitBash License Agreement, "Last Modified: April 6, 2026". https://kitbash3d.com/pages/license-text redirects to the PDF https://cdn.shopify.com/s/files/1/2316/3287/files/KITBASH3D_LICENSE_AGREEMENT.pdf?v=1775495821
- **[UR]** KitBash Usage Rights, "Last Modified: April 6, 2026". https://kitbash3d.com/pages/usage-rights redirects to the PDF https://cdn.shopify.com/s/files/1/2316/3287/files/KitBash_Usage_Rights_-_April_2026.pdf?v=1775083765
- **[PRICE]** Pricing page and its FAQ: https://cart-checkout.kitbash3d.com/pages/pricing
- **[CANCEL]** Help article "Subscription Upgrades, Billing, Payments and Refunds": https://help.kitbash3d.com/en/articles/7833673-subscription-upgrades-billing-and-payments

---

## 1. KitBash3D

### Price first: one month costs $119, not $59, and a single kit bought outright is close to that

- **The subscription.** [PRICE] shows "$59 /month · $708 billed yearly" by default; that is the *yearly* plan. The page's own monthly figure for the KitBash3D library is `data-monthly-price='119'`, "Billed monthly".
- **Single kits, bought outright.** These are perpetual, with no subscription. Every kit page read shows three price tiers: "INDIVIDUAL (SELF-EMPLOYED)", "SMALL BUSINESS (2-50 EMPLOYEES)" and "ENTERPRISE (51+ EMPLOYEES)". For example, Lunar Base is $145 / $595 / $10,000 (https://cargo-app.kitbash3d.com/products/lunar-base).
- [UR, Perpetual]: "these licenses grant perpetual rights to use the specific purchased assets in an unlimited number of new projects forever."
- **So if one or two kits are enough, buying them outright ($145–245 each on the Individual tier) beats a $119 month.** The rights never lapse, and re-rendering later is no problem.

### (a) Do kits downloaded in a paid month stay licensed after cancelling? No. Only the finished pictures keep them.
- [LIC §3.2.3(a)]: "If your Usage Rights provide for a Subscription, you are not permitted to access or use the Assets following the expiration of the Term. … However, … to the extent the Asset was properly incorporated as part of a Larger Work …, you may, following the Term …, continue to use and display the Asset as part of the Larger Work in the same manner in which the Asset was initially incorporated".
- [CANCEL]: "you cannot import, transfer, copy or use Cargo Assets obtained through your subscription in any new projects once your subscription ends. Subscriptions do not grant ownership of assets".

### (b) Can renders made that month be used in a commercial web game indefinitely, if we ship pictures, not models? Yes, for pictures finished during the month.
- [LIC §1.8]: "'Larger Work(s)' means images, videos, and/or interactive experiences".
- [UR]: "Includes a license for commercial use of assets within 'Larger Works' (e.g., films, games, or advertisements)" and "You may only deliver finished, non-editable renders or files".
- [PRICE FAQ]: "any work you've already incorporated into a project is yours to keep, use, render, and distribute."
- [CANCEL]: "When your subscription ends, you can continue to work on the projects you created without interruption."
- **Unclear in writing:** whether a *new* picture after the month counts as the same project or a "new project". Examples are a new stage, a re-light, or a fix to a building. The FAQ's "render" and the help article's "continue to work on the projects you created" point to yes. [LIC §3.2.3(a)] says only "in the same manner in which the Asset was initially incorporated". The safe plan is to finish every picture with KitBash parts inside the month, or to buy the kit outright.
- Two more points: "Larger Works must include substantial additional content and/or imagery in addition to the Assets" [LIC §3.2.2]. KitBash may "feature and/or display any of your Larger Works incorporating the Assets" on its website and social media [LIC §11.2].

### (c) Does "two or more people must buy Team" apply to a one-person owner whose renders are made by AI agents on his machine? Unclear in writing. The texts count *people*; AI agents are not mentioned anywhere.
- [UR, Individual]: "for individual artists or single-member legal entities (such as sole proprietorships or single-owner LLCs/S Corps) with no other employees, contractors, partners, or members. Organizations of two or more people are not permitted to use Individual plans regardless of the number of users."
- [UR, Teams]: "For any organization, studio, or entity with two or more employees, owners, or contractors."
- Kit tiers count employees the same way: "SMALL BUSINESS (2-50 EMPLOYEES)".
- [LIC preamble]: you sign "on your own behalf and on behalf of any legal entity for which you are acting". **The test is the legal entity that owns the game.** If that entity has a second employee, owner or contractor, Individual is out, however few people use the account.
- [LIC §3.2.13(b)]: "Each User Account is assigned to an individual user and is personal to that user. … nor will any such user permit or allow any third party to use his or her assigned User Account." Whether an AI agent driving Blender on Heiko's own account is a "third party" is unclear in writing.
- [LIC §3.2.7]: "The Assets may not be used as inputs in or as part of the training of artificial intelligence ('AI') or machine learning models." Our agents do not train models. Whether an agent reading the asset files or the renders counts as "inputs in … AI … models" is unclear in writing. **Ask KitBash (info@kitbash3d.com, named in [CANCEL]) in writing before paying.**

### (d) Kits for the Spaceport, Observatory, and rooftop and civic details

All were read today on the kit's own page. All list "Blender: Native" among their formats, and each kit page's model list names the models given here.

| Kit | For us | Outright price, Individual / Small Business | Product page (renders) |
|---|---|---|---|
| **Mission to Minerva** | Spaceport: "Landing Pad", "Tower Control", "Crane Mobile", "Crane Stationary", "Cargo Ship" vehicle, cargo, tanks, solar panels, rubble, greenhouse, community centre. Colony-styled. | **free: $0 / $0** (Enterprise $10,000) | https://cargo-app.kitbash3d.com/products/mission-to-minerva (also https://kitbash3d.com/products/mission-to-minerva) |
| **Lunar Base** | Spaceport and Observatory: "Launchpad", "Radio Observatory", "Observation Outpost", antennas, tanks, cooling system, pipes. "30+ lunar habitat model exteriors" | $145 / $595 | https://cargo-app.kitbash3d.com/products/lunar-base |
| **Construction Zone** | under-construction stage: "Construction Crane A/B", crane base and segments, a Hospital under construction (`BldgLgHospital`, `BldgSmHospital`), field offices, concrete mixer, generators, guardrails, beams | $245 / $995 | https://cargo-app.kitbash3d.com/products/construction-zone |
| **Utopia** | civic buildings: "Observatory", "City Hall", "Hospital", "Museum of Art", "Education Tower". The style is Zaha Hadid / Gehry curves, which may be too sculptural for our colony; look at the renders first | $145 / $595 | https://cargo-app.kitbash3d.com/products/utopia |
| Stadiums *(optional)* | "Full-scale domes and open-air arenas", modular seating | $245 / $995 | https://cargo-app.kitbash3d.com/products/stadiums |
| Spaceships: Legacy *(optional)* | a ship on the pad: hulls, engines, "boosters", tanks | $95 / $395 | https://cargo-app.kitbash3d.com/products/spaceships-legacy |

**A big rocket on a gantry:** none of the kits read lists a launch gantry or a classic rocket. Spaceships: Legacy is the nearest thing, a sci-fi vessel. The nearest gantry-like pieces are the cranes and "Tower Control" in Mission to Minerva.

**Rooftop details:** "Rooftops" on the site is a material category, not a kit. Rooftop plant comes from Lunar Base (antennas, tanks, cooling system, pipes) and Mission to Minerva (solar panels, tanks).

Polycounts are not stated on any of these pages. Each kit page carries the flag `"isGameplayReady":false`, so treat them as offline-render assets.

### Heiko's steps: KitBash3D, for rendering only

**Option A, recommended: no subscription.**
1. Open https://cargo-app.kitbash3d.com/products/mission-to-minerva and look at the renders.
2. Create a KitBash3D account (top right, "SIGN UP"). Use Heiko's own name and the right legal entity, because the tier depends on who owns the game; see (c).
3. "Buy" Mission to Minerva at $0 on the tier that matches the legal entity. It is perpetual.
4. If Lunar Base or Construction Zone is worth it after looking at the renders, buy it outright on the same tier ($145 or $245 Individual; $595 or $995 Small Business).
5. The licence accepted at checkout is the **KitBash License Agreement** (https://kitbash3d.com/pages/license-text) together with the **Usage Rights**, "Perpetual Licenses" section (https://kitbash3d.com/pages/usage-rights).
6. Download: on kitbash3d.com click the profile icon, then "My Kits", then the kit. In the drop-downs choose **Blender / Native** and the texture size, then "Download Full Kit". Allow multiple downloads in the browser, because files and textures come as two zips. Source: https://help.kitbash3d.com/en/articles/6449636-how-do-i-redownload-a-kit-or-download-a-different-file-format
7. Unzip into `~/Art/kitbash3d/<kit-name>/`, outside the repo, **never committed**. Only our renders ship.

**Option B: one month at $119, if he wants several kits for a short burst.**
1. Ask KitBash the questions in (c) by email first (info@kitbash3d.com) and keep the reply.
2. On https://cart-checkout.kitbash3d.com/pages/pricing choose **Individual, Monthly** ($119, "Billed monthly"). Choose "Small Business / Team" instead if the owning entity has two or more people; Team is "Annual billing only", $948 per seat.
3. The licence accepted is the KitBash License Agreement (https://kitbash3d.com/pages/license-text) and the Usage Rights, "Individual Subscriptions" section (https://kitbash3d.com/pages/usage-rights).
4. Install Cargo. It supports Blender **4.2–5.2** "downloaded from blender.org only" (https://help.kitbash3d.com/en/articles/7833635-cargo-supported-3d-software-and-render-engines). In Cargo, go to Settings → Software and set the download location to `~/Art/kitbash3d/`. "Downloads are saved to your download location, which you can view or change in Settings → Software" (https://help.kitbash3d.com/en/articles/7833634-download-and-import-assets-using-cargo).
5. Download the kits from (d) in the Blender format.
6. **Cancel on day one, straight after paying; access continues to the end of the month.** [CANCEL] gives the steps: "Cargo -> Profile -> Billing -> Cancel Plan … Step 2 Click Cancel. Step 3. A browser window will open, confirm your cancellation. This step must be taken in order to disable the next auto-renewal. If you skip this step, your subscription will continue to renew." And: "When you disable auto-renew (cancel), you'll retain access to the KitBash3D Library until your billing cycle is over. When your billing cycle ends, your subscription will automatically end." Also: "Subscription information is only within the Cargo application. You cannot manage your subscription on kitbash3d.com/account."
7. Finish every picture that uses KitBash parts before the renewal date shown in Cargo → Settings → Billing.
8. A refund is possible "within seven (7) days" of purchase only if not more than 10 assets were downloaded, once per calendar year [LIC §6.2.5].

---

## 2. Megascans on Fab

**Are Megascans free today? Per Quixel, yes; fab.com does not show it for every item yet.**
- Quixel, 5 Nov 2026 (https://quixel.com/news/update-megascans-are-going-free-again): "We're making the full Quixel Megascans library free on Fab."
- **No fab.com page states that the whole library is free.** Read today on fab.com: the 12 listings below each show "Free", with Personal and Professional both priced at 0. Other Quixel listings still carry a price:
  - "Smooth Concrete": Personal SGD 1.26 / Professional SGD 12.76 (https://www.fab.com/listings/7f276aab-d74e-44ae-bd25-4dcf75ae6267)
  - "Grass": SGD 5.09 (https://www.fab.com/listings/f7aae95d-da2a-4db1-b8dc-71742913f262)
  - "Wooden Crate": SGD 2.54 (https://www.fab.com/listings/c7461bce-dcd7-4b1c-8260-47cd45411236)
  
  Take only what shows "Free" when you click.

**Shortlist: 12 assets, each read today on fab.com as "Free", seller "Quixel Megascans"**

| # | Asset | Use in the colony | Size / texel density | Listing (renders) |
|---|---|---|---|---|
| 1 | Concrete Pavement (surface) | plaza, paths | 2×2 m, 4096 px/m | https://www.fab.com/listings/2d3cea49-1589-4f33-a4b2-a51836043593 |
| 2 | Grass With Concrete Slabs (surface) | Park paths, edges of the places | 4×2 m, 4096 px/m | https://www.fab.com/listings/54a5045f-5d2b-4a30-8918-5de5153e88f8 |
| 3 | Ground Gravel (surface) | site stage, verges | 2×2 m, 4096 px/m | https://www.fab.com/listings/5b295907-cbfa-4c47-8a2b-83f2fd828f17 |
| 4 | Ground Rubble (surface) | construction and damaged ground | 2×2 m, 4096 px/m | https://www.fab.com/listings/e1b6ae6e-4a9a-457f-b6e4-6a3815f9fbc6 |
| 5 | Concrete Rubble Pile (3D) | damaged stage, spoil heap | 2.23×2.67×0.23 m | https://www.fab.com/listings/f07637e3-5af8-436d-bb47-4552285e539e |
| 6 | Concrete Rubble Pack (3D) | scattered debris | 0.38×0.55×0.11 m | https://www.fab.com/listings/023f52ab-e085-45a2-bad5-56e60c216d5b |
| 7 | Concrete Debris (3D) | small debris scatter | 0.07×0.07×0.04 m | https://www.fab.com/listings/d8c67277-1b86-4bb3-8e93-41032880f3bc |
| 8 | Concrete Barrier (3D) | site fencing, Spaceport perimeter | 0.61×2.02×0.52 m | https://www.fab.com/listings/3428eb34-4e96-4a57-86af-2a73dedfe7b7 |
| 9 | Traffic Cone (3D) | construction stage | 0.35×0.35×0.69 m | https://www.fab.com/listings/af905a0b-5d43-4d1f-8623-6213daed84af |
| 10 | Industrial Junkyard Crate Metal (3D) | site crates, Spaceport cargo | 0.89×1.23×0.76 m | https://www.fab.com/listings/3e83258c-676f-48b0-860c-10f16e917684 |
| 11 | Concrete Plant Pot (3D) | modern planter, Hospital and hall forecourts | 1.08×1.08×0.71 m | https://www.fab.com/listings/04609c8a-f0e9-4ba1-864d-d3715eecd834 |
| 12 | Nordic Beach Boulder (3D) | rocks round the places | 1.36×1.81×1.16 m | https://www.fab.com/listings/3f7f7603-438d-498d-9418-157efc60219b |

Spares, also "Free" today: Worn Wooden Crate (https://www.fab.com/listings/72fcaca7-e319-4249-a513-ab222f73e466) and Rusty Bollard (https://www.fab.com/listings/b91bd1d9-a818-4da6-892a-4675808538ce). No free Megascans grass *plant*, bench or modern street furniture was found today. Poly Haven (CC0, already in use) covers grass.

### Heiko's steps: Megascans
1. Go to https://www.fab.com and click **Sign in**. Create an **Epic Games account** (email, or Google/Apple) and sign in. It is Heiko's own account, so he is the licensee.
2. **Licence.** Each listing above offers the **Fab Standard License**; the page data shows `"group": "standard"` with tiers "Personal" and "Professional", both 0 for these items. The binding text is the **Fab EULA at https://www.fab.com/eula**; read it there while signed in. Signed out, the page shows only the summary: "This summary … is not legally binding. … the full text of the Fab EULA below … is what is binding legally". Pick **Personal** if the owning entity's revenue in the last 12 months was not over $100,000 USD, otherwise **Professional**; for free items both cost 0 and "grant you the same scope of rights" (https://www.fab.com/eula). Accept it when asked. Then send us the EULA's clauses on distribution and on "extracting", and we quote them in the report.
3. Open each of the 12 listing links above. Check that it says **Free**, then click **Add to My Library**. This records the licence on his account, which is the proof if the price changes later.
4. Click **Download** on each one:
   - 3D props: choose **glTF**, or **FBX**; both import into Blender. The listings offer "fbx, glb, usdz, gltf".
   - Surfaces: the download is a texture set.
   - Take the highest texture quality offered; we downsize later.
5. Save each one in its own folder, `~/Art/megascans/<asset-name>/`, outside the repo and **never committed**. Only our renders ship.
6. Add one line per asset to `~/Art/megascans/LICENCE-NOTE.txt`: date, listing URL, tier chosen.
