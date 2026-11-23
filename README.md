# Arpan Baliyan portfolio

A personal portfolio for client relationships, business development, people leadership and business operations. The homepage introduces Arpan. Ten dedicated case-study sites provide the supporting work.

## Open it

Open `index.html` directly in a browser, or run `python tools/server.py` and open `http://127.0.0.1:8080`. The static edition runs without a server, paid account, sign-in or external data service. CSV exports, workbooks and browser interactions also work in the static edition.

## Portfolio map

| Area | Dedicated page | Interactive example |
| --- | --- | --- |
| Collections | `projects/collections/` | Collectible-balance routing and account worklist |
| Chargebacks | `projects/chargebacks/` | Deadline queue, evidence checklist and case brief |
| Team training | `projects/training/` | Four-week curriculum and practical assessment |
| Audits | `projects/audits/` | Weighted quality scorecard and critical-finding control |
| Client handling | `projects/clients/` | Multi-location account plan and growth register |
| Customer database | `projects/customer-data/` | Exception filters and correction decisions |
| Operations knowledge | `projects/operations/` | Selectable hand-off map and service-level queue |
| Cash flow | `projects/cash-flow/` | Interactive 13-week cash scenario |
| Reviews | `projects/reviews/` | Team comparison and downloadable coaching brief |
| Meetings | `projects/meetings/` | Agenda selection and downloadable meeting brief |

Each directory includes its dataset, workbook, SQL query, Python analysis, Jupyter notebook, data dictionary and printable procedure guide. The original Credit Control and AR Command Center packages are retained under `legacy/`. The original published collections portfolio remains linked from the Collections page.

## Data provenance

All 929 case-study records are fictional, generated from a fixed seed. They are not anonymised employer records. Client names, staff names, opportunities, transactions and business scenarios in those datasets are synthetic. The personal profile uses the experience shared by Arpan. Simulated project results are explicitly separated from employment achievements.

`tools/build_data.py` generates the CSVs, data bundle and SQLite database using Python's standard library. `tools/build_pages.py` generates the homepage and project entry points. These builders preserve existing Excel workbooks; regenerate the workbooks after changing the source data. `tools/build_workbooks.mjs` uses `@oai/artifact-tool` and can use the `ARTIFACT_NODE_MODULES` environment variable to resolve the authoring runtime. That tool is needed only to rebuild the Excel files, not to view the website or run the Python analyses. The site deploys the committed workbooks and generated data together; it does not regenerate data during deployment.

## Publish to GitHub Pages

Recommended repository: `arpan-portfolio`, separate from the existing `westline-collections` repository. Upload or push this directory, including the `.github` directory, on branch `main`. In the repository's Settings → Pages, set the source to GitHub Actions. The included workflow checks the new site's references and data, packages its public files and deploys them.

The GitHub Pages address is [arpanbaliyan.github.io/arpan-portfolio](https://arpanbaliyan.github.io/arpan-portfolio/).

The workflow follows [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). The homepage can also be served by any static hosting provider. No hosting plan or paid service has been purchased.

## Python and cloud edition

The included Dockerfile packages the website and a read-only Python/SQLite API. Run `docker build -t arpan-portfolio .` and `docker run -p 8080:8080 arpan-portfolio`. It binds port 8080 inside the container and runs as an unprivileged user. Endpoints:

- `/api/health`: status and data provenance
- `/api/projects`: project summaries
- `/api/projects/clients`: one project's fictional records
- `/api/analysis/clients`: a fixed, read-only SQL aggregation

All project IDs use the same routes. The API does not accept arbitrary SQL or write records. The container is an optional deployment artifact; it has not been provisioned on a cloud account. The built-in Python server is intended for the portfolio demonstration, not as a general production application server.

## Personalisation

Arpan's name is in `tools/build_pages.py`. Add the final professional email and LinkedIn URL to the contact section there, then rebuild the pages. No email address or LinkedIn profile was invented. The current contact action opens the provided GitHub profile. Use the homepage's print action to save a recruiter-friendly profile as PDF.

## Design and accessibility

Deep navy, sea-glass green and restrained contour lines establish the ocean direction. Navigation is progressive: personal introduction, role-based selected work, complete portfolio, then detailed workspaces. The site includes keyboard focus states, labelled controls, a skip link, modal close controls, reduced-motion support, responsive layouts and print styles. Charts use record counts or clearly labelled amounts. The case-study pages make synthetic data explicit.

## Validation

`python tools/check_site.py` checks the newly authored pages, local resource links, dataset counts and reproducible Python/SQL analysis. `node --check assets/app.js` checks browser JavaScript syntax. The Excel workbooks were exported and visually reviewed with their linked summary formulas. Live Google Sheets have not been created; the Excel and CSV files can be imported later into the owner's chosen account.

Font: IBM Plex Sans, SIL Open Font License (see `assets/FONT-LICENSE.txt`).
