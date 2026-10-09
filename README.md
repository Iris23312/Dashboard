# Wind optimisation dashboard

## Run in VS Code

Install Node.js 22.13 or newer. Open the extracted folder containing `package.json`:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. Stop with Ctrl+C. If PowerShell blocks npm.ps1, use `npm.cmd` instead of `npm`.

For production: `npm run build`, then `npm start`. To use a different port in PowerShell, set `$env:PORT="5174"` before starting. Run one variant at a time, or use different ports.

## Two versions

- **Base:** shows Selected 1, optional Selected 2 and the best recorded Base. An unselected second column is absent, including in relationship tables and result cards.
- **Two:** if only one time has been selected, choose **Use Base** or **Choose another time** when starting a comparison. If two explicit selections already exist, comparison opens directly without this question. The latter returns to the gap chart to pick the second selection. There is no automatic third result. A time exactly equal to the best result's discovery time is labelled **Base** and uses the reserved green colour in every view. The same Base is never duplicated as a third column.

The only functional variant switch is `INCLUDE_BEST_BASE` in `src/config.ts`.

## Visual encoding

| Meaning                            | Encoding                                                          |
| ---------------------------------- | ----------------------------------------------------------------- |
| Ordinary selected time / grids     | Purple `#7851b8`; green `#147d64` only at the Base discovery time |
| Selected 1                         | Purple `#7851b8`                                                  |
| Selected 2                         | Orange `#b95412`                                                  |
| Base                               | Green `#147d64`                                                   |
| Shared path                        | One line alternating its owners’ colours                          |
| Shared node                        | Two/three coloured sectors; hollow branches retain a white centre |
| Shared grid                        | Two/three equal-width colour bands                                |
| Unselected grid                    | Light grey `#e9edf1`                                              |
| Branch ≤ bound                     | Hollow circle                                                     |
| Branch ≥ bound                     | Filled circle                                                     |
| Branch not exported                | Diamond; shown in legend only when present                        |
| Incumbent not recorded in this row | Diagonal slash across the node                                    |
| Root                               | Additional outline and Root label                                 |

A null incumbent is missing data, not an infeasible node or a claim that the solver had no incumbent. Node fill describes the branch, not result quality. No alert/red/green status is invented.

Map and matrix call the same categorical band renderer. The exact owner combination and its count appear in the legend. Band widths encode membership only; they are not proportions of capacity or objective contribution. Each comparison result has one stable role colour across the comparison tabs. After leaving comparison, ordinary viewing uses purple unless the selected time is Base, when it uses green. **Colour represents selection membership, not the magnitude of t_w.** Clicking a grid exposes its exact cell_id, t_w, b_w, latitude and longitude. Clicking a shared grid shows separate columns with every source result's values and its exact membership, rather than an artificial averaged or merged capacity. Shared means present in at least two of the displayed results; the record specifies which ones.

The focus view uses a monotone spacing transform over the complete D3 tree: it allocates room to selected paths while preserving node order, depth and every parent link. Layout distances are not elapsed time or objective distance. Small highlighted glyphs adapt to the closest visible selected nodes. **Fit tree** returns to the original D3 coordinates. Zoom percentages are relative to the fitted layout, avoiding enormous percentages caused by full-tree compression. Full-tree fit cannot make hundreds of thousands of nodes individually readable; zooming remains necessary.
