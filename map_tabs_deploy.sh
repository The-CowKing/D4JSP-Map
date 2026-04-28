#!/bin/bash
set -e
LOG="/c/Users/Owner/D4JSP-Map/map_tabs_deploy.log"
DONE="/c/Users/Owner/D4JSP-Map/map_tabs_deploy.done"

rm -f "$DONE"
echo "=== map_tabs_deploy start $(date) ===" > "$LOG"

cd /c/Users/Owner/D4JSP-Map

# Clear stale git lock
rm -f .git/index.lock

# Stage only the 4 changed source files
git add index.html src/layers.js src/main.js src/style.css

# Commit (skip if nothing staged)
git diff --cached --quiet && echo "Nothing to commit" | tee -a "$LOG" || \
  git commit -m "fix: static JSON imports (count=0), tabs panel, route viz" 2>&1 | tee -a "$LOG"

# Push with inline PAT
PAT=$(cat /c/Users/Owner/Desktop/keyz/github-pat.txt | tr -d '\r\n')
ORIGIN=$(git remote get-url origin)
git push "https://x-access-token:${PAT}@${ORIGIN#https://}" HEAD:main 2>&1 | tee -a "$LOG"
unset PAT

SHA=$(git log -1 --format='%H')
echo "SHA: $SHA" | tee -a "$LOG"

# Build (node_modules installed on Windows — use Windows npm)
npm run build 2>&1 | tee -a "$LOG"

# Deploy dist to KVM4
scp -r -i /c/Users/Owner/Desktop/keyz/d4jsp_kvm4_claude \
    -o StrictHostKeyChecking=no \
    dist/* root@177.7.32.128:/var/www/map/ 2>&1 | tee -a "$LOG"

echo "=== DEPLOY COMPLETE ===" | tee -a "$LOG"
echo "$SHA" > "$DONE"
