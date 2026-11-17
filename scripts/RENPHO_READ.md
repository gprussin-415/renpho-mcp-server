# Reading weigh-ins without the MCP client: `scripts/renpho_read.mjs`

This script prints Renpho weigh-ins since a start date as JSON, with the oldest first:

```json
[{ "date": "2026-11-10", "weight_lb": 162 }, { "date": "2026-11-17", "weight_lb": 161.5 }]
```

The script imports the server's own `RenphoApiService` from `dist/`, which is the same code the MCP tool `get_measurements` uses. It skips the MCP stdio layer, so it gets structured data instead of the markdown table the tool returns.

## Run it

Run these from the repo root. The script uses relative paths, so it must run from there.

```bash
npm install                                    # only if node_modules/ is missing
npm run build                                  # only if dist/ is missing or src/ changed
node scripts/renpho_read.mjs 2026-10-01                    # JSON on stdout
node scripts/renpho_read.mjs 2026-10-01 --out weighins.json
```

- **Node:** version 18 or later. It was tested on Node 22.
- **Environment variables:**
  - `RENPHO_EMAIL` and `RENPHO_PASSWORD` are required. The script never prints or writes them.
  - `TZ` is optional and sets which time zone's calendar day becomes `date`. The default is UTC. For example, with `TZ=America/New_York`, an 8 pm Eastern weigh-in keeps its local date instead of rolling over to the next UTC day.
- **Build:** this step is required because `dist/` is gitignored. A fresh clone needs `npm install && npm run build`, which takes about 10 to 20 seconds.

## Network

- **At runtime:** the script calls only `cloud.renpho.com` over HTTPS on port 443.
- **At install time:** `npm install` needs the npm registry (`registry.npmjs.org`). The default "package managers allowed" setting covers it.

## Timing and exit codes

A normal run takes about 1 second. A failed login returns in about 0.3 seconds.

Data goes only to stdout or to the `--out` file. Messages go to stderr, on a single line prefixed with `renpho_read:`.

| exit | stderr | meaning |
|---|---|---|
| 0 | (nothing) | success; `[]` if there were no weigh-ins |
| 1 | `usage: ...` or `dist/ not found ...` | bad arguments, or the build hasn't run |
| 2 | `MISSING_CREDENTIALS (...)` | the environment variables aren't set |
| 3 | `LOGIN_FAILED (code=104)` | Renpho rejected the login (seen with a wrong password) |
| 4 | `ERROR ...` | a network or API error, or no linked scale |

To skip quietly on a login failure:

```bash
node scripts/renpho_read.mjs "$START" --out weighins.json 2>/dev/null; rc=$?
[ $rc -eq 3 ] && exit 0   # login failed: skip this run
```

## Notes

- `weight_lb` is the stored kg value × 2.20462, rounded to 0.1 lb. Because the MCP table rounds the kg value first, the two can differ by 0.1 lb.
- Each measurement becomes one row. A day with two weigh-ins has two rows.
- The script reads up to 1000 measurements, the server's scan limit.
