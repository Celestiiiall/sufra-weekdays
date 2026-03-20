# Sufra Weekdays

A lightweight weekly meal planner built as a static web app.

It includes:
- Week setup with a title, Monday anchor date, household size, and weekly focus
- Optional weekend days that can be turned on when needed
- Optional night mode with a persistent theme toggle
- Meal cards for breakfast, lunch, dinner, or snacks
- Ingredients and notes per dish
- Recipe video links saved with each meal
- Inline embeds for supported sources like YouTube and Vimeo
- Shareable week links so one person can send the current plan to someone else
- External link attachments for unsupported sources like Instagram or TikTok
- Local `localStorage` persistence
- Installable PWA support

## Run locally

No dependencies are required.

1. Open `index.html` in a browser.
2. Save your week details.
3. Add meals for the visible days of the week.
4. Turn `Include Weekend` on if you want Saturday and Sunday in the planner.
5. Attach recipe video links one per line in the meal form.
6. Use `Share Week` to generate a link someone else can import.

## Data storage

Planner data is stored in browser `localStorage` under the key `sufra-weekdays-v1`.

## Publish to GitHub Pages

This repo includes a GitHub Actions workflow for static deployment.

1. Create a new GitHub repository named `sufra-weekdays`.
2. Push this folder to `main`.
3. In repository settings, ensure `Pages` uses `GitHub Actions`.

Your Pages URL will be:

`https://<YOUR_GITHUB_USERNAME>.github.io/sufra-weekdays/`

## Sharing

- `Share Week` creates a link containing the current plan data.
- Opening that link on another device shows an import prompt for the shared week.
- If the plan grows too large for a URL, use `Export JSON` as the fallback.

## Notes on recipe videos

- YouTube and Vimeo links render inline previews inside meal cards.
- Other links are still saved and shown as quick-open attachments.
- If a platform blocks embedding, the saved link still works as an external reference.
