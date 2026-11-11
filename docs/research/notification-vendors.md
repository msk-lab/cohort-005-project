# Knock vs Novu vs Courier for Cadence Notifications

Research for [#2](https://github.com/msk-lab/cohort-005-project/issues/2), part of map [#1](https://github.com/msk-lab/cohort-005-project/issues/1). Sources checked 2026-11-11 against vendor docs and pricing pages. Prices and plan limits change, so re-check them before signing up.

This note sets out facts only. The vendor decision belongs to [#4](https://github.com/msk-lab/cohort-005-project/issues/4).

## Summary

- **Knock is not ruled out.** It meets every hard criterion: a free tier, a React inbox (styled and headless), Postmark, and opt-out by channel through `channel_types`. Its weak points are cost and region:
  - **No EU data residency yet.** Knock's docs say they "expect to support EU data residency by the end of 2026". Every Knock subprocessor, including AWS hosting, is listed in the USA.
  - **Every channel counts as its own message.** One Notification sent to the inbox and by email is 2 messages, so the 10,000-message free tier covers about 5,000 dual-channel Notifications a month.
  - **The first paid plan is a big jump.** It goes from Free to Starter at **$250/month**. Free doesn't hard-cap usage; Knock contacts you to add billing.
  - **Free shows Knock branding** in the in-app feed.
- **Novu** is the cheapest to grow on: Pro is $30/month for 30k runs, and one run covers every channel. It is the only one with **EU residency on the free plan**. Its Free plan is the tightest: 5 workflows, 24-hour activity log, Novu branding, and a **hard stop at 10k runs** (HTTP 402) that is shared between Dev and Prod.
- **Courier** also counts a multi-channel send as 1 and charges $0.005 per send pay-as-you-go. It has an EU datacenter on any paid plan. Its preferences are built around **topics**, so a channel-only opt-out has to be modelled as one topic (or the same channel choice on every topic). It is the only vendor whose free-tier count includes **Test sends and sends blocked by preferences**.

## Comparison table

| Criterion | Knock | Novu | Courier |
| --- | --- | --- | --- |
| **Free tier** | Free: up to 10,000 messages/mo, unlimited environments, members and workflows, 30-day logs. No hard cap.[^k-price] | Free: 10,000 workflow runs/mo, 5 workflows, 2 environments (Dev+Prod), 3 members, 24h activity feed. **Hard stop** at the limit.[^n-price][^n-bill] | Developer: 10,000 sends/mo. Production, Test and custom environments (up to 20).[^c-price][^c-env] |
| **Dev/test use** | Sandbox mode renders messages without delivering and **does not count toward usage**, but it **does not support the in-app channel**. Built-in test email: 100/mo, to account members only.[^k-plans][^k-sandbox][^k-test] | Dev runs count toward the shared monthly total. Demo email provider: 300/mo, only to your own address.[^n-bill][^n-demo] | Sends from **every environment count, including Test**. Test comes with an email provider that only delivers to the signup address.[^c-bill][^c-env] |
| **What is billed** | 1 message = 1 user × 1 channel. Inbox + email = **2**. Steps skipped by preferences are not billed.[^k-plans] | 1 run = 1 workflow × 1 subscriber, **whatever the number of channels**.[^n-bill] | 1 send = 1 template × 1 recipient, **multi-channel = 1**. Sends blocked by preferences **still count**.[^c-bill] |
| **React inbox: prebuilt** | `@knocklabs/react`: `NotificationFeedPopover`, `NotificationFeed` (full page), `NotificationIconButton`.[^k-react] | `@novu/react` `<Inbox />` with bell, feed and built-in preferences view.[^n-inbox] | `@trycourier/courier-react` `CourierInbox` (inline or popup), toasts, preferences.[^c-react] |
| **React inbox: styling** | CSS variables (`--rnf-*`), full CSS replacement, `renderItem` and other props, light/dark.[^k-style] | `appearance` prop: `baseTheme`, `variables`, element-level overrides, render props for items.[^n-style] | Light/dark theming, replaceable render slots (list item, header, states).[^c-custom] |
| **React inbox: headless** | React hooks plus `@knocklabs/client`.[^k-react] | `useNotifications` and `useCounts` hooks, plus `@novu/js`.[^n-headless] | `useCourier()` hook / Courier JS SDK, "build your own UI".[^c-custom] |
| **Fit with React Router 7 / React 19** | Peer deps allow React 17–19. `next` and `@tanstack/react-router` are optional peers, with no React Router–specific guide.[^npm] | Peer deps allow React 18–19. The React quickstart uses React Router (`routerPush={(path) => navigate(path)}`).[^npm][^n-react] | Peer deps allow React ≥18. Docs say the Inbox "render[s] client-side only".[^npm][^c-react] |
| **Inbox auth** | Public key plus user token signed on the server (enhanced security).[^k-sec] | Subscriber HMAC hash for production.[^n-prod] | Backend-minted JWT (required since v8).[^c-auth] |
| **Postmark as email provider** | Yes: Postmark server API key and from address per environment. Delivery/bounce webhooks. Use the `MessageStream` override for non-`outbound` streams.[^k-postmark] | Yes: Postmark server API token and verified from address.[^n-postmark] | Yes: Postmark server API token. Overrides for `MessageStream` and attachments, or send with Postmark's own templates.[^c-postmark] |
| **Opt-out by channel (inbox vs email)** | **Native.** A `PreferenceSet` has a top-level `channel_types` (for example `{ "email": false, "in_app_feed": true }`). Per-workflow "Override recipient preferences" covers must-send emails. Prebuilt and headless React preference UI.[^k-prefs][^k-prefs-ov] | **Native.** Subscriber **global** channel preferences apply to every workflow. Workflows marked "critical" can't be opted out of. Preferences UI is inside `<Inbox />`, plus a `usePreferences` hook.[^n-prefs] | **Topic-based.** A user opts in/out per topic and can pick channels per topic (`custom_routing`: `email`, `inbox`, …). Topics can be `REQUIRED`. A channel-only opt-out has to be modelled as one topic, or the same choice repeated on every topic.[^c-prefs][^c-model] |
| **Price at small scale** | $0 up to 10k messages. Then **Starter $250/mo** for 50k, plus $0.005/message.[^k-price] | $0 up to 10k runs. Then **Pro from $30/mo** for 30k runs, plus $1.20 per 1k.[^n-price] | $0 up to 10k sends. Then **Business at $0.005/send**, pay-as-you-go (adding a card moves you to Business).[^c-price][^c-bill] |
| **EU data residency** | **Not yet.** "Expect to support EU data residency by the end of 2026." All subprocessors, including AWS, are in the USA.[^k-plans][^k-subp] | **Yes, on Free.** EU region (`eu.api.novu.co`, `wss://eu.socket.novu.co`). The region is fixed at signup.[^n-price][^n-auth] | **Yes, on paid plans** (Business/Enterprise). A separate EU (Ireland) datacenter and workspace.[^c-dc] |

## Price at Cadence's scale

Every Cadence Notification goes to both the inbox and email unless the person has opted out of a channel. Monthly cost at a few volumes, using the list prices above:

| Notifications/month (each to inbox + email) | Knock (messages) | Novu (runs) | Courier (sends) |
| --- | --- | --- | --- |
| 2,000 | 4,000 → **$0** | 2,000 → **$0** | 2,000 → **$0** |
| 5,000 | 10,000 → **$0** (at the cap) | 5,000 → **$0** | 5,000 → **$0** |
| 15,000 | 30,000 → **$250** (Starter) | 15,000 → **$30** (Pro) | 15,000 → **$25–$75**[^c-ambig] |
| 40,000 | 80,000 → **$400** ($250 + 30k × $0.005) | 40,000 → **$42** ($30 + 10k × $1.20/1k) | 40,000 → **$150–$200**[^c-ambig] |

Postmark is billed separately by Postmark under all three vendors.[^k-price][^c-bill]

All three are free at an early-stage volume. The gap opens once Cadence passes about 5k dual-channel Notifications a month. Knock costs the most from that point, because each channel counts separately and its first paid plan is $250.

## Things that matter for the Cadence spec

- **Tests and the `.outbox/` fallback.** None of the three vendors offers a local or offline mode. Tests that call the real vendor would add to usage on Courier (Test counts), on Novu (Dev counts, with a hard stop on Free), and on Knock for the in-app channel (sandbox doesn't cover in-app). If the existing pattern stays (the transport is swapped out in tests, see `app/lib/mailer.server.ts`), tests won't touch the vendor and this matters less.
- **Must-reach-email Notifications** (for example a Refund Request decision; still open in #1). Knock has "Override recipient preferences" per workflow, Novu has "critical" workflows, and Courier has `REQUIRED` topics.[^k-prefs-ov][^n-prefs][^c-prefs]
- **SSR.** Cadence renders on the server with React Router. Only Courier's docs say outright that the inbox renders client-side only. Assume the same for all three (they use browser websockets) and mount the inbox client-only. This was not checked in code.

## Sources

[^k-price]: Knock pricing, https://knock.app/pricing
[^k-plans]: Knock plans and usage (metering, sandbox not counted, EU residency roadmap callout), https://docs.knock.app/manage-your-account/knock-plans
[^k-sandbox]: Knock integrations overview, Sandbox mode ("supported across all channel types (except for in-app)"), https://docs.knock.app/integrations/overview#sandbox-mode
[^k-test]: Knock test email channel, https://docs.knock.app/integrations/email/knock-test
[^k-react]: Knock React overview, https://docs.knock.app/in-app-ui/react/overview, and Inbox, https://docs.knock.app/in-app-ui/react/inbox
[^k-style]: Knock feed styling, https://docs.knock.app/in-app-ui/feeds/styling
[^k-sec]: Knock security and authentication, https://docs.knock.app/in-app-ui/security-and-authentication
[^k-postmark]: Knock Postmark integration, https://docs.knock.app/integrations/email/postmark
[^k-prefs]: Knock preferences concept, https://docs.knock.app/concepts/preferences
[^k-prefs-ov]: Knock preferences overview (`channel_types`, workflow overrides), https://docs.knock.app/preferences/overview
[^k-subp]: Knock subprocessors, https://knock.app/legal/subprocessors
[^n-price]: Novu pricing, https://novu.co/pricing
[^n-bill]: Novu billing (workflow runs, environments share the total, Free stops at limit with 402), https://docs.novu.co/platform/account/billing
[^n-demo]: Novu demo integrations, https://docs.novu.co/platform/integrations/demo-integration
[^n-inbox]: Novu Inbox, https://docs.novu.co/platform/inbox
[^n-style]: Novu Inbox styling, https://docs.novu.co/platform/inbox/configuration/styling
[^n-headless]: Novu headless mode, https://docs.novu.co/platform/inbox/headless-mode
[^n-react]: Novu React quickstart, https://docs.novu.co/platform/quickstart/react
[^n-prod]: Novu prepare for production (HMAC), https://docs.novu.co/platform/inbox/prepare-for-production
[^n-postmark]: Novu Postmark integration, https://docs.novu.co/platform/integrations/email/postmark
[^n-prefs]: Novu preferences (global, per-workflow, critical workflows), https://docs.novu.co/platform/concepts/preferences
[^n-auth]: Novu API authentication (regional base URLs, region bound at signup), https://docs.novu.co/api-reference/authentication
[^c-price]: Courier pricing, https://www.courier.com/pricing
[^c-bill]: Courier billing (send counting, Test counts, preference-blocked counts), https://www.courier.com/docs/workspaces/billing
[^c-env]: Courier environments and API keys, https://www.courier.com/docs/workspaces/environments
[^c-react]: Courier React SDK (React 18+, client-side only), https://www.courier.com/docs/sdk-libraries/courier-react-web
[^c-custom]: Courier customize the inbox, https://www.courier.com/docs/in-app/customize-the-inbox, and build a custom inbox, https://www.courier.com/docs/in-app/build-a-custom-inbox
[^c-auth]: Courier authenticate users with a JWT, https://www.courier.com/docs/in-app/authenticate-users
[^c-postmark]: Courier Postmark integration, https://www.courier.com/docs/integrations/email/postmark
[^c-prefs]: Courier build a preference center, https://www.courier.com/docs/guides/build-a-preference-center
[^c-model]: Courier preferences model (topics, `custom_routing`), https://www.courier.com/docs/recipients/preferences/model
[^c-dc]: Courier regional datacenters (EU on every paid plan), https://www.courier.com/docs/workspaces/datacenters
[^c-ambig]: Courier's pricing page says "start free with 10,000 sends a month, then pay $0.005 per send", but its billing doc says Business is "$0.005 for every send". The lower figure assumes the first 10k stay free; the higher one assumes every send is billed. Confirm with Courier.
[^npm]: `npm view <pkg> peerDependencies` on 2026-11-11: `@knocklabs/react@0.15.1`, `@novu/react@3.19.2`, `@trycourier/courier-react@9.3.5`.
