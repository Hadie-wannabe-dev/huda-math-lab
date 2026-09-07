# Huda Math Club — Cloudflare Pages + D1

## Project layout

```
huda-math-club/
├── public/                  <- static assets (pages_build_output_dir)
│   ├── index.html
│   ├── style.css
│   └── White Crumpled Paper Texture.jpg   <- copy your texture here
├── functions/
│   └── api/
│       ├── register.js      -> POST /api/register
│       └── history.js       -> GET  /api/history?email=...
├── schema.sql
└── wrangler.toml
```

`functions/` stays at the project root, not inside `public/`. Cloudflare Pages
maps each file under `functions/` to a route by its path, so `functions/api/register.js`
serves `/api/register`. No router config needed.

## One-time setup

```bash
npm install --save-dev wrangler
npx wrangler login

# Create the database — this prints a database_id
npx wrangler d1 create huda-math-club
```

Paste the printed `database_id` into `wrangler.toml`.

Then create the table, locally and remotely:

```bash
npx wrangler d1 execute huda-math-club --local  --file=./schema.sql
npx wrangler d1 execute huda-math-club --remote --file=./schema.sql
```

## Run it locally

```bash
npx wrangler pages dev
```

This serves `public/` and runs the Functions against a local SQLite copy of D1,
so you can fill the form and hit the waitlist boundary without touching production
data. To test the waitlist quickly, drop `SEATS_PER_SESSION` in
`functions/api/register.js` to 2, sign up three children, then set it back to 20.

## Deploy

```bash
npx wrangler pages deploy
```

First deploy will ask you to create or pick a Pages project. After that, if you
connect the repo to Git in the dashboard, pushes deploy automatically.

If you set the project up through the dashboard instead of `wrangler.toml`, add the
binding manually under **Workers & Pages → your project → Settings → Bindings → D1**:
variable name `DB`, database `huda-math-club`. The variable name has to be `DB` —
that is what `env.DB` refers to in both endpoints.

## Reading the data

```bash
# Everyone in Session 1, in sign-up order
npx wrangler d1 execute huda-math-club --remote \
  --command "SELECT child_name, status, waitlist_spot FROM registrations WHERE session='Session 1' ORDER BY id"

# Export for invoicing
npx wrangler d1 execute huda-math-club --remote --json \
  --command "SELECT * FROM registrations ORDER BY session, id" > registrations.json
```

## API

### `POST /api/register`

```json
{ "parentName": "…", "parentEmail": "…", "parentPhone": "…",
  "childName": "…", "session": "Session 1" }
```

- `201` → `{ ok, id, childName, session, status, waitlistSpot, createdAt }`
- `400` → `{ error, code? }` — validation failure, or `code: "DUPLICATE"` when
  that parent email + child + session already exists
- `500` → `{ error }`

Seat assignment happens inside a single `INSERT ... SELECT ... RETURNING`, so the
seat count and the insert can't be split apart by two parents submitting at once.

### `GET /api/history?email=…`

- `200` → `{ ok, email, parentName, registrations: [...] }` — an email with no
  sign-ups returns an empty array, not a 404
- `400` → `{ error }` — malformed email

## Two things to fix before this handles real money

1. **The history endpoint has no authentication.** Anyone who guesses an email can
   read that family's registrations. That's fine for a roster of first names and
   sessions, but the moment you attach invoice amounts or addresses, it isn't.
   The lightest fix that keeps the no-password feel: email a short-lived signed
   link instead of returning data straight from the email field.
2. **There's no rate limit on `/api/register`.** A script could fill both sessions
   in seconds. Cloudflare's built-in Rate Limiting rules can cap `/api/*` per IP
   from the dashboard without any code change.
