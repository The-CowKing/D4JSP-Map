@echo off
cd /d C:\Users\Owner\D4JSP-Map
git add src/main.js
git commit -m "fix(map): findMatchesForItem now scans p.drops + p.keys + p.boss_name (Find regression)"
if errorlevel 1 exit /b 1
set /p PAT=<"C:\Users\Owner\Desktop\keyz\github-pat.txt"
for /f "tokens=*" %%a in ('git remote get-url origin') do set ORIG=%%a
set ORIGIN_NOPROTO=%ORIG:https://=%
git push "https://x-access-token:%PAT%@%ORIGIN_NOPROTO%" HEAD:deploy/find-drops-fix-2026-05-03
set PAT=
git log -1 --format=%%H
