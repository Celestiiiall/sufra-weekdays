# Sufra Weekdays

A lightweight weekday meal planner built as a static web app.

It is designed for Monday to Friday planning and includes:
- Week setup with a title, Monday anchor date, household size, and weekly focus
- Meal cards for breakfast, lunch, dinner, or snacks
- Ingredients and notes per dish
- Recipe video links saved with each meal
- Inline embeds for supported sources like YouTube and Vimeo
- External link attachments for unsupported sources like Instagram or TikTok
- Local `localStorage` persistence
- Installable PWA support

## Run locally

No dependencies are required.

1. Open `index.html` in a browser.
2. Save your week details.
3. Add meals for Monday through Friday.
4. Attach recipe video links one per line in the meal form.

## Data storage

Planner data is stored in browser `localStorage` under the key `sufra-weekdays-v1`.

## Publish to GitHub Pages

This repo includes a GitHub Actions workflow for static deployment.

1. Create a new GitHub repository named `sufra-weekdays`.
2. Push this folder to `main`.
3. In repository settings, ensure `Pages` uses `GitHub Actions`.

Your Pages URL will be:

`https://<YOUR_GITHUB_USERNAME>.github.io/sufra-weekdays/`

## Notes on recipe videos

- YouTube and Vimeo links render inline previews inside meal cards.
- Other links are still saved and shown as quick-open attachments.
- If a platform blocks embedding, the saved link still works as an external reference.
