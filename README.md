# TRACE — Site Drawings

TRACE is a browser-based site and construction plan editor by Ryan Horan. It uses React, TypeScript, Vite, and Konva. The drawing model and snapping logic live in `src/model.ts`; the canvas and properties inspector live in `src/components`; and the import and export helpers live in `src/io`.

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Run `npm test` for the tests and `npm run build` for a production build.

## Deployment

The GitHub Actions workflow tests and builds the app, then deploys it to GitHub Pages when `main` is pushed. It can also be run manually from the Actions tab. The repository's Pages source must be set to **GitHub Actions**. The expected address is [horanryan.github.io/SiteDrawings](https://horanryan.github.io/SiteDrawings/).

## Drawing and editing

- Use Line, Dashed, Dimension, Arrow, Note, or Freehand from the tool rail. Arrow is an annotation: drag from its tail toward the point you want to indicate; it does not display a measurement.
- Place a note on the canvas and type immediately. Text wraps inside the note box; Enter starts a new line. After editing, the box grows taller if needed to show the text. Tap Done, click away, or press Ctrl+Enter (Command+Enter on a Mac) to save, or Escape to cancel an edit. Click a note in Select or Note mode to edit it again. With Select active, drag inside the note to move it, or drag its lower-right handle to resize it. The box always grows to show all its text, including in exports.
- Open Shapes for rectangle, circle, triangle, diamond, pentagon, hexagon, octagon, or star. Draw by dragging on the canvas. A circle is drawn from its center to its radius; other shapes use the dragged bounds.
- New rectangles and polygons become independently editable line segments. One Undo removes all segments created by a single shape. Existing saved rectangle objects remain editable as rectangles.
- Layers is closed by default; open it from the tool rail or press Y. On smaller screens, open and close Properties from its tool-rail button. The Layers panel lists drawing elements. Select a layer to edit it. Turn on Multi-select to select more with touch, or Ctrl-click (Command-click on a Mac), and use the panel controls to reorder, duplicate, or delete selected items. Change a selected element's layer name in Properties. Layers currently do not support hiding or locking.
- Use Ctrl+D (Command+D on a Mac) to duplicate selected elements, Ctrl+A (Command+A) to select all, Delete to remove the selection, and Ctrl+Z / Ctrl+Y (or the corresponding Mac shortcuts) to undo / redo. The collapsible Quick Guide in Properties lists all tool and editing shortcuts; press G to open or close it. Press B for Shapes, E for Export, + or - to zoom, and 0 to fit the drawing.
- Grid and object snapping help connect linework. Object snap takes priority near existing geometry. In Select mode, dragging a line endpoint also moves connected line endpoints; arrow endpoints move independently. With a mouse, drag a selection box on empty canvas to select intersecting objects, or Ctrl-drag to add to the selection. On touchscreens, use Multi-select instead.
- The editor prevents new collinear linework from overlapping an existing line. To remove a duplicate already in an older plan, select the line away from its endpoint and delete the top item; the other remains.
- Connected endpoints and crossings divide line measurements into sections. Use Overall dimensions to show full lengths as well. Measurements are displayed to the nearest 1/32 inch and can be entered as decimal feet or feet and inches, including fractional inches. The grid spacing sets the snap interval; stored geometry retains its full precision.
- Switch between light and dark appearance using the header button. The preference is stored in the browser. Dark mode adjusts the canvas display for contrast; exports use the saved drawing colors.
- On iPad and other touchscreens, drag with a finger or Apple Pencil to draw. In Select mode, use Multi-select and tap objects or layers to select several; the canvas toolbar provides Select all, Duplicate, and Delete buttons. In Select mode, drag an item to move it or the background to pan. Use two fingers to pan and pinch-zoom. Test Apple Pencil and palm rejection on the target device and iPadOS version before relying on them in production.

## Workflow drawings

Use the **Site sketch / Workflow** switch above the canvas to move between separate browser-local workspaces. Draw a shape and type its label, double-click an existing shape to edit its text, or select it and start typing to replace the label. The Properties panel controls its font, size, alignment, color, and fill. Drag the square handle to resize it. Draw connectors from one shape edge to another to attach them; endpoints follow the shapes as they move or resize. Select a connector and drag its square handle to bend it, or drag an endpoint away to detach it. Each workspace saves independently and has its own drawing data and export options.

## Saving and sharing

Use **Reset** to permanently clear the current drawing and its undo history after confirmation. This cannot be undone; export drawing data first if you need a backup. Reset affects only the current browser-local drawing or job.

Plans are saved in the current browser on the current device. They are not automatically shared between devices or stored on GitHub. Use **Export → Drawing data** to back up or transfer a plan, and **Import drawing** to restore a JSON file. The app also exports SVG, PNG, and landscape-letter PDF. JSON imports are limited to 10 MB, 1,000 items, and bounded freehand point counts. Browser storage is tied to the site origin, so a plan saved on a different host or port will not automatically appear on GitHub Pages.

TRACE retains the previous SiteSketch browser-storage key so existing browser-local plans on the same origin remain available. Older plans without layer names receive readable names when opened. Newly saved plans can include arrow annotations and layer names; use the current app when opening those files.

When embedding the app, use an opaque `job_id` query parameter only. Do not put customer names, email addresses, credentials, or other personal information in URLs; query strings may be recorded in browser history and server logs. The app removes known customer-detail parameters from the address bar and sends a `no-referrer` policy, but this cannot undo exposure to the server that handled the initial request. Drawings remain browser-local and are not protected by a backend authorization layer.

## Copyright and usage

© 2026 Ryan Horan. All rights reserved. See [COPYRIGHT.md](COPYRIGHT.md) for usage details.
