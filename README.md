# Auto Client Outreach

Personalised bulk email from your own Gmail, in the browser.

Upload an Excel or CSV list of clients, write one template with merge fields like `{{First Name}}`, preview every email, then send at a safe, human pace. It comes with the **UK Client Outreach** template from The Richmond Studios built in, and anyone can write and save their own.

**Live site:** https://atharvabankarsound.github.io/Auto-client-Outreach/

## What it does

- **Connect Gmail** with Google sign-in. It only asks for *send* permission (`gmail.send`), so it can never read your inbox.
- **Upload** `.xlsx`, `.xls`, `.csv` or `.ods`. It finds the email column automatically, flags invalid addresses and duplicates, and lets you tick who to include.
- **Merge fields**: `{{Column}}`, `{{Column|fallback}}`, `{{Column:url}}`, plus *campaign variables* (default values any column can override per row).
- **Live preview** of the real email for each recipient, with missing fields flagged.
- **Designed HTML + plain text** (multipart) or plain text only.
- **Safe sending**: random pause between emails, a daily cap per account, pause/resume/stop, automatic pause on Gmail rate limits, and a reconnect prompt when the hour-long Google session runs out.
- **No double-sends**: a per-campaign sent log means re-running a campaign skips anyone already emailed.
- **Do-not-email list** and an optional `List-Unsubscribe` header.
- **Export results** to Excel or CSV.
- **Private by design**: no server, no database. Contacts stay in your browser; email goes straight from your browser to Gmail.

## One-time setup: Google OAuth client ID (about 10 minutes)

The site needs a Google Cloud OAuth client ID before anyone can connect Gmail.

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "Auto Client Outreach").
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **Google Auth Platform → Branding** (the OAuth consent screen): app name, support email, and these links:
   - Home page: `https://atharvabankarsound.github.io/Auto-client-Outreach/`
   - Privacy policy: `https://atharvabankarsound.github.io/Auto-client-Outreach/privacy.html`
   - Terms: `https://atharvabankarsound.github.io/Auto-client-Outreach/terms.html`
4. **Audience**: choose **External**. While it is in *Testing*, add the Gmail addresses allowed to use it under **Test users** (up to 100).
5. **Data access → Add or remove scopes**: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `https://www.googleapis.com/auth/gmail.send`.
6. **Clients → Create client** → *Web application*. Under **Authorised JavaScript origins** add:
   - `https://atharvabankarsound.github.io`
   - `http://localhost:8000` (for local testing)
   No redirect URIs are needed.
7. Copy the client ID (`…apps.googleusercontent.com`) into `config.js`:
   ```js
   googleClientId: "1234567890-abc.apps.googleusercontent.com",
   ```
   Commit and push. (A client ID is public by design; there is no secret in this app.)

### Opening it to everyone

In *Testing* mode only your listed test users can connect, and their sign-in expires after 7 days. To let anyone use it:

- Click **Publish app** under **Audience**. Because `gmail.send` is a *sensitive* scope, Google then requires **app verification** (brand review; no paid security audit, since this app uses no *restricted* scopes).
- Verification requires a domain you own on the consent screen. `github.io` can't be verified as yours, so point a custom domain at GitHub Pages first, e.g. `outreach.therichmondstudios.co.uk` (repo **Settings → Pages → Custom domain**), verify it in Google Search Console, and use those URLs in step 3 and step 6.
- Until it's verified, users may see a “Google hasn't verified this app” screen and there's a 100-user cap.

Visitors can also paste **their own** client ID under **Settings → Advanced** if they want to use their own Google Cloud project.

## Hosting on GitHub Pages

Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**. The site is plain HTML/CSS/JS with no build step.

Run locally:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Spreadsheet format

First row = column headings. Any columns work; one must contain email addresses. See [`sample-contacts.xlsx`](sample-contacts.xlsx).

For the **UK Client Outreach** template, these columns personalise each email (empty cells fall back to the campaign variables):

| Column | Used for |
|---|---|
| `Email` | recipient |
| `First Names` | “Hi Corry and Luke,” (falls back to “there”) |
| `Show` | show / channel name in subject, body and links |
| `Hook` | the opening, personal sentence |
| `Audio Pain` | the typical audio problem for their format |
| `Eyebrow`, `Headline` | optional per-row overrides |

## Sending responsibly

- Start small: **10–30 a day** from a new or cold account, then increase slowly. Gmail's hard caps are about 500/day (personal) and 2,000/day (Workspace), but cold outreach should stay well below them.
- Send yourself a test and check it on mobile first.
- Designed HTML emails often land in *Promotions*; plain text tends to reach *Primary*.
- In the UK, emailing a *business* address is generally allowed with a clear opt-out (PECR); emailing individuals and sole traders usually needs prior consent. Honour every “no thanks”: add them to the do-not-email list.

## Files

```
index.html          the app
config.js           Google client ID and defaults
assets/app.js       UI, Gmail sign-in and sending
assets/core.js      merge-field rendering, email parsing, MIME building (no DOM)
assets/templates.js built-in templates (UK Client Outreach, Simple, Blank)
assets/styles.css
privacy.html, terms.html
sample-contacts.xlsx / .csv
```

© 2026 The Richmond Studios Ltd.
