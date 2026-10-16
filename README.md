# Seb-f-Johansson.github.io — personal site

Static site for GitHub Pages. No build step, no framework: plain HTML, one CSS file, two small scripts.

```
index.html        Home: bio, research cards, explorer teaser, live GitHub repositories
research.html     Papers with expandable abstracts and BibTeX (show / copy)
exposure.html     AI exposure explorer (SVG scatter, search, major-group filter, year menu, table view)
jobs.html         AI and Norwegian jobs: SSB employment and earnings by exposure group, updated measures
teaching.html     Courses and the notes/solution-set archive (links to Dropbox)
cv.html           CV summary + PDF
assets/           style.css, site.js (theme, nav, GitHub API), exposure.js (chart), photo, favicon
data/exposure_2024.json   422 ISCO-08 occupations: DAIOE 2024, C-DAIOE, complementarity (paper values)
data/exposure_scores.json DAIOE and C-DAIOE 2010-2026 (2025-26 provisional), C-DAIOE by O*NET release
data/ai_jobs.json         SSB tables 11658 and 14160 aggregates; rebuilt weekly by the workflow below
data/skill_profiles.json  O*NET 24.3 ability and skill importance by ISCO-08, ability AI exposure
scripts/update_ai_jobs.py rebuilds data/ai_jobs.json from SSB (standard library only)
.github/workflows/update-ai-jobs.yml   weekly schedule (Mondays 06:17 UTC) + manual run
cv/Sebastian_Johansson_CV.pdf
.nojekyll         tells GitHub Pages to serve the files as they are
```

## Publish (once)

1. On GitHub (signed in as Seb-f-Johansson), create a new **public** repository named exactly `Seb-f-Johansson.github.io`, with no README, licence or .gitignore.
2. Push this folder to it. It is already a git repository with one commit on `main`, so from a terminal inside this folder:

```
git remote add origin https://github.com/Seb-f-Johansson/Seb-f-Johansson.github.io.git
git push -u origin main
```

   (No terminal? On the empty repository page choose *uploading an existing file*, drag in everything in this folder including the `assets`, `cv` and `data` folders and the `.nojekyll` file, and commit.)
3. Repository → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`. Save.
4. After a minute the site is live at https://Seb-f-Johansson.github.io/.

Later changes: edit the files, `git commit -am "…"`, `git push`. The site updates within a minute or two.

## Two things still to fill in

- **CV PDF.** `cv/Sebastian_Johansson_CV.pdf` is the June 2023 version from the old site. Drop in a current one under the same name.
- **Covid working paper.** `research.html` has no abstract for it (the PDF could not be read from here); add one inside a `<details>` block like the other papers, and check the year in its BibTeX entry (currently 2021).

## Updating content

- Papers: edit `research.html`. Each paper is one `<article class="paper" id="…">` with a `<details>` abstract, buttons, and a `<pre class="bib">` BibTeX block. Add a PDF link as `<a class="btn primary" href="…">PDF</a>` in the `actions` row.
- Home-page cards link to the `id`s on the research page.
- Exposure data: replace `data/exposure_2024.json` (same columns: `isco, title, daioe, cdaioe, comp`; `median_daioe` and `median_comp` set the dashed reference lines). It was produced from `code/crosswalks/daioe_isco08_2024.csv` and `daioe_task_cadj_by_isco08.csv` in the research project, major group 0 excluded.
- Repositories: listed automatically from the public GitHub API (forks and archived repos hidden, newest push first, max 9). Private repositories never appear. Add topics and a description on GitHub to make the cards informative. The API allows 60 unauthenticated requests per hour per visitor, which is plenty for a personal site.
- Dark mode: follows the visitor's system setting; the toggle in the header overrides it and remembers the choice in the browser.
- Name and footer address are set in the header/footer of each page; search for "Nydalsveien" to change the address. The GitHub user name sits in `<body data-github="…">` and the GitHub links on each page.

## Optional

- Custom domain: add a `CNAME` file containing the domain and set the DNS as described in GitHub's Pages docs.
- Google Scholar / LinkedIn / ORCID buttons: copy one of the `<li>` entries in the `.links` list on `index.html`.
- The old Google Site can be left up with a one-line pointer to the new address, or deleted once the new site is live.

## Automatic updates

`.github/workflows/update-ai-jobs.yml` runs `scripts/update_ai_jobs.py` every Monday. It commits
`data/ai_jobs.json` when SSB has published new data, and writes the month of the last check to
`data/last_checked.txt` (one small commit a month, so GitHub does not pause the schedule).
To run it by hand: repository → Actions → *Update AI and jobs data* → *Run workflow*.

`data/exposure_scores.json` and `data/skill_profiles.json` are not rebuilt here. It comes from the research project
(`code/python/build_website_ai_data.py`, after `extend_daioe_frontier.py`,
`prepare_onet_vintages.py` and `run_cdaioe_vintage.py`) and is replaced by hand about once a year.
