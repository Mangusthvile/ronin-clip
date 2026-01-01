# RoninClip

A local personal tool to extract web chapters to plain text.

## Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Install Browsers (for Playwright fallback):**
   ```bash
   npx playwright install chromium
   ```

## Running the App

Open two terminals in the project folder.

**Terminal A**
```bash
npm run server
```
You must see: `RoninClip Backend running on port 8787`

**Terminal B**
```bash
npm run dev
```

Then open the app at [http://localhost:5173](http://localhost:5173) and those “Connection to backend failed” screens should disappear.

## Features

### Protocols
RoninClip uses "Protocols" to understand how to scrape specific sites.
1. Go to **Protocols**.
2. Initialize New.
3. Enter Domain (e.g., `novelbin.com`).
4. Enter Selectors (e.g., Title: `h3`, Content: `#chr-content`).
5. Use the **Diagnostics** tool to test a live URL and see if it captures the correct title and paragraph count.

### Batch
1. Go to **Batch Queue**.
2. Paste a list of chapter URLs.
3. Click **Engage**.
4. Once finished, click **Archive** to download a ZIP file.

### System Settings
Adjust concurrency and rate limits in **System** to respect server load.
