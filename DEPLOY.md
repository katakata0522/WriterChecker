# Writer Checker Deploy Guard

## Commands

- Production health check:

```powershell
npm run verify:prod
```

- Deploy to Xserver with permission normalization + health check:

```powershell
npm run deploy:xserver
```

## What this prevents

- `js/*.js` returning `403`
- Missing `robots.txt` / `sitemap.xml`
- Broken asset references in `index.html`

## Optional custom base URL

```powershell
npm run verify:prod -- https://katakatalab.com/writer-checker/
```
