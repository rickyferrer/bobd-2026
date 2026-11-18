# The Best of Big D 2026: the deck

Interactive deck of 180 winners (four suits). Static site, no build step.

## Files

- `index.html`: the whole page (markup, CSS, and the `DCLogic` component at the bottom). It is written in the Design Component format: `{{holes}}`, `<sc-if>`, `<sc-for>`. Edit this file directly.
- `support.js`: the Design Component runtime (React bundled in). **Do not edit.** Keep the `<script src="./support.js">` line in `index.html` exactly as is.
- `data/winners.json`: the 180 winners. Fields: `s` suit (S/H/D/C), `c` category, `n` name, `b` blurb, `a` address, `u`/`l` link text and URL, `img` photo URL (full-bleed photo card when set), `v` video flag, `rv`/`rl` review button, `st`/`sl` related story.
- `assets/`: fonts, suit pips, hero fan images, and the 29 original photo-shoot images.
- `vercel.json`: headers. **Sends `X-Robots-Tag: noindex` until launch; remove that header at go-live.**

Most card photos (86) point at the WordPress media library (`assets.dmagstatic.com`), so they load straight from there.

## Deploy

Push to the production branch; Vercel deploys on every push. There is nothing to build (framework preset: Other, no build command, output directory = repo root).

## HubSpot newsletter signup

`HS_PORTAL` and `HS_FORM` (form GUID) are set near the top of the script in `index.html`. Active deck tab → contact property:

| Tab | Property set to `true` |
|---|---|
| All | `receive_frontburner_daily_recap` |
| Culture | `receive_things_to_do` |
| Food & Dining | `receive_sidedish` |
| Drinks & Nightlife | `receive_sidedish` |
| Shopping & Services | `receive_home` |

All four properties must exist as fields on the HubSpot form.

## Go-live checklist

- Host `data/winners.json` on WordPress (or keep it here) and confirm `DATA_URL` in `index.html`.
- If the deck is injected into WordPress, render the SEO snippet (`bobd-2026-seo-snippet.html`) server-side inside `#bobd-seo` with the real page URL. One `h1` on the page, title and meta description in Yoast.
- Blackest now loads from the Adobe Fonts kit (swa3yco); make sure the kit lists every domain this runs on. Replace the remaining trial fonts (Tungsten Comp, Futura Std) with licensed web fonts before this is public. Trial licenses usually don't allow public hosting.
- Draft copy (intro, methodology) is marked for editors to revise.
- Proofread winner data and title-cased names. Video embeds for DJ Alaska and Zachary J. Willis are placeholders.
- Remove the `noindex` header in `vercel.json`.

## Ads (Google Ad Manager)

- Network `23367196308`, unit `/23367196308/MissEllie_horizontal`, size 970x250 only (constants `AD_UNIT`, `AD_EVERY` near the top of the script in `index.html`).
- One slot after every 36 grid cells (`AD_EVERY`). The two Wild Cards count (1 cell each; 2 on phones, where they span both columns), so the rows before an ad always end full. None after the last card. Same rule in Cards and List view, so the full deck gets 4 ads.
- GPT loads once (reuses the page's GPT if one exists), `enableServices()` runs once, and each slot is requested only when it is within ~800px of the viewport. Slots are destroyed when filtering, searching or switching views removes them.
- No fill hides the whole ad block, label included. If an ad blocker stops `gpt.js`, the page adds `ads-off` to `<html>` and the blocks disappear.
- Check it live with no ad blocker and add `?googfc` to the URL for Google's debug panel. Ads do not fill in previews.
