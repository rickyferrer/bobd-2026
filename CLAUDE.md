# Best of Big D 2026: project handoff

This file is read automatically by every Claude Code session in this repo.

## Who and what

Ricky Ferrer is VP Digital Product at D Magazine. He is building the interactive "deck of cards" feature for **The Best of Big D 2026**: 180 winners in four suits (spades Culture, hearts Food & Dining, diamonds Shopping & Services, clubs Drinks & Nightlife). The launch event is Dec 3, 2026 at Astoria Event Venue. The page publishes around Nov 30.

**The GitHub repo is the source of truth:** `rickyferrer/bobd-2026` (branch `main`). Vercel deploys it automatically on every push, to `bobd-2026.vercel.app` (team "D Magazine", **Hobby plan**). The earlier Claude Design canvas artifact is retired and out of date.

## How Ricky likes to work

- Ask brief clarifying questions. State uncertainty explicitly, and say what you tested versus what you only assume.
- Short, direct answers. He answers questions like "do you have the HubSpot GUID yet?" one at a time.
- He wants changes pushed to GitHub directly. In older sessions the push was blocked, so he uploaded files by hand. If the repo is a source of the session, commit and push yourself. End commits with the attribution lines the session reminder gives.

## Files in the repo

| Path | What it is |
|---|---|
| `index.html` | The whole page. A Design Component (`<x-dc>`, `{{holes}}`, `<sc-for>`, `<sc-if>`, a `Component extends DCLogic` class with `state`, `setState` and `renderVals()`). CSS lives in the `<helmet>` block. |
| `support.js` | The DC runtime (React bundled). **Do not edit.** |
| `data/winners.json` | 180 winners. Fields: `id, s (suit S/H/D/C), c (category), n (name, ALL CAPS), b (blurb), a (address), u, l (link), img, v (video), rv/rl (review url/label), st/sl (story text/url), it (kind: card/photo)`. Photo card = `img` set. |
| `assets/fonts` | Trial files for Tungsten Comp, Tungsten Cond (Medium) and Futura Std. |
| `assets/pips`, `assets/photos`, `assets/img` | Suit pips, 29 local photos, cover and hero images. |
| `vercel.json` | `X-Robots-Tag: noindex, nofollow` until launch, immutable cache on `/assets`, 5-minute cache on `/data`, clean URLs. |
| `README.md` | Deploy steps, HubSpot table, go-live checklist, ads notes. |

86 of the photo cards point at WordPress-hosted images on `assets.dmagstatic.com` (they load fine in a normal browser; the cloud sandbox cannot reach that host). 29 are local.

## Decisions already made (do not redo)

**Fonts**
- Blackest: Adobe Fonts kit `<link rel="stylesheet" href="https://use.typekit.net/swa3yco.css">`. Families `blackest` and `blackest-text`, weights 400 and 700. The kit must list every domain the page runs on.
- Card titles on card faces: **Tungsten Condensed Medium** (`'Tungsten Cond'`, weight 500, `assets/fonts/TungstenCond-Medium.otf`), letter-spacing 0, title case. This replaced Futura Std at Ricky's request (Nov 18). Sizes are container-query based (`cqw`): front `min(36px,13cqw)`, plate `min(31px,10.9cqw)`, back `min(36px,13cqw)`, line-height 1.05, with `fitNames()` shrinking long names. The ~1.3x scale-up over the old Futura sizes was a guess. A sandbox screenshot (desktop and 390px phone) confirmed the font loads and renders with no overflow, but the titles read a little small next to the old Futura, so a further bump of roughly 1.2x is likely; Ricky has not yet judged it. The phone override `.back .nm{font-size:15px}` was left as it was and may look small.
- Wild Cards: eyebrow "WILD CARD" in Futura Std 700, 11px, uppercase, .18em tracking (same as the category labels). Title in `'Tungsten XComp','Tungsten Comp'`, 700, 46px (40px on phones). **No Tungsten XComp file exists yet.** The `@font-face` expects `assets/fonts/TungstenXComp-Bold.otf` and falls back to Tungsten Comp until it is added.
- Popup headline and list-view titles still use Blackest.
- All Tungsten Comp, Tungsten Cond, Futura Std and XComp files are presumed **trial fonts and need licensed web versions before launch.** (Licence status of the Cond Medium file is unconfirmed.)

**Title case:** `it.n` stays ALL CAPS in the data because `REVIEWS[it.n]`, `STORIES[it.n]` and search key on it. The display name is `it.dn` (also `it.nt`), built in `prep()` by `NAME_FIX[it.n] || niceName(it.n)`. Edit the `KEEP` (acronyms), `SMALL` (small words) and `NAME_FIX` (exceptions) tables when a name looks wrong. Unconfirmed: "Harky.Diml", and whether DAQ, CNTRD, CLO9UD and OK2BX should stay as styled.

**Wild Cards:** inserted into the card list at positions 7 and 17 when browsing (not while searching). The first is the newsletter signup joker; the second promotes the December issue cover.

**Ads (Google Ad Manager):**
- Network `23367196308`, unit `/23367196308/MissEllie_horizontal`, size 970x250 only. Constants `AD_UNIT` and `AD_EVERY = 36` sit just above `var PARTY` in the script.
- One slot after every **36 cards, Wild Cards counted** so grid rows end full (36 divides evenly by 2, 3 and 4 columns). On phones a Wild Card counts as 2 because it spans both columns. None after the last card. Same rule in Cards and List view. The full deck gets 5 ads.
- GPT loads once (reusing any existing `gpt.js`), `enableServices()` runs once, slots request only within about 800px of the viewport (IntersectionObserver), and slots are destroyed when React removes them (filter, search, view change). No fill hides the whole block, "Advertisement" label included. If an ad blocker stops `gpt.js`, the page adds `ads-off` to `<html>` and hides the blocks.
- Placement is data-driven in `renderVals()` through `withAds()`. Ad items have `isAd: true` and a `slot slot-ad` class. The templates handle them with an `<sc-if value="{{c.isAd}}">`.
- Open question: `MissEllie_horizontal` sounds like another property's ad unit. Confirm in Ad Manager that a line item targets this domain, or it will not fill. Check live with `?googfc`. Ads never fill in previews.

**Newsletter signup (HubSpot Forms API v3):** portal `477347`. Posts to `https://api.hsforms.com/submissions/v3/integration/submit/{portal}/{formGuid}`, success only on HTTP 200, with a honeypot and `dataLayer` events `bobd_newsletter_signup` / `bobd_newsletter_error`. The tab maps to a contact property set to `true`: all (Full deck) = `receive_frontburner_daily_recap`, Culture = `receive_things_to_do`, Food = `receive_sidedish`, Drinks = `receive_sidedish`, Shopping = `receive_home`. One HubSpot form with an email field plus the 4 hidden property fields (blank defaults) is enough. **`HS_FORM` in `index.html` is still empty**, so the signup fakes success and logs a console warning. Unknown: how the API treats properties not on the form, and whether omitted fields leave existing values alone. Test each tab with a real email and check the contact record.

## Open items

1. **HubSpot form GUID** from Ricky, then set `HS_FORM` and test every tab.
2. **Make the repo private.** It was public at last check.
3. **Vercel Hobby plan** is for non-commercial use. A promo page with ads is commercial, so move to a paid plan or another host before launch.
4. **Licensed web fonts** for Tungsten Comp, Tungsten Cond, Futura Std and Tungsten XComp; add the XComp file.
5. **Go-live SEO:** remove the `noindex` header in `vercel.json`, add the SEO snippet (`#bobd-seo`), exactly one `h1`, proofread data. The old SEO snippet and data JSON were generated before the review links and 115 photos were added and are stale; regenerate if needed.
6. **Content gaps:** the event calendar entry is all-day (add a start time), the consent line under the signup was asked about and never answered, the editor intro is a draft ("DRAFT INTRO – EDITORS TO REVISE" tag), the video embeds are placeholders.
7. **Check the 115-photo density on a phone** (it looked fine on desktop), and the crop of wide archive photos on tall cards.
8. **Tune the Tungsten Cond card title sizes** after Ricky looks at them (front, plate and back; the back of the card was not screenshotted).

## Gotchas and how to test

- Run it locally with `python3 -m http.server` from the repo root and open it in Playwright (Chromium is preinstalled in the cloud sandbox). Block `dmagstatic`, `typekit` and `fonts.g` requests so the test is not slow, or expect broken images. In a cloud session the permission classifier has blocked this setup before; if it does, stop and ask rather than working around it.
- The Typekit CSS is unreachable from the sandbox. Read it in the user's Chrome if you need it.
- To test ads without the network, stub `window.googletag` before load (`addInitScript`) with `cmd.push(f)=>f()`, `defineSlot`, `display`, `destroySlots`, `pubads()`, `enableServices`, `setConfig`, and route `securepubads` to an empty JS file so `ads-off` does not trigger.
- The party-ticket popup opens on scroll and covers clicks. In tests, remove `.promo` or click through `evaluate(e => e.click())`.
- The page has a `MutationObserver` on `document.body` (`watchFit`) that reruns `fitNames()`, `fitBlurbs()` and `syncAds()` after DOM changes. There is a duplicate `componentWillUnmount` (the later one wins); harmless since the page never unmounts.
- Breakpoint for phones is 600px (grid is 2 columns, Wild Cards span both). Desktop grid is `auto-fill, minmax(250px, 1fr)` in a 1216px container (4 columns at full width).
- Do not hotlink images inside the old Design canvas; its CSP blocks them. This is no longer an issue on Vercel.

## Tools that worked in earlier sessions

- Vercel connector: can list teams and projects, but returned 403 on creating projects and listing deployments. Use the Vercel dashboard (inspect via Chrome) for deployment status.
- GitHub from a cloud session: pushes only work if the repo was chosen as the session's source when it started. Account-level GitHub settings alone do not grant it.
