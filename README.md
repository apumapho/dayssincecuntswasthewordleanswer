# Days Since CUNTS Was the Wordle Answer

A bright, static, and needlessly rigorous counter for
[dayssincecuntswasthewordleanswer.com](https://dayssincecuntswasthewordleanswer.com).

## Data workflow

- `npm run import-seed` performs the one-time historical import from WordFinder's
  complete archive page.
- `npm run update` fetches only missing dates from the official NYT dated Wordle
  endpoint. On a normal day this is one request.
- `npm test` validates puzzle/date continuity, the day-zero boundary, the counter
  reset behavior, and the absence of CUNTS in the archive to date.
- `scripts/daily-update.sh` updates the data, commits a real change, and pushes it.
- `launchd/com.dayssince.wordle-updater.plist` runs that workflow at 8:15 AM
  America/New_York on `luchonmac`.
- `npm run dns:check` shows the exact Porkbun DNS cutover without changing it;
  `npm run dns:apply` applies it after both API keys are present in `.env`.
- `npm run schedule:install` validates and installs the launch agent after the
  Git remote is configured.

## Local development

```sh
npm run serve
```

Netlify publishes the `public/` directory. No build framework or runtime service
is required.
