# SiteSketch

SiteSketch is a browser-based construction plan editor built with React, TypeScript, Vite, and Konva. The source is split by responsibility: the drawing model and snap geometry live in `src/model.ts`, the canvas and inspector are separate components, and import/export helpers are in `src/io`.

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Create a production build with `npm run build`.

## Drawing tools

- Lines, dashed lines, rectangles, circles, dimension lines, and notes
- Grid snapping and snapping to nearby linework, corners, and circle edges
- Editable line lengths in decimal feet or feet-and-inches notation; changing a measurement updates the geometry
- Line and dashed-line tools stay active after each segment, so consecutive segments connect at their shared endpoints
- Select and move, undo/redo, zoom/pan, autosave, SVG/PNG export, and JSON import/export
- Use the scale setting to choose how far apart the snap grid squares are
- On iPad, drag with a finger or Apple Pencil to draw. In Select mode, drag an item to move it or drag the background to pan. Use two fingers to pan and pinch-zoom.

The canvas uses pointer events and reserves the browser safe areas for iPad layouts. Test Apple Pencil behavior on the target iPad and iPadOS version before relying on it in production; desktop browser checks cannot certify device-specific stylus and palm-rejection behavior.

Plans are saved in the current browser. If a `job_id` is present in the URL, that job gets its own local browser save. The app can be linked from One Click Contractors' Design Tools page after it has been hosted at a public HTTPS address. It displays supported job/customer query parameters, but does not connect to a private One Click API or save records back to One Click.
