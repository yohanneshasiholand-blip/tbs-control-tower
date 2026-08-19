# TBS Control Tower Web Edition v1

Static frontend for GitHub Pages connected to Supabase.

## Deploy
1. Create a GitHub repository named `tbs-control-tower`.
2. Upload `index.html`, `style.css`, and `app.js` to the repository root.
3. Repository > Settings > Pages.
4. Source: Deploy from a branch.
5. Branch: `main`, folder `/ (root)`.
6. Save.
7. Open `https://<username>.github.io/tbs-control-tower/`.

## Security
The frontend uses only the Supabase publishable key. Never commit `service_role`, `sb_secret_*`, or database passwords.
