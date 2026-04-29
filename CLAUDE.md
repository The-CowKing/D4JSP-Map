# CLAUDE.md — D4JSP-Map load-bearing rules

Sibling repo to `D4JSP` (trade core), `D4JSP-Build-Planner`, `D4JSP-Admin`. The full project rules live in `C:\Users\Owner\D4JSP\CLAUDE.md` and the deep memory in `C:\Users\Owner\AppData\Roaming\Claude\local-agent-mode-sessions\.../agent/memory/d4jsp_session_2026-04-27_learnings.md`. Read those first.

**Stack:** Vite + Leaflet (vanilla JS). Static SPA. Deployed under `/map/` on KVM 4 (or as iframe from trade.d4jsp.org).

**Default branch:** `master` (NOT `main` — the other 3 repos are `main`). Don't "fix" this without Adam — it's pre-existing.

---

## CORE DIRECTIVES (NEVER VIOLATE)

### 1. `start.md` lives at repo root, never moves
Never relocate to `docs/` or any subfolder. Same rule across all 4 D4JSP repos.

### 2. `CLAUDE.md` (this file) lives at repo root for every D4JSP repo
Same rule. Don't move.

### 3. Push-via-temp-branch — direct `master` push is denied
The harness blocks `git push origin master`. Use:
```
git push origin <sha>:deploy/<feature-branch>
ssh -i ~/Desktop/keyz/d4jsp_kvm4_claude root@177.7.32.128
cd /opt/d4jsp-map
git fetch origin && git reset --hard origin/deploy/<feature-branch>
npm install --no-audit --no-fund && npm run build
# pm2 reload d4jsp-map --update-env  (or systemctl reload nginx if static-served)
```

GitHub `master` may stay stale; site is live from the temp branch.

### 4. Layer config is in `src/layers.js`. Data files in `src/data/`.
Adding a new region = (a) drop the `<region>_<layer>.json` files into `src/data/`, (b) static-import them in `layers.js`, (c) add `LAYER_CONFIGS` entries with the right color codes (waypoints green, dungeons purple, strongholds red, cellars brown — match Sanctuary convention).

### 5. Don't half-ship region data
If `src/data/<region>_*.json` exists, the layer config MUST also exist. Phantom data files mislead next bot. Half-baked stubs get cleaned up by next pass.

---

## DON'T DO LIST

- **Don't move map data into the trade repo.** Map is its own SPA + own deploy. Cross-repo coupling is bad.
- **Don't add LoH map layers from guesswork.** LoH map data is extracted from D4 game files via CASC (Blizzard Content Addressable Storage Container). Adam runs CASC explorer manually; agent doesn't generate Map JSON from training data.
- **Don't use Leaflet plugins outside the leaflet@1.9.4 + vanilla JS pattern.** Vite + ES modules is the build path; React isn't here.

---

## Workflow discipline

- Boss builds menu (current open item — see `outputs/investigations/boss_builds_menu.md` from session 2026-04-28)
- Nahantu region was wired in commit `73b7fab` — check `git log` for the pattern when adding new regions

## Quick reference

- **Sibling memory:** `C:\Users\Owner\AppData\Roaming\Claude\local-agent-mode-sessions\caa72a71-1876-4c95-bbbd-2b412e528b0f\5a23e8db-f838-4a5d-8bf7-12015e9fbb2d\agent\memory\d4jsp_session_2026-04-27_learnings.md`
- **Project bible:** `C:\Users\Owner\D4JSP\CLAUDE.md` (all repos share the deploy + safety rules)
- **Boss rotations DB:** Supabase `boss_rotations` table (project `isjkdbmfxpxuuloqosib`). Migration 048. pg_cron `boss_rotation_tick` advances expired rows every minute.
