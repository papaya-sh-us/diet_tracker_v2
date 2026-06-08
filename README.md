# Yashus Nutrition Tracker

A personal, privacy-first nutrition tracker built for you specifically.
Everything runs in your browser, all data stays on your phone.

## What it does

- **Daily meal tracking** — tick foods as you eat them, adjust quantities
- **Calendar from May 1, 2026** — see every day's intake history
- **Smart retention** — last 2 days + today show full meal detail; older days show daily totals only
- **Comprehensive food database** — 130+ Indian and global foods with confidence flags:
  - 🟢 Verified (IFCT 2017 / USDA)
  - 🟡 Estimated (typical values, ±10%)
  - 🔴 Check label (branded items — values from your labels)
  - 🟣 Custom (foods you added)
- **Add custom foods** — anything not in the DB, with all nutrients
- **Photo labels** — snap a pic of any nutrition label and attach it to a food entry
- **Editable targets** — adjust your daily kcal/protein/macro/micro goals
- **Backup & restore** — export/import all your data as JSON

## Storage

Uses **IndexedDB** for true persistent storage. Data survives:
- ✅ Closing the app
- ✅ Phone restart
- ✅ App updates
- ✅ Months/years of use

Data is **only** lost if you explicitly clear browser data or uninstall the PWA.
**→ Use the Export Backup button periodically and save to Google Drive.**

## Local Development

```bash
npm install
npm run dev      # opens http://localhost:5173
npm run build    # builds production-ready files into dist/
```

## Deploy to Vercel (Recommended)

1. **Push to GitHub:**
   ```bash
   cd yashus-tracker
   git init
   git add .
   git commit -m "Initial commit"
   # Create a new repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/yashus-tracker.git
   git push -u origin main
   ```

2. **Connect to Vercel:**
   - Go to https://vercel.com and sign in with GitHub
   - Click "Add New… → Project"
   - Import your `yashus-tracker` repo
   - Vercel auto-detects Vite — just click **Deploy**
   - You'll get a URL like `yashus-tracker.vercel.app`

3. **Install on your phone:**
   - Open the Vercel URL in Chrome on your phone
   - Tap the menu → **"Add to Home Screen"**
   - The app installs with an icon and opens fullscreen
   - Works offline

## Deploy to your local network instead

If you want it to run on your home wifi without Vercel:

```bash
npm run build
npm run preview -- --host 0.0.0.0
# Now accessible at http://YOUR_LAPTOP_IP:4173 from any device on your wifi
```

## Updating the food database

You can edit any food's nutrient values directly in the app:
- Tap the 🍎 icon → search/browse → tap a food → "edit"
- For branded items marked 🔴 Check label, enter values from your packaging

You can also extend the seed database in `src/data/foodDatabase.js` and redeploy.

## Tech Stack

- React 18 (Vite)
- IndexedDB (raw, no dependencies)
- PWA via vite-plugin-pwa
- No backend, no tracking, no analytics

## File structure

```
yashus-tracker/
├── src/
│   ├── App.jsx                       # Main app
│   ├── main.jsx                      # Entry
│   ├── components/
│   │   ├── Calendar.jsx              # Monthly calendar view
│   │   ├── DayView.jsx               # Read-only past day view
│   │   ├── FoodPicker.jsx            # Browse/edit food DB
│   │   ├── MealItem.jsx              # Single food row
│   │   └── UI.jsx                    # Shared components
│   ├── data/
│   │   ├── foodDatabase.js           # The food DB (editable seed)
│   │   └── mealPlan.js               # Default daily meal template
│   ├── db/
│   │   └── database.js               # IndexedDB wrapper
│   └── utils/
│       └── helpers.js                # Theme + helpers
├── public/                           # PWA icons
├── index.html
├── vite.config.js
└── package.json
```

## Confidence flags in the food database

The food DB ships with values flagged by source:

- **🟢 Verified** — directly from IFCT 2017 (ICMR-NIN India) or USDA FoodData Central. These are highly reliable.
- **🟡 Estimated** — typical values for the food class, accurate to ±10% but not from a primary source. Use with awareness.
- **🔴 Check label** — branded products or restaurant items. The DB has placeholder values; you should edit these to match your specific brand's label.
- **🟣 Custom** — foods you add yourself.

Items currently marked 🔴 that you may want to verify against your actual label:
- Whey isolate / concentrate (varies wildly by brand)
- Your paneer brand (already populated from the photo)
- Tempayy (populated from label)
- Fortune soya chunks (populated from label)
- Restaurant grilled chicken & toum (estimates)

## Privacy

Nothing leaves your device unless you explicitly export a backup.
No accounts, no servers, no telemetry.
