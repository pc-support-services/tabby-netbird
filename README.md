# tabby-netbird

Tabby plugin: lists peers from a self-hosted NetBird management server as SSH
connection profiles, grouped and filtered by regex rules, with configurable
name labels. Forked from the logic of tabby-tailscale (MIT, enamentis).

## Setup (Settings → NetBird)

1. Management server URL: e.g. `https://netbird.pc-support.uk.com`
2. API token (PAT): mint in NetBird dashboard (or via API), stored in Tabby's
   Vault (falls back to plaintext config when Vault is disabled)
3. Optionally add Groups (folders in the profile browser + default
   user/key/password) and Rules (regex matchers on peer name / NetBird group,
   online status filter, exclude toggle, per-peer overrides)

Profiles refresh every time the Profile Browser is opened.

## Notes

- Uses `GET /api/peers` with `Authorization: Token <PAT>`
- Peers connect via their NetBird DNS FQDN (falls back to tunnel IP)
- Requires the machine running Tabby to be connected to the NetBird network
- PAT must be re-created yearly (NetBird max expiry 365 days)

## Build

```
npm install
npx webpack
```

Bundle lands in `dist/index.js` (UMD, Tabby's runtime provides the externals).
