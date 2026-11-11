# How Knock identifies recipients, secures the feed, holds templates and handles failures

Research for [#7](https://github.com/msk-lab/cohort-005-project/issues/7), part of map [#1](https://github.com/msk-lab/cohort-005-project/issues/1). Sources checked 2026-11-11 against Knock's docs (`docs.knock.app`, including the raw `.md` pages and `llms-full.txt`) and the source of Knock's SDKs on GitHub. At the time of checking, the latest versions were `@knocklabs/react` 0.15.1 and `@knocklabs/node` 1.41.1.

This note sets out facts only. Cadence's decisions belong to [#8](https://github.com/msk-lab/cohort-005-project/issues/8), [#9](https://github.com/msk-lab/cohort-005-project/issues/9) and [#10](https://github.com/msk-lab/cohort-005-project/issues/10). Where a fact makes an option possible or rules one out, the note says so under **Options**. The vendor comparison is on branch `research/notification-vendors` (`docs/research/notification-vendors.md`) and isn't repeated here.

## Summary

1. **Recipients.** `id` is the only required field. Every way of identifying a recipient is an upsert that merges into existing data. You can identify ahead of time with `PUT /v1/users/{id}`, or inline by passing full user objects as `recipients` or `actor` when you trigger a workflow. Knock "guarantees that recipients are identified before executing any other action". To get email, a recipient needs an `email` property.
2. **Feed security.** The browser uses the **public** key. Enhanced security mode is off by default and Knock says to turn it on for production. With it on, every client request also needs a user token: a JWT signed on the server with RS256 that has `sub` = the user id. `signUserToken` defaults to an expiry of 3600 s. Knock advises matching the token's expiry to the session. `KnockProvider` re-authenticates in place when `user.id` or `userToken` changes. `KnockFeedProvider` is keyed on the user id, so it remounts. The bare `useNotifications` hook is **not** keyed on the user.
3. **Templates.** Templates live inside Knock workflows, one per channel step, and are written in Liquid. Code sends only `data` with the trigger. Workflows, layouts, partials and translations are version-controlled inside Knock through commits and promotion. The Knock CLI (`knock pull` / `knock push --commit`, `knock commit promote`) and the Management API can mirror them into a `.knock/` folder in git. The Postmark channel is set up per environment in the dashboard: API key, from address, optional webhook for delivery status. Knock sends through Postmark's default `outbound` stream unless you set an override.
4. **Environments.** A new account has **production only**. "Enable environments" adds development, can't be undone, and makes development the default for the CLI and Management API. Users, messages and logs are separate per environment. Each environment has its own API keys and channel credentials. Knock has **no local or offline mode**. Sandbox mode (per channel, per test run, or `settings.sandbox_mode` on a trigger) renders messages without delivering them and isn't billed, but **in-app isn't supported**.
5. **Failures.** `POST /v1/workflows/{key}/trigger` is in rate-limit tier 5 (1,000 req/s) and returns `200 {workflow_run_id}`. The run itself is asynchronous. `Idempotency-Key` (up to 255 chars, 24 h window, only successful responses cached) works on the trigger endpoint only. The Node SDK has a 60 s timeout, makes 2 automatic retries (connection errors, 408, 409, 429, 5xx) and sends an auto-generated idempotency key that stays the same across its own retries. Once a run is accepted, Knock retries delivery to Postmark up to 8 times over 30 minutes. **No Knock doc found says what to do when Knock's own API is down.**

---

## 1. Identifying recipients

**Three methods, all upserts.**[^identify]

- **Direct:** `PUT /v1/users/{user_id}` upserts one user.
- **Inline:** recipient data travels in other server-side requests (workflow trigger, schedules, subscriptions). `KnockProvider` can also do it client-side.
- **Bulk:** `POST /v1/users/bulk/identify`.
- "All identification methods in Knock use an upsert approach. This means any existing data for a recipient is merged during the upsert operation."[^identify]

**Required fields.**

- "We recommend using your internal user identifier for the `id` value, which is the only required property."[^identify]
- Reserved properties: `name`, `email`, `avatar`, `locale`, `phone_number`, `timezone`.[^identify] All custom properties together are capped at 256 kB.[^identify]
- Email steps need an email address: "In order to send an email notification you'll need a valid `email` property set on your recipient."[^postmark]

**Inline identification on trigger.**

- "When using inline identification, Knock guarantees that recipients are identified before executing any other action. This enables lazy recipient creation within Knock".[^identify]
- `recipients` (and `actor`) can be full objects (`{ id, name, email, … }`). Knock identifies each one before the workflow runs for them.[^trigger-guide]
- Passing bare id strings (`["user-123"]`) references users but doesn't identify them. In that case the users must already exist in Knock with an `email` for the email step to send.[^identify]
- One trigger call takes up to 1,000 recipients and a `data` payload of up to 10 MB.[^trigger-guide]

**When Knock suggests identifying.** Identify when "new recipients sign up for your product" and when relevant data such as `name` or `email` changes. You can do it from a deferred backend job, or send the full recipient data with every trigger.[^identify] Production users must be identified into the production environment, because users are separate per environment.[^impl][^envs]

**Client-side identification.**

- By default, `KnockProvider` upserts the `user` object it's given when it mounts (`identificationStrategy` defaults to `inline`). `"skip"` turns this off.[^provider]
- Knock's guidance: "Client-side identification should only be used with your **public API key** … For more sensitive operations or when you need to set extensive user properties, use server-side identification methods."[^identify]

**Options.**

- **Identify on trigger only.** Cadence passes `{ id, name, email }` for each recipient on every trigger and never calls identify separately. Recipients are always current and there's no separate sync step. This doesn't cover a user who opens the inbox before they've ever been notified. `KnockProvider`'s inline identify (on by default) creates that user from `{ id }`, which is enough for an empty feed.
- **Identify on sign-up and on profile change, then trigger by id.** This adds identify calls in the auth and profile code paths. Users that already exist need a bulk identify once, with the per-environment split in mind.
- The `id` can be Cadence's numeric `users.id` as a string. Knock only asks that it is your internal identifier.

## 2. Securing the in-app feed for the headless React hooks

**Keys.** Knock uses a secret key on the backend and a public key on the client.[^security] With the public key, the client can only reach a fixed set of endpoints: reading and updating the user, preferences, channel data, the feed list (`GET /v1/users/:id/feeds/:channel_id`) and message status changes.[^security]

**Enhanced security mode.**

- "Enhanced security mode is off by default … While it's off, you can use your public key to authenticate all users … Knock will not reject requests that do not include a signed user token."[^security]
- "Without enhanced security mode, a request with your public key can act as any user. Enable it before you release your in-app feed to your users." Knock suggests enabling environments and keeping it off in development.[^security]
- You turn it on per environment. The signing key is under **Platform > API keys** in the production environment.[^impl]

**Signing the user token on the server.**[^security][^node]

- The dashboard shows the signing key **once** (as base-64 PEM or PEM). By convention it goes in `KNOCK_SIGNING_KEY`, which is where the SDK looks by default.
- The token is a JWT signed with **RS256**. `sub` is required, and Knock recommends `iat` and `exp`.
- `signUserToken(userId, { signingKey?, expiresInSeconds? })` is exported from `@knocklabs/node`. Its default expiry is **3600 s**. It signs locally, without a network call ("you can generate the authentication token out-of-band without an additional network request").
- Knock's suggestion for getting the token to the browser: "passing it down as a serialized property on the user or passing in a cookie." In React Router terms, that maps to returning it from a loader.
- **Grants** can narrow a token, for example to `user/feed_read` and `user/feed_write` only, using `explicit_grants: true`. Without that option, the token can reach every user-scoped resource.[^security]
- `@knocklabs/node` uses `jose`. The current `jose` is ESM-only, so CommonJS projects may need to pin it to v5.[^node] (Cadence is ESM, so this probably doesn't apply. Not checked.)

**Expiry and refresh.**

- "Generally, it's advisable to set the token expiration to be equal to your session token expiration … Otherwise … opt for a relatively short-lived expiration time … and refresh them from your backend before the expiration window."[^security]
- `KnockProvider` accepts `onUserTokenExpiring(oldToken) => Promise<string | void>` and `timeBeforeExpirationInMs`, which defaults to **30 s** before expiry. If the callback returns a string, that string becomes the new token.[^react-types][^provider-src]
- "At any time your application can call the `authenticate` method again with an updated user token and the connection to the Knock real-time service will be restarted."[^security]
- What happens to a request sent after the token has expired isn't documented. The SDK source comment says a missing or late token "fires 401s".[^authclient-src]

**Rate limits for tokens.** For requests authorised with a user token, rate limits apply per environment **and per signing user**.[^ratelimits]

**When the DevUI switches user mid-session.**

- In Cadence, switching user means posting `/api/switch-user`. That sets the `userId` cookie and redirects with React Router (`app/routes/api.switch-user.ts`). This is a client-side navigation, not a full page load, so the React tree, and any `KnockProvider` in it, stays mounted. After revalidation, the loaders return the new user. The session cookie has no `maxAge` (`app/lib/session.ts`).
- What Knock's React SDK does when `user.id` / `userToken` props change, read from `useAuthenticatedKnockClient`, which `KnockProvider` uses:[^authclient-src]
  - If the client is already authenticated and the userId or token changes, it **re-authenticates the same client in place** ("A userId change still remounts the feed subtree downstream because `feedProviderKey` includes the userId").
  - `enabled: false` tears the client down and creates a fresh, empty, signed-out client ("no stale notifications/PII linger after a logout").
- **`KnockFeedProvider` is keyed on `knock.userId`**, so on a user change its subtree remounts and refetches.[^feedprovider-src]
- **The bare `useNotifications(knock, channelId)` hook is not keyed on the user.** It only re-creates its feed client when the channel id or options change, or when the client has been disposed. Because the knock client object stays the same during an in-place re-auth, a headless inbox built only on `useNotifications` + `useNotificationStore` gets no remount from the SDK on a user switch.[^usenotifications-src] (Read from source, not tested in a running app.)
- Knock's documented gate is `enabled={Boolean(userId && userToken)}`. Knock recommends it "rather than mounting and unmounting `KnockProvider` as that identity changes", and says "Feed components remount and reload their data when `enabled` becomes `true`."[^provider] The `useKnockAuthState(knock)` hook re-renders on a user change, "even when the client is re-authenticated in place".[^authstate]

**Options.**

- **Enhanced security on in every environment** (Knock suggests leaving it off in development). The loader for the signed-in layout signs a token on each request. The DevUI switch is then just "new `user` + new `userToken` props".
- **Enhanced security off in development, on in production.** This is simpler locally, but development stops exercising the token path.
- **Token lifetime.** Cadence's session cookie has no fixed expiry, so "match the session" has no number to copy. The options are a short TTL with `onUserTokenExpiring` (this needs a small endpoint that returns a fresh token) or re-signing on every loader run, with a TTL longer than a typical page stay.
- **Making a user switch reset the inbox.** The options are wrapping the inbox in `KnockFeedProvider` (keyed on userId by Knock), putting a React `key={userId}` on the inbox subtree, or watching `useKnockAuthState`. Doing none of these leaves a risk that a headless `useNotifications` keeps the previous user's items.
- **SSR.** The feed uses browser websockets, so the inbox can't render real data on the server. Mounting it client-side only is the safe assumption. Knock's React examples use `"use client"`, and its docs say nothing about SSR.

## 3. Where templates live, version control, and the Postmark channel

**Templates live in Knock, inside workflows.**

- "Workflows in Knock serve as containers for all of the logic and message templates associated with a given notification".[^impl]
- Each channel step (email, in-app feed) has its own template, written in Liquid. The trigger's `data` fills the variables.[^trigger-guide]
- Templates can also pull recipient, actor, tenant and object data from Knock itself at render time, using Liquid filters, "without needing to manually pass the data in the `data` argument".[^refdata]
- The API sends the **last committed** version of a workflow. The dashboard test runner uses the last *saved* version.[^testing]

**Version-controlled content inside Knock.**

- Workflows, guides, layouts, partials, translations and reusable requests are versioned with commits and can be rolled back.[^envs]
- Content "can only be edited in the environment in which it was created" and is promoted upwards through environments.[^envs]
- After enabling environments, the "Modify resources in any environment" permission (on by default) can be turned off. That makes every environment other than development read-only.[^envs]
- Recipient data isn't versioned.[^vc]

**Into git with the CLI or Management API.**

- The Knock CLI can pull and push workflows, layouts, partials, translations, message types, guides and more. `knock push` takes `--environment` (defaults to the account's default environment), `--branch`, `--commit`, `-m` and `--knock-dir`.[^cli][^cli-push]
- On disk, each workflow is a folder named after its key. It holds `workflow.json` plus one folder per channel step, for example `email_1/visual_blocks.json` and `in_app_feed_1/markdown_body.md`. `knock workflow push --all` uploads them.[^cli-files]
- Knock's CI/CD tutorial maps git branches to Knock branches. A pushed `.knock/` directory syncs to the Knock branch. On merge, it runs `knock branch merge` into development, then `knock commit promote --to=staging`, then `--to=production`. CI authenticates with a `KNOCK_SERVICE_TOKEN` service token created under Settings > Service tokens.[^cicd]
- The Management API (Node SDK `knock-mgmt-node`) can create and update workflows and their templates, layouts, translations and partials. It can also commit and promote. "If you've enabled environments, requests that omit the `environment` query parameter use your development environment."[^mapi]

**Postmark channel.**[^postmark]

- You create the channel once under **Channels and sources** and configure it **per environment**.
- Settings: **API key** (the Postmark server token), **From email address** (Liquid allowed), and **Incoming webhook** (delivery status from Postmark).
- Advanced: **Sandbox mode**, Knock and Postmark open/link tracking, CSS inlining (on by default).
- Overrides: From name, Reply-to, and payload overrides.
- "Knock does not target a specific `MessageStream`", so Postmark uses `outbound`. That matches what `app/lib/mailer.server.ts` sends today. A payload override can target another stream.
- With the webhook on: Delivery → `delivered`, Bounce → `bounced`. A spam complaint doesn't change the status, but Postmark deactivates the address, so later sends bounce.
- Each environment can point at its own Postmark server or token, or run in sandbox with no credentials at all ("you can save an environment's configuration in sandbox mode without provider credentials").[^integrations]

**Options.**

- **Dashboard-authored workflows.** Fastest to start, but templates live outside the Cadence repo.
- **`.knock/` folder in the repo, pushed by the CLI from CI.** Templates get reviewed in PRs next to the trigger code that supplies `data`. This needs a service token in CI and, for promotion, environments enabled.
- **Dashboard plus `knock pull` snapshots.** A middle path: git holds a copy, but the dashboard stays the source of truth.
- Whatever Cadence picks, the email copy currently in `mailer.server.ts` callers would move into Knock templates. Code would pass only `data`.

## 4. Environments, and keeping tests from sending

**Environment model.**[^envs]

- "Your Knock account starts with a single environment: production. Enabling environments adds a development environment".
- Enabling requires the owner or admin role and **can't be turned off**. Development starts empty apart from the `default` email layout. **Development becomes the default environment** for the CLI and Management API.
- More environments (for example staging) can be added after that, but the order can't be changed later. Knock branches give each developer an isolated copy.[^envs]
- Kept separate per environment and **never shared**: users, audiences, tenants, objects, messages, analytics, logs, events, broadcasts.
- "Each environment has its own set of API keys". Channel provider settings, overrides and conditions are also set per environment.[^envs][^integrations]
- Go-live checklist: point the app's API keys at production, promote all content, generate the signing key and turn on enhanced security in production.[^impl]

**Not sending for real.**

- Knock has **no local, offline or mock mode**. Every call goes to `api.knock.app` (or a custom `host`).
- **Sandbox mode:** "Knock will never send the request to your downstream provider, blocking all delivery." Messages are still rendered and previewable. "Sandboxed messages … do not count toward usage." It can be set per channel per environment, per test run in the dashboard, or per API trigger with `settings.sandbox_mode` (plus `settings.skip_delay`).[^integrations][^plans][^testing]
- **Caveat: in-app isn't supported.** "Sandbox mode is supported across all channel types (except for in-app)".[^integrations] Triggers in a development environment still write real feed messages, which count toward usage.
- **Channel conditions** can limit delivery per environment, for example to your own domain. Unlike sandbox, messages that pass the condition "may contribute to usage".[^plans]
- The **Knock test email channel** sends 100 emails a month, and only to members of the Knock account (anyone else gets `knock_recipient_not_allowed`). It isn't meant for production.[^knock-test]
- Rate limits are per environment, so a test suite hammering development doesn't use up production's limits.[^ratelimits]

**Cadence's current pattern** (`app/lib/mailer.server.ts`): a `MailTransport` interface. Postmark is used when `POSTMARK_SERVER_TOKEN` is set. Otherwise each email is written as JSON to `.outbox/`. Tests inject a transport.

**Options.**

- **Don't call Knock in tests.** Put Knock behind a small interface, like `MailTransport`, and inject a recording fake. This costs nothing, works offline, and covers both email and in-app. It doesn't exercise Knock's rendering.
- **Missing key in local dev → fall back to a local notifier.** This mirrors today's no-token → `.outbox/` behaviour, but the inbox would have no real data locally.
- **Real calls to a development environment with sandboxed channels or `settings.sandbox_mode`.** This exercises the real API. Email isn't delivered or billed. In-app messages are still created and counted, and the tests need network access and a key.
- **Enabling environments** is a one-way account change. It also moves the CLI and Management API default to development.

## 5. Trigger failure behaviour

**The trigger call.**

- `POST /v1/workflows/{key}/trigger` returns `200` with `{ "workflow_run_id": "<uuid>" }`. "All workflow runs are executed asynchronously."[^trigger-api]
- So a successful response means the run was accepted, not that anything was delivered.
- An inactive workflow returns a `workflow_inactive` error and runs nothing.[^trigger-overview]

**Errors.**

- Errors are standard HTTP codes with the JSON body `{ code, message, status, type }`. Knock says to branch on `code` and not to match on `message`.[^errors]
- The Node SDK throws `APIError` subclasses: `BadRequestError` 400, `AuthenticationError` 401, `PermissionDeniedError` 403, `NotFoundError` 404, `UnprocessableEntityError` 422, `RateLimitError` 429, `InternalServerError` ≥500, and `APIConnectionError` / `APIConnectionTimeoutError` when there's no response.[^node]

**Timeouts and SDK retries (`@knocklabs/node`).**[^node]

- "Requests time out after 1 minute by default". You can set `timeout` per client or per request.
- "Certain errors will be automatically retried 2 times by default, with a short exponential backoff": connection errors, 408, 409, 429 and ≥500. Timeouts are retried too. `maxRetries` (default 2) changes this.
- So with the defaults, one failing `trigger` call can block for several minutes before it throws. That matters if the call sits inline in a React Router action.

**Idempotency.**[^idempotency][^trigger-guide]

- Header `Idempotency-Key`, a string of up to 255 characters. "Only `POST /workflows/:key/trigger` accepts the `Idempotency-Key` header".
- A retry with the same key "within 24 hours" returns the original response, with `idempotent-replayed: true`. If the parameters differ from the original, you get an error.
- "Knock only caches successful responses (`2xx`)". A 4xx or 5xx isn't stored, so retrying it runs again.
- From the SDK source: on every non-GET request the Node SDK adds an `Idempotency-Key` automatically (`stainless-node-retry-<uuid>`) and keeps it for that call's own retries. You can pass your own with the `idempotencyKey` request option. A **new** call, for example a retry from a background job, gets a new random key unless the app passes a stable one (for example derived from the Refund Request id and event).[^node-src]

**Rate limits.**[^ratelimits][^trigger-api]

- Limits are per endpoint, in tiers: Tier 1 is 1 req/s, Tier 2 is 5, Tier 3 is 60, Tier 4 is 200 and Tier 5 is 1,000. The trigger endpoint is **tier 5, 1,000 requests/second**, far above anything Cadence's eight Notification kinds would send.
- Over the limit, you get `429 Too Many Requests`, which the SDK retries. No `Retry-After` header is documented.
- Limits apply per environment, and also per signing user for user-token requests.

**After acceptance (Knock → Postmark).**[^delivering]

- Knock retries delivery to the provider on network errors, retryable provider errors and its own transient errors, "up to **8 times over a 30-minute window**, utilizing an exponential back-off strategy with jitter".
- Message statuses move through `queued` → `delivery_attempted` → `delivered`, or end at `bounced` / `undelivered` (no more retries).
- An `undelivered` message can be retried by hand from the dashboard.

**When Knock's API is unavailable.**

- Neither the docs nor `llms-full.txt` contain a recommendation for this case: no queueing, fallback or circuit-breaker advice. The only related guidance is the idempotency key ("safely retry requests without creating duplicate workflow runs")[^trigger-guide] and the SDK's built-in retries.
- Knock publishes incidents at `status.knock.app`.

**Options.**

- **Inline trigger in the action.** Simplest. A Knock outage or timeout then either blocks or fails the Refund action, unless the trigger is wrapped (short `timeout`, low `maxRetries`, catch and log).
- **Fire-and-forget after the DB write.** The action never fails because of Knock. A failure is only logged, so that Notification is lost.
- **Outbox table plus a retry worker,** with a stable `Idempotency-Key` per Notification. This survives outages longer than the SDK's retries and the 24 h window covers re-sends. It costs a new table and a background process, which Cadence doesn't have today.
- Since the trigger is asynchronous, none of these options tell the action whether the email was delivered. Delivery status is only visible afterwards, in Knock or through its webhooks.

---

## Sources

[^identify]: Identifying recipients, https://docs.knock.app/managing-recipients/identifying-recipients
[^trigger-guide]: Trigger workflows via API (recipients, idempotency, limits), https://docs.knock.app/send-notifications/triggering-workflows/api
[^trigger-overview]: Triggering workflows overview, https://docs.knock.app/send-notifications/triggering-workflows/overview
[^trigger-api]: API reference, Trigger workflow (rate limit tier 5, 200 response, async), https://docs.knock.app/api-reference/workflows/trigger
[^security]: Security and authentication (public key endpoints, enhanced security, signing, grants, expiry), https://docs.knock.app/in-app-ui/security-and-authentication
[^provider]: React SDK, KnockProvider (props, `enabled`, `identificationStrategy`), https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider
[^react-types]: React SDK types, KnockOptions, and JS SDK AuthenticateOptions (`onUserTokenExpiring`, `timeBeforeExpirationInMs` default 30000), in https://docs.knock.app/llms-full.txt (React SDK > Types; JavaScript SDK > AuthenticateOptions)
[^authstate]: React SDK, useKnockAuthState, https://docs.knock.app/in-app-ui/react/sdk/hooks/use-knock-auth-state
[^provider-src]: `KnockProvider.tsx` source, https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/context/KnockProvider.tsx
[^authclient-src]: `useAuthenticatedKnockClient.ts` source (in-place re-auth, teardown on disable), https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts
[^feedprovider-src]: `KnockFeedProvider.tsx` source (`key={feedProviderKey(knock.userId, …)}`), https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx
[^usenotifications-src]: `useNotifications.ts` source, https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/hooks/useNotifications.ts
[^node]: `@knocklabs/node` README (retries, timeouts, errors, `signUserToken`, `jose`), https://github.com/knocklabs/knock-node
[^node-src]: `@knocklabs/node` `src/client.ts` (default `Idempotency-Key` on non-GET requests) and `src/internal/request-options.ts` (`idempotencyKey` option), https://github.com/knocklabs/knock-node/blob/main/src/client.ts
[^ratelimits]: Rate limits, https://docs.knock.app/api-reference/overview/rate-limits
[^idempotency]: Idempotent requests, https://docs.knock.app/api-reference/overview/idempotent-requests
[^errors]: Errors, https://docs.knock.app/api-reference/overview/errors
[^delivering]: Delivering notifications (send retries, statuses, manual retry), https://docs.knock.app/send-notifications/delivering-notifications
[^envs]: Environments, https://docs.knock.app/version-control/environments
[^vc]: Version control overview, https://docs.knock.app/version-control/overview
[^impl]: Implementation guide (workflows as template containers, going to production), https://docs.knock.app/tutorials/implementation-guide
[^refdata]: Referencing data in templates, https://docs.knock.app/template-editor/referencing-data
[^testing]: Testing workflows (test runner, `settings.sandbox_mode`, committed vs saved), https://docs.knock.app/send-notifications/testing-workflows
[^cli]: Knock CLI overview, https://docs.knock.app/cli/overview
[^cli-push]: CLI, push all resources, https://docs.knock.app/cli/resources/push
[^cli-files]: CLI, workflow file structure, https://docs.knock.app/cli/workflow/file-structure
[^cicd]: Integrating Knock into your CI/CD pipeline, https://docs.knock.app/tutorials/integrating-into-cicd
[^mapi]: Management API, https://docs.knock.app/developer-tools/management-api
[^postmark]: Postmark integration, https://docs.knock.app/integrations/email/postmark
[^integrations]: Integrations overview (sandbox mode, per-environment channel config), https://docs.knock.app/integrations/overview
[^plans]: Knock plans and usage (non-production usage, sandbox not billed), https://docs.knock.app/manage-your-account/knock-plans
[^knock-test]: Knock test email channel, https://docs.knock.app/integrations/email/knock-test
