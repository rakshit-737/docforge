# Publishing this repo to GitHub

## Step 1 — create the empty repo (30 seconds)

Go to **https://github.com/new**, name it **docforge**, leave everything unticked (no README), click **Create repository**.

## Step 2 — pick ONE of these

### A. If you have Git installed
Open a terminal in this folder and run `publish.bat` (Windows) or `bash publish.sh` (Mac/Linux).
A browser window will pop up to sign you in to GitHub — that's it.

### B. Manual commands (same thing, by hand)
```
git init -b main
git add -A
git commit -m "DocForge v1.0"
git remote add origin https://github.com/rakshit-737/docforge.git
git push -u origin main
```

### C. No Git? Use the browser
On your new repo page click **"uploading an existing file"**, then drag **all files and folders from this folder** (including the `.github` folder) into the page and click **Commit changes**.

## Step 3 — your website goes live automatically

The included workflow (`.github/workflows/pages.yml`) enables GitHub Pages and deploys on the first push. Watch the **Actions** tab — after the green tick (~1 minute), your document studio is live at:

**https://rakshit-737.github.io/docforge/**

(If the Actions run doesn't start: repo **Settings → Actions → General →** allow all actions, then **Actions → Deploy DocForge → Run workflow**.)
