# Database Architecture & Source of Truth

## Primary Rule: Firebase (Firestore) is the Single Source of Truth
- **Firebase / Firestore** is the sole authoritative data store for all application data:
  - Trials and sub-trials
  - Formulations and Recipes
  - Ingredients and Costs
  - Observations and Efficacy Data
  - Photos metadata & Google Drive links
  - User profiles, roles, and settings
- All reads and writes must be directed to **Firebase** first.
- The app must never depend on Google Sheets to be available or responsive for core user flows (trials, observations, AI analysis, formulation management).

## Role of Google Sheets
- **Google Sheets is strictly for backup mirroring and external reporting**:
  - Mirrored asynchronously in the background via `sheetMirror.js`.
  - Background mirroring must never block UI rendering or operational workflows.
  - Google Sheets is NEVER queried as the source of truth during normal app usage.

## Photo Management
- Large binary photos are uploaded to **Google Drive** for storage to keep Firebase documents lightweight.
- The Google Drive URLs and file IDs are stored in Firebase.
- Drive thumbnails and files are loaded directly via Google's high-speed CORS-enabled CDN (`lh3.googleusercontent.com` / `drive.google.com/thumbnail`) for AI analysis and UI display.
