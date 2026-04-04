# Sufra Pool

A static recipe-pool randomizer built as a lightweight web app.

It includes:
- A saved recipe library grouped by breakfast, lunch, dinner, and snack
- User-added recipe links for videos, blog posts, or other references
- A non-repeating randomizer that keeps picked recipes out of rotation until the cycle is reset
- Manual `Mark Used` and `Return to Pool` controls
- Search and filter controls for slot and cycle status
- Shareable pool links so someone else can import the same collection
- JSON export for larger pools that do not fit comfortably in a URL
- Inline previews for supported sources like YouTube and Vimeo
- Local `localStorage` persistence
- Installable PWA support

## Run locally

No dependencies are required.

1. Open `index.html` in a browser.
2. Save a pool name and optional rotation note.
3. Add recipes and paste one link per line.
4. Use `Pick Recipes` to draw from the pool without repeats.
5. Use `Reset No-Repeat Cycle` when you want every recipe available again.
6. Use `Share Pool` or `Export JSON` to move the collection to another device.

## Data storage

Pool data is stored in browser `localStorage` under the key `sufra-recipe-picker-v1`.

If an older `sufra-weekdays-v1` planner exists in the same browser, the app will migrate those saved meals into the new recipe pool format.

## Publish to GitHub Pages

This repo includes a GitHub Actions workflow for static deployment.

1. Push this folder to `main` in the `sufra-weekdays` repository.
2. In repository settings, ensure `Pages` uses `GitHub Actions`.
3. GitHub Actions will deploy the static site automatically.

Your Pages URL will be:

`https://<YOUR_GITHUB_USERNAME>.github.io/sufra-weekdays/`

## Sharing

- `Share Pool` creates a link containing the current collection, recipe list, and no-repeat state.
- Opening that link on another device shows an import prompt for the shared pool.
- If the pool grows too large for a URL, use `Export JSON` as the fallback.

## Notes on recipe links

- Paste links one per line, or use `Label | URL` if you want a custom button label.
- YouTube and Vimeo links render inline previews inside recipe cards and current picks.
- Other links are still saved and shown as quick-open attachments.
- If a platform blocks embedding, the saved link still works as an external reference.
