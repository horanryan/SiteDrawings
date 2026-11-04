# SiteSketch

SiteSketch is a browser-based construction plan editor built with React, TypeScript, Vite, and Konva. The source is split by responsibility: the drawing model and snap geometry live in `src/model.ts`, the canvas and inspector are separate components, and import/export helpers are in `src/io`.

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Create a production build with `npm run build`.

## GitHub Pages

In the repository's **Settings → Pages**, set the build source to **GitHub Actions**. Pushing to `main` then runs the tests, builds the app, and publishes it. You can also run the deployment workflow manually from the Actions tab. For this repository the expected address is `https://horanryan.github.io/SiteDrawings/`.

Plans are stored in each browser on each device, not on GitHub or shared between devices. Export drawing data as JSON to transfer or back up a plan. A browser's existing local drawings on a different host or port will not automatically appear on GitHub Pages.

When embedding the app, use an opaque `job_id` query parameter only. Do not put customer names, email addresses, credentials, or other personal information in URLs; query strings may be recorded in browser history and server logs. The app removes known customer-detail parameters from the address bar and sends a `no-referrer` policy, but this cannot undo exposure to the server that handled the initial request. Drawings remain browser-local and are not protected by a backend authorization layer.

## Drawing tools

- Lines, dashed lines, rectangles, circles, dimension lines, and notes
- New rectangles become four separately selectable lines; undo removes the entire newly drawn rectangle in one step. Existing saved rectangles remain editable as rectangles.
- Freehand strokes with a finger, Apple Pencil, or mouse; select a stroke to move, recolor, or delete it
- Grid snapping and snapping to nearby linework, corners, and circle edges
- Object snap takes priority near linework, even with grid snap enabled. Connected endpoints and crossings divide displayed line measurements into sections; use Overall dimensions to show the full lengths too.
- Nearby line measurement labels are repositioned to reduce overlap on the canvas and in PDF, PNG, and SVG exports. Automatic overall dimensions are off by default and follow the toolbar toggle in those exports; manually drawn dimensions remain visible.
- Editable line lengths in decimal feet or feet-and-inches notation; changing a measurement updates the geometry
- Line and dashed-line tools stay active after each segment; start the next line where you press, with object snap available to connect to existing linework
- Select and move, undo/redo, zoom/pan, autosave, PDF/SVG/PNG export, and JSON import/export
- Ctrl-click (or Command-click on a Mac) to add or remove items from the selection; Delete removes all selected items
- In Select mode, drag a box from an empty area to select items it touches; Ctrl-drag adds to the current selection
- In Select mode, select one line and drag either endpoint handle to reposition it; connected line endpoints follow the joint, and grid and object snapping apply
- PDF exports use landscape letter pages and fit the whole drawing without changing its proportions
- JSON imports are limited to 10 MB, 1,000 items, and bounded freehand point counts to protect the browser from oversized files
- Use the scale setting to choose how far apart the snap grid squares are
- On iPad, drag with a finger or Apple Pencil to draw. In Select mode, drag an item to move it or drag the background to pan. Use two fingers to pan and pinch-zoom.

The canvas uses pointer events and reserves the browser safe areas for iPad layouts. Test Apple Pencil behavior on the target iPad and iPadOS version before relying on it in production; desktop browser checks cannot certify device-specific stylus and palm-rejection behavior.

## Copyright and usage

© 2026 Ryan Horan. All rights reserved. See [COPYRIGHT.md](COPYRIGHT.md) for usage details.
