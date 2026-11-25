# 18D (SOT App)

Deterministic parametric CAD & watertight `manifold-3d` solid-modeling workbench under `%SOT_ROOT%\apps\18d`.

## Launch & Verify
- **Run server:** `Setups\mcp\bin\18d.cmd` (or `npm run dev` → `http://localhost:3000`)
- **Deterministic geometry gate:** `npm run test:geom` (verifies math primitives, watertightness across all blueprints, and SOT Z-up/inch OpenUSD export)
- **Type-check & build:** `npm run build` (`tsc --noEmit && vite build --configLoader native`)

## SOT Integration
- **CLI-first workflow:** All builds and modifications run via the built-in **CLI** drawer (`agy.exe`, localhost-only `/api/agy/*`), supporting pasted/dropped screenshot markups and viewport captures.
- **SOT OpenUSD export:** `Export → SOT OpenUSD (.usda — Z-up, Inches)` writes `upAxis = "Z"`, `metersPerUnit = 0.0254`, front `-Y`, floor `z = 0`, `primvars:st` UVs, and dual `UsdPreviewSurface` + `OmniPBR` materials.
- **NEC Labels & Decals:** Served directly from `%SOT_ROOT%\Setups\rules\decals.json` (`/api/sot/decals`, `/api/sot/decal-textures/*`).
