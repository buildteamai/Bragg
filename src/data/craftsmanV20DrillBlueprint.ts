import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * CRAFTSMAN V20 20V MAX 1/2" Cordless Drill/Driver (CMCD700 + CMCB202 2.0Ah Pack)
 * Precision pixel-calibrated watertight CAD reconstruction from /assets/aistudio/image_6e7cabdf.jpeg.
 *
 * Calibrated Master Coordinate System (mm, directly measured from side elevation):
 * - Ground plane: Y = 0.0 mm (battery rubber bumper pads flush on ground)
 * - Spindle axis: Y = 191.2 mm, Z = 0.0 mm (pointing toward -X)
 * - Total Length (X): -92.5 mm (chuck jaw tips) .. +92.5 mm (rear bumper cap) = 185.0 mm
 * - Total Height (Y): 0.0 mm (feet) .. 225.0 mm (top 2-speed switch) = 225.0 mm
 * - Total Width  (Z): -37.0 mm .. +37.0 mm (V20 battery casing) = 74.0 mm
 */

const SPINDLE_Y = 191.2;

const MAT_CRAFTSMAN_RED: PartMaterialSpec = {
  colorHex: '#e21b22',
  metalness: 0.06,
  roughness: 0.35,
  clearcoat: 0.24,
  clearcoatRoughness: 0.26,
  finishName: 'Craftsman Crimson Glass-Filled Nylon',
};

const MAT_CRAFTSMAN_RED_LOGO: PartMaterialSpec = {
  colorHex: '#ffffff',
  metalness: 0.05,
  roughness: 0.34,
  clearcoat: 0.22,
  textureKind: 'craftsmanLogo',
  finishName: 'Craftsman Silkscreened Clamshell Panel',
};

const MAT_CHARCOAL_OVERMOLD: PartMaterialSpec = {
  colorHex: '#22252b',
  metalness: 0.04,
  roughness: 0.82,
  textureKind: 'rubberOvermold',
  finishName: 'Textured TPE Rubber Overmold',
};

const MAT_MATTE_POLYMER: PartMaterialSpec = {
  colorHex: '#1f2329',
  metalness: 0.1,
  roughness: 0.52,
  finishName: 'Matte Black Nylon 6/6 Housing',
};

const MAT_SATIN_GREY_SWITCH: PartMaterialSpec = {
  colorHex: '#808690',
  metalness: 0.08,
  roughness: 0.44,
  finishName: 'Molded Satin Grey ABS Control',
};

const MAT_CLUTCH_DIAL: PartMaterialSpec = {
  colorHex: '#ffffff',
  metalness: 0.1,
  roughness: 0.48,
  textureKind: 'clutchDialRing',
  finishName: 'Pad-Printed Torque Index Collar',
};

const MAT_V20_BADGE: PartMaterialSpec = {
  colorHex: '#ffffff',
  metalness: 0.08,
  roughness: 0.38,
  textureKind: 'craftsmanV20Badge',
  finishName: 'V20 2.0Ah Lithium-Ion Spec Decal',
};

const MAT_BLACK_OXIDE_CHUCK: PartMaterialSpec = {
  colorHex: '#1d2026',
  metalness: 0.36,
  roughness: 0.46,
  finishName: 'Black Oxide / Ribbed Keyless Chuck Sleeve',
};

const MAT_CHROME_STEEL: PartMaterialSpec = {
  colorHex: '#d5dce4',
  metalness: 0.94,
  roughness: 0.16,
  textureKind: 'brushedMetal',
  finishName: 'Precision Ground Chrome-Moly Steel',
};

const MAT_HARDENED_JAW: PartMaterialSpec = {
  colorHex: '#b4bec9',
  metalness: 0.9,
  roughness: 0.24,
  textureKind: 'brushedMetal',
  finishName: 'Hardened Carbide-Tipped Steel Chuck Jaws',
};

const MAT_LED_LENS: PartMaterialSpec = {
  colorHex: '#f8fafc',
  metalness: 0.05,
  roughness: 0.12,
  emissiveHex: '#fffbeb',
  emissiveIntensity: 0.45,
  finishName: 'Frosted Polycarbonate LED Worklight Lens',
};

/**
 * Sculpted ergonomic pistol grip, overhanging trigger hood, beaver-tail palm saddle,
 * and diagonal rear motor-wrap collar — built via exact manifold-3d CSG intersection of:
 *   1. Exact millimeter-traced side silhouette (polygonExtrude along Z)
 *   2. Multi-stage rounded 3D ergonomic palm & collar thickness envelope (Z-contour)
 * Guarantees an exact photo-matched side profile AND smooth rounded 3D ergonomics in Z.
 */
function buildSculptedHandleCsg(): CsgNodeSpec {
  // Exact side profile in world (X, Y) coordinates (local origin at [0, 0, 0])
  const sideSilhouette: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 56,
    polygonPoints: [
      // Bottom foot junction (sits 0.2 mm above drill_base_foot top Y=57.8)
      [5.5, 58.0],
      [63.5, 58.0],
      // Lower ankle & rear palm swell rising cleanly along +X
      [60.5, 64.0],
      [58.4, 70.0],
      [57.8, 78.0],
      [58.6, 88.0],
      [58.8, 96.0],
      [57.4, 106.0],
      [55.2, 115.0],
      [52.6, 124.0],
      [50.6, 134.0],
      [50.4, 142.0],
      // Sweeping rear beaver-tail curving back under the motor housing
      [53.4, 150.0],
      [60.8, 156.5],
      [73.5, 162.5],
      [73.8, 173.2],
      // Upper black saddle wrap seam beneath red motor housing (exact chevron/step)
      [51.5, 173.2],
      [36.0, 165.4],
      [22.0, 165.4],
      [14.0, 168.0],
      [-12.0, 168.0],
      // Forward overhanging trigger hood brow under clutch ring
      [-19.2, 164.0],
      [-20.2, 160.0],
      [-19.0, 156.2],
      [-17.8, 155.4],
      // Recessed concave trigger cavity pocket right behind the crimson bezel & grey trigger
      [5.4, 154.4],
      [7.4, 149.0],
      [8.0, 143.0],
      [7.4, 136.0],
      [5.2, 129.0],
      // Slender front finger contour descending to foot flare
      [11.4, 124.5],
      [12.8, 117.0],
      [13.8, 108.0],
      [16.2, 100.0],
      [19.2, 92.0],
      [21.6, 84.0],
      [22.2, 75.0],
      [20.2, 68.0],
      [11.0, 62.5],
    ],
  };

  // Smooth 3D ergonomic rounding envelope in Z:
  // - Base foot skirt: rounded 44 mm width (Y=56..70)
  // - Slender rounded palm shaft: elliptical ~34 mm thickness sweeping along the handle spine
  // - Upper trigger hood & motor saddle: beveled 44 mm thickness tapering forward to 33 mm at hood
  const palmCoreHull: CsgNodeSpec = {
    op: 'hull',
    children: [
      { op: 'cylinder', radius: 22.0, height: 10, radialSegments: 24, translateMm: [35, 62, 0] },
      { op: 'cylinder', radius: 17.6, height: 22, radialSegments: 24, translateMm: [39, 84, 0] },
      { op: 'cylinder', radius: 18.0, height: 24, radialSegments: 24, translateMm: [35, 108, 0] },
      { op: 'cylinder', radius: 18.4, height: 20, radialSegments: 24, translateMm: [29, 132, 0] },
    ],
  };

  // Wider front-to-back rounded grip core so front/rear edges aren't pinched by cylinder radius alone
  const gripDepthLoft: CsgNodeSpec = {
    op: 'hull',
    children: [
      { op: 'box', width: 64, height: 12, depth: 36, translateMm: [34, 63, 0] },
      { op: 'box', width: 46, height: 24, depth: 26, translateMm: [39, 86, 0] },
      { op: 'box', width: 48, height: 26, depth: 26, translateMm: [34, 112, 0] },
      { op: 'box', width: 52, height: 22, depth: 27, translateMm: [28, 136, 0] },
    ],
  };

  // Smoothly tapered upper trigger hood + motor saddle (Y=144..175):
  // Narrows ergonomically toward the forward trigger hood nose (depth 33 mm),
  // stays cleanly at 41 mm under the fwd/rev shuttle (Y=161), and flares to 48 mm at the motor saddle.
  const upperSaddleEnvelope: CsgNodeSpec = {
    op: 'union',
    children: [
      {
        op: 'hull',
        children: [
          { op: 'box', width: 52, height: 10, depth: 28, translateMm: [28, 146, 0] },
          { op: 'box', width: 72, height: 12, depth: 39, translateMm: [40, 158, 0] },
          { op: 'box', width: 92, height: 10, depth: 45, translateMm: [30, 169, 0] },
          { op: 'box', width: 88, height: 8, depth: 48, translateMm: [31, 172, 0] },
        ],
      },
      // Tapered forward trigger hood overhang (X = -22..+26, Y = 153..169)
      {
        op: 'hull',
        children: [
          { op: 'box', width: 22, height: 13, depth: 33, translateMm: [-12, 161.0, 0] },
          { op: 'box', width: 28, height: 15, depth: 39, translateMm: [14, 161.5, 0] },
        ],
      },
    ],
  };

  const ergonomicZVolume: CsgNodeSpec = {
    op: 'union',
    children: [palmCoreHull, gripDepthLoft, upperSaddleEnvelope],
  };

  return {
    op: 'intersect',
    children: [sideSilhouette, ergonomicZVolume],
  };
}

/**
 * Signature crimson C-shaped bezel collar framing the upper overhang (Y=153.6..156.2) &
 * rear curve of the grey trigger (X=3.6..8.4, Y=128.5..154).
 * Contoured +0.8 mm proud of the handle cheeks in Z so it reads razor-sharp from side and 3/4 views.
 */
function buildTriggerRedBezelCsg(): CsgNodeSpec {
  const sideBezel: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 44,
    polygonPoints: [
      [-18.2, 156.0],
      [4.5, 155.8],
      [6.8, 152.5],
      [8.2, 147.0],
      [8.5, 141.5],
      [7.8, 136.0],
      [6.6, 131.5],
      [5.2, 128.4],
      [3.4, 129.4],
      [4.6, 132.8],
      [5.5, 137.0],
      [5.9, 142.5],
      [5.5, 148.0],
      [3.8, 152.0],
      [1.2, 153.6],
      [-17.4, 153.8],
    ],
  };

  // Tapered Z envelope proud of the handle cheek (+0.8 mm on ±Z along both rear arc and upper hood lip)
  const bezelZContour: CsgNodeSpec = {
    op: 'hull',
    children: [
      { op: 'box', width: 12, height: 14, depth: 31.2, translateMm: [6.0, 135.5, 0] },
      { op: 'box', width: 12, height: 10, depth: 35.6, translateMm: [6.0, 148.5, 0] },
      { op: 'box', width: 32, height: 4.5, depth: 37.2, translateMm: [-5.5, 155.0, 0] },
    ],
  };

  return {
    op: 'intersect',
    children: [sideBezel, bezelZContour],
  };
}

/**
 * Exact sculpted ergonomic concave grey variable-speed trigger matching photo pixel trace:
 * Upper forward lip (-14.2, 152.8) -> concave finger trough (-7.8, 142.0) -> lower tip (-9.3, 131.2),
 * nestled cleanly with 0.3 mm clearance inside the crimson C-bezel.
 */
function buildTriggerCsg(): CsgNodeSpec {
  const triggerBody: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 17.4,
    polygonPoints: [
      [-8.0, 129.6],
      [2.6, 130.6],
      [4.2, 133.5],
      [5.2, 138.5],
      [5.5, 143.5],
      [4.9, 148.5],
      [2.8, 152.2],
      [-14.2, 153.2],
      [-11.6, 151.0],
      [-9.2, 148.6],
      [-8.0, 145.5],
      [-7.7, 141.5],
      [-8.1, 137.0],
      [-9.0, 133.5],
      [-9.3, 131.2],
    ],
  };

  // Finger-contoured 3D chamfer: narrower across the front finger pad, widening toward the pivot body
  const zContour: CsgNodeSpec = {
    op: 'hull',
    children: [
      { op: 'box', width: 7, height: 22.0, depth: 13.0, translateMm: [-11.0, 141.5, 0] },
      { op: 'box', width: 12, height: 23.0, depth: 15.8, translateMm: [-0.2, 141.5, 0] },
      { op: 'box', width: 18, height: 25.0, depth: 14.0, translateMm: [-4.5, 141.5, 0] },
    ],
  };

  return {
    op: 'intersect',
    children: [triggerBody, zContour],
  };
}

/**
 * Red clamshell motor housing in manifold-3d WASM with real Boolean-subtracted horizontal
 * cooling intake louvers on both flanks and recessed clamshell screw pockets.
 * Local center at (X=+39.5, Y=191.2, Z=0); spans world X=[+4.7 .. +74.0], Y=[165.8 .. 220.0].
 */
function buildMotorHousingCsg(): CsgNodeSpec {
  // Exact side silhouette matching the photo's chevron bottom & chamfered upper motor profile
  // Local coordinates relative to (X=+39.5, Y=191.2)
  const mainBody: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 56,
    polygonPoints: [
      [-34.8, -22.8], // X=4.7, Y=168.4 (front bottom meeting collar)
      [-17.5, -25.4], // X=22.0, Y=165.8 (signature front lower dip)
      [-3.5, -25.4],  // X=36.0, Y=165.8
      [12.0, -17.6],  // X=51.5, Y=173.6 (diagonal step above black rear wrap)
      [34.5, -17.6],  // X=74.0, Y=173.6 (rear red bottom)
      [34.5, 25.0],   // X=74.0, Y=216.2
      [29.5, 28.8],   // X=69.0, Y=220.0 (top rear chamfer)
      [-28.5, 28.8],  // X=11.0, Y=220.0 (top front chamfer)
      [-34.8, 24.0],  // X=4.7, Y=215.2
    ],
  };

  // Raised cheek pad carrying the white CRAFTSMAN branding on +Z and -Z
  const cheekPad: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 58.4,
    polygonPoints: [
      [-28.0, -14.0],
      [14.0, -14.0],
      [14.0, 18.0],
      [-28.0, 18.0],
    ],
  };

  // 7 real Boolean-subtracted horizontal rear cooling intake louvers on +Z and -Z
  const ventCutters: CsgNodeSpec[] = [];
  const slotYs = [21, 15.5, 10, 4.5, -1, -6.5, -12];
  for (let i = 0; i < slotYs.length; i++) {
    const sy = slotYs[i];
    const sw = i === 0 || i === slotYs.length - 1 ? 9.5 : 11.5;
    ventCutters.push({
      op: 'box',
      width: sw,
      height: 2.6,
      depth: 13,
      translateMm: [24.5, sy, 25],
    });
    ventCutters.push({
      op: 'box',
      width: sw,
      height: 2.6,
      depth: 13,
      translateMm: [24.5, sy, -25],
    });
  }

  // Signature dark vertical screw pockets above and below the Craftsman wordmark
  ventCutters.push(
    { op: 'cylinder', radius: 2.6, height: 12, radialSegments: 16, translateMm: [-7, 20.5, 27], rotateDeg: [90, 0, 0] },
    { op: 'cylinder', radius: 2.6, height: 12, radialSegments: 16, translateMm: [-7, -15.5, 27], rotateDeg: [90, 0, 0] },
    { op: 'cylinder', radius: 2.6, height: 12, radialSegments: 16, translateMm: [-7, 20.5, -27], rotateDeg: [90, 0, 0] },
    { op: 'cylinder', radius: 2.6, height: 12, radialSegments: 16, translateMm: [-7, -15.5, -27], rotateDeg: [90, 0, 0] }
  );

  return {
    op: 'subtract',
    children: [
      {
        op: 'union',
        children: [mainBody, cheekPad],
      },
      ...ventCutters,
    ],
  };
}

/**
 * Knurled 23-position clutch torque collar along X (length 13.6 mm, OD 51.4 mm)
 * with 16 raised radial grip lugs in manifold-3d WASM.
 */
function buildClutchTorqueCollarCsg(): CsgNodeSpec {
  const core: CsgNodeSpec = {
    op: 'cylinder',
    radiusTop: 24.4,
    radiusBottom: 25.0,
    height: 13.6,
    radialSegments: 36,
    rotateDeg: [0, 0, 90],
  };

  const lugs: CsgNodeSpec[] = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 24.5;
    lugs.push({
      op: 'box',
      width: 11.8,
      height: 2.9,
      depth: 2.8,
      translateMm: [0, Math.sin(a) * r, Math.cos(a) * r],
      rotateDeg: [(i / count) * 360, 0, 0],
    });
  }

  return {
    op: 'union',
    children: [core, ...lugs],
  };
}

/**
 * 1/2" keyless ratcheting chuck sleeve along X (world X = -77.3 .. -33.5 => length 43.8 mm)
 * Rear ribbed cylinder (Ø 40.0 mm) + smooth front nose taper (Ø 40 -> 24 mm) + 24 grip splines.
 */
function buildKeylessChuckSleeveCsg(): CsgNodeSpec {
  const rearCyl: CsgNodeSpec = {
    op: 'cylinder',
    radiusTop: 19.6,
    radiusBottom: 20.0,
    height: 28.8,
    radialSegments: 36,
    translateMm: [7.5, 0, 0],
    rotateDeg: [0, 0, 90],
  };

  const frontCone: CsgNodeSpec = {
    op: 'cylinder',
    radiusTop: 11.8,
    radiusBottom: 19.6,
    height: 15.0,
    radialSegments: 36,
    translateMm: [-14.4, 0, 0],
    rotateDeg: [0, 0, 90],
  };

  const ribs: CsgNodeSpec[] = [];
  const ribCount = 24;
  for (let i = 0; i < ribCount; i++) {
    const a = (i / ribCount) * Math.PI * 2;
    const r = 19.7;
    ribs.push({
      op: 'box',
      width: 25.8,
      height: 1.4,
      depth: 1.5,
      translateMm: [7.5, Math.sin(a) * r, Math.cos(a) * r],
      rotateDeg: [(i / ribCount) * 360, 0, 0],
    });
  }

  return {
    op: 'union',
    children: [rearCyl, frontCone, ...ribs],
  };
}

/**
 * Precision beveled hardened-steel chuck jaw protruding forward along -X (world X = -92.5 .. -81.5),
 * centered on spindle axis (Y=191.2, Z=0) and arrayed symmetrically at 0°, 120°, 240°.
 */
function buildChuckJawPart(index: number, angleDeg: number): BlueprintPart {
  const rad = (angleDeg * Math.PI) / 180;

  return {
    id: `chuck_jaw_${index + 1}`,
    name: `Hardened Steel Chuck Jaw #${index + 1}`,
    group: '1/2" Keyless Chuck Assembly',
    role: 'secondary',
    fitClass: 'sliding',
    positionMm: [-87.0, SPINDLE_Y, 0],
    rotationDeg: [angleDeg, 0, 0],
    ports: {
      rearAxis: {
        localOffsetMm: [5.5, 0, 0],
        normal: [-1, 0, 0],
      },
    },
    mates: [
      {
        kind: 'coincident',
        selfPort: 'rearAxis',
        targetPartId: 'chuck_sleeve_barrel',
        targetPort: 'frontAxis',
        flipNormal: false,
        offsetMm: [-4.2, 0, 0],
        jointKind: 'fixed',
      },
    ],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 3.8,
        translateMm: [0, 3.8, 0],
        polygonPoints: [
          [-5.5, -2.5],
          [5.4, -1.2],
          [5.4, 4.2],
          [-5.5, 0.5],
        ],
      },
    },
    material: MAT_HARDENED_JAW,
    explodeOffsetMm: [-84, Math.cos(rad) * 14, Math.sin(rad) * 14],
    toleranceMm: 0.04,
  };
}

const parts: BlueprintPart[] = [
  // =========================================================================
  // 1. V20 2.0Ah LITHIUM-ION BATTERY PACK (Grounded flush at Y = 0)
  // =========================================================================
  {
    id: 'battery_bottom_bumper',
    name: 'V20 Battery Rubberized Base Bumper',
    group: 'V20 2.0Ah Battery Pack',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [18.0, 6.5, 0],
    rotationDeg: [0, 0, 0],
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 70,
        polygonPoints: [
          [-45.0, -6.5],
          [-12.0, -6.5],
          [-8.0, -4.4],
          [16.0, -4.4],
          [20.0, -6.5],
          [45.5, -6.5],
          [53.8, -1.0],
          [56.8, 2.5],
          [56.8, 6.5],
          [-56.8, 6.5],
          [-56.8, 2.5],
          [-53.5, -1.0],
        ],
      },
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [0, -55, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'battery_v20_badge_front',
    name: 'V20 2.0Ah Spec Badge (Left Flank)',
    group: 'V20 2.0Ah Battery Pack',
    role: 'detail',
    positionMm: [24.0, 10.5, 35.4],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 68, height: 10.8, depth: 0.8 },
    },
    material: MAT_V20_BADGE,
    explodeOffsetMm: [0, -45, 22],
    toleranceMm: 0.1,
  },
  {
    id: 'battery_v20_badge_rear',
    name: 'V20 2.0Ah Spec Badge (Right Flank)',
    group: 'V20 2.0Ah Battery Pack',
    role: 'detail',
    positionMm: [24.0, 10.5, -35.4],
    rotationDeg: [0, 180, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 68, height: 10.8, depth: 0.8 },
    },
    material: MAT_V20_BADGE,
    explodeOffsetMm: [0, -45, -22],
    toleranceMm: 0.1,
  },
  {
    id: 'battery_red_housing',
    name: 'V20 Red Upper Battery Casing',
    group: 'V20 2.0Ah Battery Pack',
    role: 'primary',
    positionMm: [17.1, 24.5, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 74,
        polygonPoints: [
          [-56.0, -11.3],
          [56.0, -11.3],
          [57.8, -7.2],
          [57.8, 3.0],
          [53.0, 11.3],
          [-54.5, 11.3],
          [-57.8, 7.2],
          [-57.8, -7.2],
        ],
      },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, -40, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'battery_logo_front',
    name: 'Battery Craftsman Wordmark (Left)',
    group: 'V20 2.0Ah Battery Pack',
    role: 'detail',
    positionMm: [19.0, 26.5, 37.35],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 72, height: 11.0, depth: 0.6 },
    },
    material: MAT_CRAFTSMAN_RED_LOGO,
    explodeOffsetMm: [0, -35, 22],
    toleranceMm: 0.1,
  },
  {
    id: 'battery_logo_rear',
    name: 'Battery Craftsman Wordmark (Right)',
    group: 'V20 2.0Ah Battery Pack',
    role: 'detail',
    positionMm: [19.0, 26.5, -37.35],
    rotationDeg: [0, 180, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 72, height: 11.0, depth: 0.6 },
    },
    material: MAT_CRAFTSMAN_RED_LOGO,
    explodeOffsetMm: [0, -35, -22],
    toleranceMm: 0.1,
  },
  {
    id: 'battery_front_hump',
    name: 'V20 Front Terminal Nose Casing',
    group: 'V20 2.0Ah Battery Pack',
    role: 'primary',
    positionMm: [-15.0, 50.5, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 60,
        polygonPoints: [
          [-23.5, -14.5],
          [20.2, -14.5],
          [20.2, 14.3],
          [3.0, 14.3],
          [-9.0, 11.0],
          [-16.5, 3.0],
          [-23.5, -5.5],
        ],
      },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [-20, -30, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'battery_release_latch',
    name: 'Battery Pack Front Release Button',
    group: 'V20 2.0Ah Battery Pack',
    role: 'secondary',
    fitClass: 'sliding',
    positionMm: [-37.0, 42.5, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minSlideMm: 0, maxSlideMm: 5 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 36,
        polygonPoints: [
          [-4.2, -5.5],
          [1.8, -5.5],
          [6.5, 5.0],
          [2.0, 7.2],
          [-4.2, 2.5],
        ],
      },
    },
    material: MAT_SATIN_GREY_SWITCH,
    explodeOffsetMm: [-42, -28, 0],
    toleranceMm: 0.12,
  },

  // =========================================================================
  // 2. DRILL LOWER FOOT, BELT-CLIP BOSS & LED WORKLIGHT
  // =========================================================================
  {
    id: 'drill_base_foot',
    name: 'Drill Lower Slide-Rail Foot',
    group: 'Pistol Grip & Controls',
    role: 'primary',
    positionMm: [39.3, 46.9, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 66,
        polygonPoints: [
          [-33.8, -10.9],
          [29.5, -10.9],
          [33.2, -5.5],
          [33.2, 4.5],
          [26.0, 10.9],
          [-33.8, 10.9],
        ],
      },
    },
    material: MAT_MATTE_POLYMER,
    explodeOffsetMm: [0, -18, 0],
    toleranceMm: 0.12,
  },
  {
    id: 'belt_clip_boss_front',
    name: 'Red Belt-Clip Mounting Boss (Left)',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [31.0, 44.5, 33.4],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'subtract',
        children: [
          { op: 'box', width: 19, height: 8.5, depth: 2.2 },
          { op: 'cylinder', radius: 2.1, height: 6, radialSegments: 16, rotateDeg: [90, 0, 0] },
        ],
      },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, -16, 22],
    toleranceMm: 0.1,
  },
  {
    id: 'belt_clip_boss_rear',
    name: 'Red Belt-Clip Mounting Boss (Right)',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [31.0, 44.5, -33.4],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'subtract',
        children: [
          { op: 'box', width: 19, height: 8.5, depth: 2.2 },
          { op: 'cylinder', radius: 2.1, height: 6, radialSegments: 16, rotateDeg: [90, 0, 0] },
        ],
      },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, -16, -22],
    toleranceMm: 0.1,
  },
  {
    id: 'foot_red_vent_trim',
    name: 'Foot Upper Red Vent Trim Accent',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [38.0, 54.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 50, height: 2.2, depth: 67.2 },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, -14, 0],
    toleranceMm: 0.1,
  },
  {
    id: 'led_worklight_lens',
    name: 'Integrated LED Worklight Lens',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [7.2, 62.6, 0],
    rotationDeg: [0, 0, 32],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 5.5, height: 2.4, depth: 12.0 },
    },
    material: MAT_LED_LENS,
    explodeOffsetMm: [-20, -6, 0],
    toleranceMm: 0.1,
  },

  // =========================================================================
  // 3. SCULPTED ERGONOMIC PISTOL GRIP, CONCAVE TRIGGER & DIRECTION SWITCH
  // =========================================================================
  {
    id: 'ergonomic_pistol_grip',
    name: 'Sculpted Overmolded Pistol Grip & Saddle',
    group: 'Pistol Grip & Controls',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    ports: {
      triggerBay: { localOffsetMm: [5.5, 141.5, 0], normal: [1, 0, 0] },
      fwdRevAxis: { localOffsetMm: [14.2, 161.3, 0], normal: [0, 0, 1] },
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildSculptedHandleCsg(),
      smoothSharpAngleDeg: 44,
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [0, 0, 0],
    toleranceMm: 0.12,
  },
  {
    id: 'grip_red_trigger_bezel',
    name: 'Crimson Curved Trigger Guard Bezel',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildTriggerRedBezelCsg(),
      smoothSharpAngleDeg: 38,
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [-10, 0, 0],
    toleranceMm: 0.1,
  },
  {
    id: 'grip_red_accent_fwdrev',
    name: 'Crimson Direction Switch Accent Line',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [17.8, 155.2, 0],
    rotationDeg: [0, 0, 10],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 12.2, height: 2.0, depth: 42.2 },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, 0, 14],
    toleranceMm: 0.1,
  },
  {
    id: 'grip_red_accent_under_trigger',
    name: 'Crimson Lower Trigger Accent Line',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [16.9, 134.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 10.6, height: 2.0, depth: 35.8 },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, 0, 14],
    toleranceMm: 0.1,
  },
  {
    id: 'grip_red_spine_notch_lower',
    name: 'Rear Grip Red Molding Accent (Lower)',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [50.9, 86.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 6.4, height: 2.2, depth: 34.8 },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [14, 0, 0],
    toleranceMm: 0.1,
  },
  {
    id: 'grip_red_spine_notch_upper',
    name: 'Rear Grip Red Molding Accent (Upper)',
    group: 'Pistol Grip & Controls',
    role: 'detail',
    positionMm: [50.2, 100.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 6.8, height: 2.2, depth: 34.4 },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [14, 0, 0],
    toleranceMm: 0.1,
  },
  {
    id: 'trigger_switch',
    name: 'Variable-Speed Concave Trigger',
    group: 'Pistol Grip & Controls',
    role: 'secondary',
    fitClass: 'sliding',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minSlideMm: 0, maxSlideMm: 7 },
    ports: {
      slideRear: { localOffsetMm: [5.5, 141.5, 0], normal: [1, 0, 0] },
    },
    mates: [
      {
        kind: 'coincident',
        selfPort: 'slideRear',
        targetPartId: 'ergonomic_pistol_grip',
        targetPort: 'triggerBay',
        flipNormal: false,
        jointKind: 'prismatic',
      },
    ],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildTriggerCsg(),
      smoothSharpAngleDeg: 36,
    },
    material: MAT_SATIN_GREY_SWITCH,
    explodeOffsetMm: [-32, 0, 0],
    toleranceMm: 0.08,
  },
  {
    id: 'fwd_rev_selector',
    name: 'Forward / Reverse Push-Button Selector',
    group: 'Pistol Grip & Controls',
    role: 'secondary',
    fitClass: 'sliding',
    positionMm: [14.2, 161.3, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minSlideMm: -5, maxSlideMm: 5 },
    ports: {
      slideCenter: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] },
    },
    mates: [
      {
        kind: 'coincident',
        selfPort: 'slideCenter',
        targetPartId: 'ergonomic_pistol_grip',
        targetPort: 'fwdRevAxis',
        flipNormal: false,
        jointKind: 'prismatic',
      },
    ],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 45.6,
        polygonPoints: [
          [-6.4, -1.5],
          [6.4, -1.5],
          [5.6, 1.9],
          [-5.6, 1.9],
        ],
      },
    },
    material: MAT_SATIN_GREY_SWITCH,
    explodeOffsetMm: [0, 0, 32],
    toleranceMm: 0.08,
  },

  // =========================================================================
  // 4. RED MOTOR CLAMSHELL HOUSING, LOUVERS, 2-SPEED SWITCH & REAR BUMPER
  // =========================================================================
  {
    id: 'motor_housing_red',
    name: 'V20 Motor Clamshell Housing (Boolean Louvers)',
    group: 'Motor & Gearbox Body',
    role: 'primary',
    positionMm: [39.5, SPINDLE_Y, 0],
    rotationDeg: [0, 0, 0],
    ports: {
      topSwitchRail: { localOffsetMm: [-11.5, 29.0, 0], normal: [1, 0, 0] },
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildMotorHousingCsg(),
      smoothSharpAngleDeg: 36,
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, 26, 0],
    toleranceMm: 0.12,
  },
  {
    id: 'internal_motor_stator',
    name: 'Internal Brushed DC Motor Stator Core',
    group: 'Motor & Gearbox Body',
    role: 'detail',
    positionMm: [55.0, SPINDLE_Y + 2, 0],
    rotationDeg: [0, 0, 90],
    geometry: {
      kind: 'cylinder',
      radiusTop: 19,
      radiusBottom: 19,
      height: 28,
      radialSegments: 24,
    },
    material: MAT_MATTE_POLYMER,
    explodeOffsetMm: [24, 26, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'motor_logo_front',
    name: 'Motor Housing Craftsman Logo (Left)',
    group: 'Motor & Gearbox Body',
    role: 'detail',
    positionMm: [32.5, SPINDLE_Y + 2.5, 29.55],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 42, height: 11.0, depth: 0.6 },
    },
    material: MAT_CRAFTSMAN_RED_LOGO,
    explodeOffsetMm: [0, 26, 24],
    toleranceMm: 0.1,
  },
  {
    id: 'motor_logo_rear',
    name: 'Motor Housing Craftsman Logo (Right)',
    group: 'Motor & Gearbox Body',
    role: 'detail',
    positionMm: [32.5, SPINDLE_Y + 2.5, -29.55],
    rotationDeg: [0, 180, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 42, height: 11.0, depth: 0.6 },
    },
    material: MAT_CRAFTSMAN_RED_LOGO,
    explodeOffsetMm: [0, 26, -24],
    toleranceMm: 0.1,
  },
  {
    id: 'speed_selector_switch',
    name: '2-Speed Gearbox Top Slide Switch (1 / 2)',
    group: 'Motor & Gearbox Body',
    role: 'secondary',
    fitClass: 'sliding',
    positionMm: [28.0, 222.5, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minSlideMm: -5, maxSlideMm: 5 },
    ports: {
      railBase: { localOffsetMm: [0, -2.3, 0], normal: [1, 0, 0] },
    },
    mates: [
      {
        kind: 'coincident',
        selfPort: 'railBase',
        targetPartId: 'motor_housing_red',
        targetPort: 'topSwitchRail',
        flipNormal: false,
        jointKind: 'prismatic',
      },
    ],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'polygonExtrude',
        depth: 20,
        polygonPoints: [
          [-21, -2.3],
          [23, -2.3],
          [20, 1.8],
          [14, 1.8],
          [11, -0.8],
          [-2, -0.8],
          [-3, 0.4],
          [-6, 0.4],
          [-7, -0.8],
          [-10, -0.8],
          [-13, 1.6],
          [-18, 1.6],
        ],
      },
    },
    material: MAT_CRAFTSMAN_RED,
    explodeOffsetMm: [0, 52, 0],
    toleranceMm: 0.1,
  },
  {
    id: 'rear_rubber_bumper',
    name: 'Rear Impact Rubberized Bumper Cap',
    group: 'Motor & Gearbox Body',
    role: 'primary',
    positionMm: [83.3, SPINDLE_Y - 1.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          {
            op: 'polygonExtrude',
            depth: 54,
            polygonPoints: [
              [-9.1, -30.2],
              [4.2, -30.2],
              [9.2, -23.0],
              [9.2, 23.0],
              [4.2, 30.0],
              [-9.1, 30.0],
            ],
          },
          {
            op: 'box',
            width: 14,
            height: 16,
            depth: 57,
            translateMm: [1.0, 11.5, 0],
          },
          {
            op: 'box',
            width: 14,
            height: 16,
            depth: 57,
            translateMm: [1.0, -11.5, 0],
          },
        ],
      },
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [42, 26, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'front_gearbox_collar',
    name: 'Front Planetary Gearbox Nose Collar',
    group: 'Motor & Gearbox Body',
    role: 'primary',
    positionMm: [-1.9, SPINDLE_Y, 0],
    rotationDeg: [0, 0, 90],
    ports: {
      spindleFront: { localOffsetMm: [0, 6.4, 0], normal: [0, 1, 0] },
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'cylinder',
        radiusTop: 25.4,
        radiusBottom: 26.8,
        height: 12.8,
        radialSegments: 36,
      },
    },
    material: MAT_MATTE_POLYMER,
    explodeOffsetMm: [-22, 26, 0],
    toleranceMm: 0.1,
  },

  // =========================================================================
  // 5. TORQUE CLUTCH DIAL, 1/2" KEYLESS CHUCK & 3 COUPLED STEEL JAWS
  // =========================================================================
  {
    id: 'clutch_dial_ring',
    name: '23-Position Torque Index Dial Ring',
    group: '1/2" Keyless Chuck Assembly',
    role: 'primary',
    positionMm: [-13.9, SPINDLE_Y, 0],
    rotationDeg: [0, 0, 90],
    ports: {
      spindleFront: { localOffsetMm: [0, 5.4, 0], normal: [0, 1, 0] },
    },
    geometry: {
      kind: 'cylinder',
      radiusTop: 25.0,
      radiusBottom: 25.4,
      height: 10.8,
      radialSegments: 40,
    },
    material: MAT_CLUTCH_DIAL,
    explodeOffsetMm: [-34, 26, 0],
    toleranceMm: 0.08,
  },
  {
    id: 'clutch_torque_collar',
    name: 'Knurled Torque Clutch Selector Collar',
    group: '1/2" Keyless Chuck Assembly',
    role: 'primary',
    positionMm: [-26.3, SPINDLE_Y, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minAngleDeg: -180, maxAngleDeg: 180 },
    ports: {
      rearAxis: { localOffsetMm: [6.8, 0, 0], normal: [-1, 0, 0] },
      frontAxis: { localOffsetMm: [-6.8, 0, 0], normal: [-1, 0, 0] },
    },
    mates: [
      {
        kind: 'concentric',
        selfPort: 'rearAxis',
        targetPartId: 'clutch_dial_ring',
        targetPort: 'spindleFront',
        axialOffsetMm: 0.2,
        lockAxial: true,
        lockSpin: false,
      },
    ],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildClutchTorqueCollarCsg(),
      smoothSharpAngleDeg: 32,
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [-46, 26, 0],
    toleranceMm: 0.08,
  },
  {
    id: 'chuck_sleeve_barrel',
    name: '1/2" Keyless Ratcheting Chuck Sleeve',
    group: '1/2" Keyless Chuck Assembly',
    role: 'primary',
    positionMm: [-55.4, SPINDLE_Y, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minAngleDeg: -180, maxAngleDeg: 180 },
    ports: {
      rearAxis: { localOffsetMm: [21.9, 0, 0], normal: [-1, 0, 0] },
      frontAxis: { localOffsetMm: [-21.9, 0, 0], normal: [-1, 0, 0] },
    },
    mates: [
      {
        kind: 'concentric',
        selfPort: 'rearAxis',
        targetPartId: 'clutch_dial_ring',
        targetPort: 'spindleFront',
        axialOffsetMm: 14.2,
        lockAxial: true,
        lockSpin: false,
      },
    ],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildKeylessChuckSleeveCsg(),
      smoothSharpAngleDeg: 30,
    },
    material: MAT_BLACK_OXIDE_CHUCK,
    explodeOffsetMm: [-62, 26, 0],
    toleranceMm: 0.06,
  },
  {
    id: 'chuck_chrome_nose',
    name: 'Machined Chrome-Steel Chuck Nose Ring',
    group: '1/2" Keyless Chuck Assembly',
    role: 'secondary',
    positionMm: [-79.4, SPINDLE_Y, 0],
    rotationDeg: [0, 0, 90],
    ports: {
      rearAxis: { localOffsetMm: [0, -1.9, 0], normal: [0, 1, 0] },
    },
    mates: [
      {
        kind: 'coincident',
        selfPort: 'rearAxis',
        targetPartId: 'chuck_sleeve_barrel',
        targetPort: 'frontAxis',
        flipNormal: false,
        offsetMm: [-0.2, 0, 0],
        jointKind: 'fixed',
      },
    ],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'cylinder',
        radiusTop: 7.4,
        radiusBottom: 11.6,
        height: 3.8,
        radialSegments: 36,
      },
    },
    material: MAT_CHROME_STEEL,
    explodeOffsetMm: [-76, 26, 0],
    toleranceMm: 0.05,
  },
  buildChuckJawPart(0, 0),
  buildChuckJawPart(1, 120),
  buildChuckJawPart(2, 240),
];

export const CRAFTSMAN_V20_DRILL_BLUEPRINT: MeshBlueprint = {
  id: 'craftsman-v20-cordless-drill',
  name: 'Craftsman V20 20V MAX 1/2" Cordless Drill/Driver',
  category: 'Cordless Power Tool Assembly',
  summary:
    'Pixel-calibrated watertight CAD reconstruction of the Craftsman V20 cordless drill/driver featuring a sculpted CSG pistol grip with ergonomic trigger bay and crimson bezel, manifold-3d Boolean-louvered motor clamshell, ribbed 1/2" keyless ratcheting chuck with 3 coupled steel jaws, 23-position torque dial, and removable 2.0Ah lithium-ion battery pack.',
  sourceImageUrl: '/assets/aistudio/image_6e7cabdf.jpeg',
  isReferencePreset: true,
  envelopeMm: {
    width: 185,
    height: 225,
    depth: 74,
  },
  toleranceSpecMm: 0.1,
  symmetryPlane: 'Z',
  photoMatchCamera: {
    positionMm: [0, 112.5, 515],
    targetMm: [0, 112.5, 0],
    fov: 28,
  },
  skeleton: {
    params: {
      spindleAxisYMm: SPINDLE_Y,
      chuckMaxCapacityMm: 12.7,
      batteryVoltageV: 20,
      batteryCapacityAh: 2.0,
      totalLengthMm: 185,
      totalHeightMm: 225,
    },
    axes: [
      {
        id: 'spindle_axis',
        label: 'Main Drivetrain & Chuck Spindle Axis (-X)',
        originMm: [0, SPINDLE_Y, 0],
        direction: [-1, 0, 0],
      },
    ],
    planes: [
      {
        id: 'battery_ground_datum',
        label: 'Battery Base Ground Plane (Y = 0)',
        originMm: [0, 0, 0],
        normal: [0, 1, 0],
      },
      {
        id: 'clamshell_split_plane',
        label: 'Clamshell Housing Split Plane (Z = 0)',
        originMm: [0, 112.5, 0],
        normal: [0, 0, 1],
      },
    ],
  },
  parts,
  reconstructedAt: '2026-11-21T18:45:00.000Z',
};
