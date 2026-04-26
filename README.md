# Sufra Recipes

A static recipe randomizer built as a lightweight web app.

It includes:
- One permanent saved recipe list
- One optional image per recipe
- User-added recipe links for videos, blog posts, or other references
- An automatic grocery list built from today's picks or the full saved recipe library
- Automatic no-repeat rounds that restart after every saved recipe has been used once
- Optional no-login cloud sync with one-time device pairing codes
- Manual `Mark Used` and `Make Available` controls
- Edit controls that reopen any saved recipe in the form
- Search and filter controls for meal slot and round status
- Shareable recipe links so someone else can import the same list
- JSON export for larger libraries that do not fit comfortably in a URL
- Inline previews for supported sources like YouTube and Vimeo
- Local `localStorage` persistence
- Installable PWA support

## Run locally

No dependencies are required.

1. Open `index.html` in a browser.
2. Add recipes and optionally attach one image for each recipe.
3. Add ingredients one per line, or separate them with commas or semicolons.
4. Use `Edit Recipe` on any saved card to bring it back into the form.
5. Use `Generate Today` to draw from the saved list for only the meal slots you want.
6. The app will avoid repeats until every saved recipe has had a turn.
7. Use the grocery list section to copy or check off ingredients from today's picks or the whole library.
8. After the round ends, the next pick starts a fresh round automatically.
9. Use `Share Recipes` or `Export JSON` to move the list to another device.

## Data storage

Recipe data is stored in browser `localStorage` under the key `sufra-recipe-picker-v1`.

If cloud sync is configured, the app still keeps a local copy on each device and then syncs it through the backend.

If an older `sufra-weekdays-v1` planner exists in the same browser, the app will migrate those saved meals into the new recipe format.

## Publish to GitHub Pages

This repo includes a GitHub Actions workflow for static deployment.

1. Push this folder to `main` in the `sufra-weekdays` repository.
2. In repository settings, ensure `Pages` uses `GitHub Actions`.
3. GitHub Actions will deploy the static site automatically.

Your Pages URL will be:

`https://<YOUR_GITHUB_USERNAME>.github.io/sufra-weekdays/`

## Cloud Sync On GCP

The frontend stays on GitHub Pages. Cloud sync runs as a separate Node service on Cloud Run and stores paired-device data in Firestore.

### 1. Create the backend resources

In your Google Cloud project:

1. Enable `Cloud Run` and `Firestore`.
2. Create a Firestore database in Native mode.
3. Install dependencies for the backend:

```bash
cd backend
npm install
```

### 2. Deploy the Cloud Run service

From the `backend` folder:

```bash
gcloud run deploy sufra-sync-backend \
  --source . \
  --allow-unauthenticated \
  --region us-central1 \
  --set-env-vars ALLOWED_ORIGINS=https://celestiiiall.github.io,PAIR_CODE_TTL_MINUTES=10
```

Notes:
- Replace the GitHub Pages origin if your username or repo URL changes.
- `--allow-unauthenticated` is fine here because every library write still requires a device token issued by the backend.

### 3. Point the frontend at Cloud Run

Edit [sync-config.js](/Users/celestial/Desktop/GITHUB/sufra-weekdays/sync-config.js) and set your deployed Cloud Run URL:

```js
window.SUFRA_SYNC_CONFIG = {
  apiBaseUrl: "https://YOUR-CLOUD-RUN-URL",
  pollIntervalMs: 30000,
};
```

Then commit and push the frontend again so GitHub Pages serves the updated config.

### 4. Pair devices

1. On the first device, tap `Enable Sync`.
2. Tap `Show Pair Code`.
3. On the second device, tap `Connect This Device`.
4. Enter the code from the first device.

After that, both devices use the same cloud library without import/export.

### Implementation notes

- The backend lives in [backend/server.js](/Users/celestial/Desktop/GITHUB/sufra-weekdays/backend/server.js).
- Device access is controlled by a long random token stored only on the paired device.
- Pairing codes are one-time and expire automatically.
- Images currently sync as compressed data URLs inside Firestore recipe documents to keep the first version simple. If the library grows a lot, move images to Cloud Storage next.

## Sharing

- `Share Recipes` creates a link containing the current saved list and round state.
- Opening that link on another device shows an import prompt for the shared recipes.
- If the library grows too large for a URL, use `Export JSON` as the fallback.

## Notes on recipe links

- Paste links one per line, or use `Label | URL` if you want a custom button label.
- YouTube and Vimeo links render inline previews inside recipe cards and current picks.
- Other links are still saved and shown as quick-open attachments.
- If a platform blocks embedding, the saved link still works as an external reference.
