# Sufra Recipes

A static recipe randomizer built as a lightweight web app.

It includes:
- One permanent saved recipe list
- One optional image per recipe
- User-added recipe links for videos, blog posts, or other references
- Automatic no-repeat rounds that restart after every saved recipe has been used once
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
5. Use `Pick Recipes` to draw from the saved list.
6. The app will avoid repeats until every saved recipe has had a turn.
7. After the round ends, the next pick starts a fresh round automatically.
8. Use `Share Recipes` or `Export JSON` to move the list to another device.

## Data storage

Recipe data is stored in browser `localStorage` under the key `sufra-recipe-picker-v1`.

If an older `sufra-weekdays-v1` planner exists in the same browser, the app will migrate those saved meals into the new recipe format.

## Publish to GitHub Pages

This repo includes a GitHub Actions workflow for static deployment.

1. Push this folder to `main` in the `sufra-weekdays` repository.
2. In repository settings, ensure `Pages` uses `GitHub Actions`.
3. GitHub Actions will deploy the static site automatically.

Your Pages URL will be:

`https://<YOUR_GITHUB_USERNAME>.github.io/sufra-weekdays/`

## Sharing

- `Share Recipes` creates a link containing the current saved list and round state.
- Opening that link on another device shows an import prompt for the shared recipes.
- If the library grows too large for a URL, use `Export JSON` as the fallback.

## Notes on recipe links

- Paste links one per line, or use `Label | URL` if you want a custom button label.
- YouTube and Vimeo links render inline previews inside recipe cards and current picks.
- Other links are still saved and shown as quick-open attachments.
- If a platform blocks embedding, the saved link still works as an external reference.
