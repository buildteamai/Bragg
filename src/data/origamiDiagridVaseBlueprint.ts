import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * 3D-Printed Architectural Origami Diagrid Vase with Dried Botanical Berry Arrangement
 * 100% Watertight Manifold-3D CAD Reconstruction from reference photo.
 *
 * Calibrated Master Coordinate System (mm, Y-up, Y = 0 ground):
 * - Ground plane: Y = 0.0 mm (flat resting base & lower star-toothed diagrid vertices flush on Y = 0)
 * - Vase Height (Y): 0.0 mm .. 200.0 mm
 * - Vase Equatorial Width (X/Z): 244.0 mm (R_tip_max = 122.0 mm at Y = 76.0 mm)
 * - Vase Neck Top Outer Diameter: 67.0 mm (R_tip = 33.5 mm, R_core = 27.5 mm, R_bore = 21.5 mm)
 * - Vase Base Diameter: 132.0 mm (R_tip = 66.0 mm, R_core = 52.0 mm)
 * - Botanical Arrangement Height (Y): 148.0 mm (seated inside hollow neck) .. 405.0 mm
 *
 * Architecture & Sub-Assemblies:
 * 1. Inner Hollow Revolved Vessel Core (matte charcoal 3D-printed PLA with horizontal FDM layer lines)
 * 2. 16-Fold Double-Helical Origami Diagrid Fins (16 CW + 16 CCW continuous tapered sharp-edged blades
 *    sweeping 67.5° from base to rim, peaking dramatically 38 mm radially at the Y = 76 mm equator)
 * 3. Dried Botanical Woody Stems & Nodal Leaf Sheaths (11 gracefully splaying tapered stems + bracts)
 * 4. Branching Twigs & Multi-Tone Cream/Oatmeal/Warm-Tan Seed-Bud / Berry Clusters
 */

// ============================================================================
// PBR MATERIALS (MATTE CHARCOAL FDM PLA + DRIED BOTANICALS)
// ============================================================================

const MAT_CHARCOAL_VASE_CORE: PartMaterialSpec = {
  colorHex: '#2b2d31',
  metalness: 0.08,
  roughness: 0.58,
  clearcoat: 0.12,
  clearcoatRoughness: 0.44,
  densityGPerCm3: 1.24,
  textureKind: 'fdmLayerLines',
  finishName: 'Matte Charcoal 3D-Printed PLA (0.2 mm FDM Layer Lines)',
};

const MAT_CHARCOAL_VASE_FINS: PartMaterialSpec = {
  colorHex: '#303338',
  metalness: 0.1,
  roughness: 0.52,
  clearcoat: 0.16,
  clearcoatRoughness: 0.36,
  densityGPerCm3: 1.24,
  textureKind: 'fdmLayerLines',
  finishName: 'Matte Graphite 3D-Printed PLA Architectural Fins',
};

const MAT_STEM_WOODY_DARK: PartMaterialSpec = {
  colorHex: '#684f39',
  metalness: 0.02,
  roughness: 0.82,
  densityGPerCm3: 0.65,
  textureKind: 'woodGrain',
  finishName: 'Dried Woody Botanical Stem (Dark Umber)',
};

const MAT_STEM_WOODY_WARM: PartMaterialSpec = {
  colorHex: '#7d6246',
  metalness: 0.02,
  roughness: 0.78,
  densityGPerCm3: 0.65,
  textureKind: 'woodGrain',
  finishName: 'Dried Botanical Twig (Warm Olive-Taupe)',
};

const MAT_LEAF_SHEATH: PartMaterialSpec = {
  colorHex: '#5f4733',
  metalness: 0.02,
  roughness: 0.84,
  densityGPerCm3: 0.55,
  textureKind: 'none',
  finishName: 'Dried Botanical Nodal Sheath / Bract',
};

const MAT_BERRY_CREAM: PartMaterialSpec = {
  colorHex: '#dfd0b4',
  metalness: 0.02,
  roughness: 0.76,
  densityGPerCm3: 0.45,
  textureKind: 'none',
  finishName: 'Dried Cream-Oatmeal Faux Seed Buds',
};

const MAT_BERRY_TAN: PartMaterialSpec = {
  colorHex: '#c9b28d',
  metalness: 0.02,
  roughness: 0.78,
  densityGPerCm3: 0.45,
  textureKind: 'none',
  finishName: 'Dried Warm-Tan Botanical Berries',
};

const MAT_BERRY_WHEAT: PartMaterialSpec = {
  colorHex: '#b2966e',
  metalness: 0.02,
  roughness: 0.8,
  densityGPerCm3: 0.45,
  textureKind: 'none',
  finishName: 'Toasted Wheat Dried Floral Buds',
};

// ============================================================================
// PARAMETRIC ORIGAMI DIAGRID PROFILE STATIONS
// ============================================================================

/**
 * 16-fold double-helical diagrid stations: [yMm, twistDeg, rCoreMm, rTipMm]
 * - 16 radial segments => pitch = 22.5°, half-pitch crossing = 11.25°
 * - Crossings at twistDeg = 0°, 11.25°, 22.5° (equator peak), 33.75°, 45.0°, 56.25°, 67.5° (top rim)
 */
const VASE_STATIONS: [number, number, number, number][] = [
  [0.0, 0.0, 52.0, 66.0], // Base resting flat on Y = 0
  [17.5, 5.65, 61.2, 79.0],
  [35.0, 11.25, 70.5, 93.0], // 1st crossing: lower diamond waist
  [55.5, 16.9, 79.5, 108.5],
  [76.0, 22.5, 84.0, 122.0], // 2nd crossing: dramatic equatorial star-burst peak
  [88.0, 25.5, 78.0, 111.5],
  [104.0, 29.4, 66.2, 92.0],
  [122.0, 33.75, 53.5, 72.5], // 3rd crossing: tall central kite apex
  [138.0, 39.2, 43.2, 57.2],
  [154.0, 45.0, 36.2, 47.2], // 4th crossing: lower neck diamond
  [166.0, 50.6, 32.4, 41.4],
  [178.0, 56.25, 30.0, 37.6], // 5th crossing: mid neck diamond
  [190.0, 62.2, 28.4, 35.0],
  [200.0, 67.5, 27.5, 33.5], // 6th crossing: flat top rim
];

/**
 * Builds the hollow revolved inner vessel body seated flush on Y = 0 with a flat
 * solid base, flared amphora belly, and Ø43 mm open neck bore for the stems.
 */
function buildInnerVesselCoreCsg(): CsgNodeSpec {
  const outerProfile: [number, number][] = [
    [0.0, 0.0],
    ...VASE_STATIONS.map(([y, , rCore]): [number, number] => [rCore, y]),
    // Flat top rim lip down into the hollow inner vessel bore
    [21.5, 200.0],
    [21.5, 175.0],
    [25.0, 150.0],
    [36.0, 122.0],
    [60.0, 92.0],
    [72.0, 72.0],
    [58.0, 32.0],
    [44.0, 8.0],
    [0.0, 8.0],
  ];

  return {
    op: 'revolve',
    radialSegments: 32,
    lathePoints: outerProfile,
  };
}

/**
 * Creates a thin horizontal trapezoidal radial blade slice at a given height & azimuth,
 * wider at the inner core root (3.0 mm) and tapering to a crisp architectural edge (1.7 mm)
 * at the outer fin ridge tip.
 */
function makeHorizontalFinSlice(
  yMm: number,
  thetaDeg: number,
  rInMm: number,
  rOutMm: number,
  sliceThicknessY = 0.5
): CsgNodeSpec {
  const halfRoot = 1.5;
  const halfTip = 0.85;
  // 2D polygon in local XY plane (extruded along Z by sliceThicknessY, then rotated -90° around X
  // so local X stays radial +X, local Y becomes -Z tangential, and extrusion Z becomes +Y vertical).
  const poly: [number, number][] = [
    [rInMm, -halfRoot],
    [rOutMm, -halfTip],
    [rOutMm, halfTip],
    [rInMm, halfRoot],
  ];

  return {
    op: 'polygonExtrude',
    depth: sliceThicknessY,
    polygonPoints: poly,
    // Rotate flat into XZ plane, then rotate around Y to exact helix azimuth
    rotateDeg: [-90, thetaDeg, 0],
    translateMm: [0, yMm, 0],
  };
}

/**
 * Builds one continuous 100% watertight spiral origami fin blade from Y = 0 to Y = 200 mm
 * by hulling consecutive horizontal trapezoidal blade slices along the helical profile.
 * `direction`: +1 for clockwise (CW), -1 for counter-clockwise (CCW).
 */
function buildSpiralOrigamiFinCsg(direction: 1 | -1): CsgNodeSpec {
  const segments: CsgNodeSpec[] = [];

  for (let i = 0; i < VASE_STATIONS.length - 1; i++) {
    const [y0, tw0, rc0, rt0] = VASE_STATIONS[i];
    const [y1, tw1, rc1, rt1] = VASE_STATIONS[i + 1];

    // Embed inner root 2.8 mm inside the core wall for seamless watertight union / zero gap
    const rIn0 = Math.max(22.5, rc0 - 2.8);
    const rIn1 = Math.max(22.5, rc1 - 2.8);

    // Clamp very bottom slice slightly above Y = 0 and very top slice slightly below Y = 200
    // so the overall fin sits dead flush on Y = 0.0 mm and terminates dead flush at Y = 200.0 mm.
    const yBot = i === 0 ? 0.25 : y0;
    const yTop = i === VASE_STATIONS.length - 2 ? 199.75 : y1;

    const slice0 = makeHorizontalFinSlice(yBot, direction * tw0, rIn0, rt0, 0.5);
    const slice1 = makeHorizontalFinSlice(yTop, direction * tw1, rIn1, rt1, 0.5);

    segments.push({
      op: 'hull',
      children: [slice0, slice1],
    });
  }

  return {
    op: 'union',
    children: segments,
  };
}

// ============================================================================
// DRIED BOTANICAL STEMS, BRANCHING TWIGS & SEED-BUD BERRY CLUSTERS
// ============================================================================

interface StemSpec {
  id: string;
  name: string;
  points: [number, number, number][];
  rStart: number;
  rEnd: number;
  warm?: boolean;
}

const MAIN_STEMS: StemSpec[] = [
  {
    id: 'stem-main-01',
    name: 'Center-Left Arching Stem',
    points: [
      [-6, 152, 4],
      [-8, 198, 5],
      [-24, 245, 10],
      [-56, 298, 18],
      [-98, 348, 22],
      [-136, 386, 20],
    ],
    rStart: 2.4,
    rEnd: 0.9,
  },
  {
    id: 'stem-main-02',
    name: 'Far-Left Sweeping Stem',
    points: [
      [-12, 156, -4],
      [-15, 202, -5],
      [-42, 244, -8],
      [-82, 286, -12],
      [-126, 326, -10],
      [-158, 358, -4],
    ],
    rStart: 2.3,
    rEnd: 0.85,
    warm: true,
  },
  {
    id: 'stem-main-03',
    name: 'Center-Upright Tall Stem',
    points: [
      [-2, 148, -2],
      [-3, 204, -3],
      [-10, 260, -6],
      [-20, 322, -10],
      [-32, 374, -8],
      [-42, 404, -4],
    ],
    rStart: 2.5,
    rEnd: 0.95,
  },
  {
    id: 'stem-main-04',
    name: 'Center-Right Tall Stem',
    points: [
      [4, 150, 5],
      [6, 204, 6],
      [18, 258, 10],
      [34, 318, 14],
      [54, 368, 12],
      [70, 400, 8],
    ],
    rStart: 2.4,
    rEnd: 0.9,
    warm: true,
  },
  {
    id: 'stem-main-05',
    name: 'Right-Sweeping Arch Stem',
    points: [
      [10, 154, -2],
      [14, 202, -3],
      [38, 248, -4],
      [74, 294, -2],
      [114, 336, 4],
      [148, 372, 10],
    ],
    rStart: 2.3,
    rEnd: 0.85,
  },
  {
    id: 'stem-main-06',
    name: 'Far-Right Outward Stem',
    points: [
      [14, 158, 6],
      [17, 204, 8],
      [44, 242, 14],
      [84, 276, 22],
      [124, 308, 28],
      [154, 332, 30],
    ],
    rStart: 2.1,
    rEnd: 0.8,
    warm: true,
  },
  {
    id: 'stem-main-07',
    name: 'Front-Left Fanning Stem',
    points: [
      [-8, 156, 11],
      [-12, 202, 14],
      [-28, 248, 32],
      [-52, 296, 56],
      [-76, 340, 74],
      [-94, 374, 82],
    ],
    rStart: 2.2,
    rEnd: 0.85,
  },
  {
    id: 'stem-main-08',
    name: 'Front-Right Fanning Stem',
    points: [
      [8, 154, 12],
      [11, 202, 15],
      [26, 246, 34],
      [48, 292, 58],
      [72, 334, 76],
      [92, 368, 86],
    ],
    rStart: 2.2,
    rEnd: 0.85,
    warm: true,
  },
  {
    id: 'stem-main-09',
    name: 'Rear-Left Canopy Stem',
    points: [
      [-9, 152, -11],
      [-13, 202, -14],
      [-32, 250, -34],
      [-60, 304, -56],
      [-88, 352, -72],
      [-110, 386, -80],
    ],
    rStart: 2.2,
    rEnd: 0.85,
  },
  {
    id: 'stem-main-10',
    name: 'Rear-Center Crown Stem',
    points: [
      [1, 150, -12],
      [2, 204, -15],
      [6, 258, -32],
      [12, 316, -50],
      [18, 366, -62],
      [24, 402, -66],
    ],
    rStart: 2.3,
    rEnd: 0.9,
    warm: true,
  },
  {
    id: 'stem-main-11',
    name: 'Rear-Right Canopy Stem',
    points: [
      [11, 154, -10],
      [14, 202, -13],
      [34, 248, -32],
      [64, 298, -54],
      [94, 344, -70],
      [118, 378, -78],
    ],
    rStart: 2.2,
    rEnd: 0.85,
  },
];

// Secondary branching twigs forking off the main stems
const SECONDARY_TWIGS: StemSpec[] = [
  {
    id: 'twig-01',
    name: 'Left-Lower Lateral Twig',
    points: [
      [-42, 244, -8],
      [-74, 266, 8],
      [-108, 290, 22],
      [-134, 310, 32],
    ],
    rStart: 1.35,
    rEnd: 0.55,
    warm: true,
  },
  {
    id: 'twig-02',
    name: 'Left-Mid Ascending Twig',
    points: [
      [-56, 298, 18],
      [-74, 332, 38],
      [-92, 366, 52],
    ],
    rStart: 1.3,
    rEnd: 0.55,
  },
  {
    id: 'twig-03',
    name: 'Left-Upper Fork Twig',
    points: [
      [-56, 298, 18],
      [-46, 342, 2],
      [-54, 382, -14],
    ],
    rStart: 1.3,
    rEnd: 0.55,
    warm: true,
  },
  {
    id: 'twig-04',
    name: 'Center-Left Crown Twig',
    points: [
      [-20, 322, -10],
      [-44, 356, -24],
      [-64, 392, -32],
    ],
    rStart: 1.3,
    rEnd: 0.55,
  },
  {
    id: 'twig-05',
    name: 'Center-Front Spray Twig',
    points: [
      [-10, 260, -6],
      [-8, 304, 18],
      [-12, 350, 38],
      [-16, 386, 48],
    ],
    rStart: 1.4,
    rEnd: 0.55,
    warm: true,
  },
  {
    id: 'twig-06',
    name: 'Center-Right Inner Twig',
    points: [
      [18, 258, 10],
      [14, 306, -8],
      [16, 356, -22],
      [18, 394, -26],
    ],
    rStart: 1.35,
    rEnd: 0.55,
  },
  {
    id: 'twig-07',
    name: 'Right-Mid Fork Twig',
    points: [
      [34, 318, 14],
      [62, 350, 34],
      [84, 384, 46],
    ],
    rStart: 1.3,
    rEnd: 0.55,
    warm: true,
  },
  {
    id: 'twig-08',
    name: 'Right-Lower Sweeping Twig',
    points: [
      [38, 248, -4],
      [68, 272, -24],
      [104, 298, -40],
      [130, 320, -48],
    ],
    rStart: 1.35,
    rEnd: 0.55,
  },
  {
    id: 'twig-09',
    name: 'Right-Upper Arch Twig',
    points: [
      [74, 294, -2],
      [98, 336, -16],
      [122, 376, -24],
    ],
    rStart: 1.25,
    rEnd: 0.55,
    warm: true,
  },
  {
    id: 'twig-10',
    name: 'Far-Right Outer Spray Twig',
    points: [
      [84, 276, 22],
      [112, 300, 44],
      [138, 326, 56],
    ],
    rStart: 1.25,
    rEnd: 0.5,
  },
  {
    id: 'twig-11',
    name: 'Front-Left Outward Twig',
    points: [
      [-28, 248, 32],
      [-58, 276, 52],
      [-86, 306, 68],
    ],
    rStart: 1.3,
    rEnd: 0.55,
    warm: true,
  },
  {
    id: 'twig-12',
    name: 'Front-Right Outward Twig',
    points: [
      [26, 246, 34],
      [56, 274, 54],
      [84, 304, 70],
    ],
    rStart: 1.3,
    rEnd: 0.55,
  },
  {
    id: 'twig-13',
    name: 'Rear-Left Spreading Twig',
    points: [
      [-32, 250, -34],
      [-66, 280, -44],
      [-98, 314, -52],
    ],
    rStart: 1.3,
    rEnd: 0.55,
    warm: true,
  },
  {
    id: 'twig-14',
    name: 'Rear-Right Spreading Twig',
    points: [
      [34, 248, -32],
      [68, 280, -44],
      [100, 312, -52],
    ],
    rStart: 1.3,
    rEnd: 0.55,
  },
];

/**
 * Deterministic pseudo-random generator for organic berry/seed-bud raceme placement
 * along the upper sections of every stem and branching twig.
 */
function createSeededRand(seedInit: number): () => number {
  let s = seedInit >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Evaluates a point along a piecewise polyline at normalized parameter t in [0, 1].
 */
function samplePolyline(pts: [number, number, number][], t: number): [number, number, number] {
  if (pts.length === 1) return pts[0];
  const segCount = pts.length - 1;
  const scaled = Math.max(0, Math.min(0.999999, t)) * segCount;
  const idx = Math.floor(scaled);
  const u = scaled - idx;
  const a = pts[idx];
  const b = pts[idx + 1];
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}

/**
 * Builds three multi-tone watertight CSG berry/seed-bud canopy clusters (cream, warm-tan,
 * and toasted-wheat) densely populating the upper twigs to reproduce the lush faux-millet /
 * dried berry spray silhouette from the reference photo.
 */
function buildBerryCanopyClusters(): {
  cream: CsgNodeSpec;
  tan: CsgNodeSpec;
  wheat: CsgNodeSpec;
} {
  const rand = createSeededRand(20261123);
  const creamSpheres: CsgNodeSpec[] = [];
  const tanSpheres: CsgNodeSpec[] = [];
  const wheatSpheres: CsgNodeSpec[] = [];

  const allBranches = [...MAIN_STEMS, ...SECONDARY_TWIGS];

  for (const branch of allBranches) {
    const isMain = branch.id.startsWith('stem-main');
    const tStart = isMain ? 0.52 : 0.34;
    const clusterSteps = isMain ? 5 : 4;

    for (let s = 0; s < clusterSteps; s++) {
      const t = tStart + ((1 - tStart) * s) / Math.max(1, clusterSteps - 1);
      const [bx, by, bz] = samplePolyline(branch.points, t);

      // 3-4 tiny seed buds clustered tightly around each botanical node
      const budsPerNode = s === clusterSteps - 1 ? 4 : 3;
      for (let b = 0; b < budsPerNode; b++) {
        const ang = rand() * Math.PI * 2;
        const elev = (rand() - 0.35) * 1.1;
        const dist = 3.2 + rand() * 7.8;
        const rx = bx + Math.cos(ang) * Math.cos(elev) * dist;
        const ry = by + Math.sin(elev) * dist + 1.5;
        const rz = bz + Math.sin(ang) * Math.cos(elev) * dist;
        const radius = 2.4 + rand() * 1.65;

        const bud: CsgNodeSpec = {
          op: 'sphere',
          radius,
          radialSegments: 8,
          scale: [0.92, 1.18, 0.92],
          translateMm: [
            Number(rx.toFixed(2)),
            Number(ry.toFixed(2)),
            Number(rz.toFixed(2)),
          ],
        };

        const toneRoll = rand();
        if (toneRoll < 0.42) {
          creamSpheres.push(bud);
        } else if (toneRoll < 0.78) {
          tanSpheres.push(bud);
        } else {
          wheatSpheres.push(bud);
        }
      }
    }
  }

  return {
    cream: { op: 'union', children: creamSpheres },
    tan: { op: 'union', children: tanSpheres },
    wheat: { op: 'union', children: wheatSpheres },
  };
}

/**
 * Builds the small conical botanical nodal sheaths / leaf bracts visible along the
 * lower stems just above the vase mouth (Y = 225..275 mm).
 */
function buildNodalLeafSheathsCsg(): CsgNodeSpec {
  const sheaths: CsgNodeSpec[] = [];
  const sheathSpecs: [number, number, number, number, number, number][] = [
    [-16, 224, 7, 12, 0, 18],
    [-34, 236, -7, -8, 15, 34],
    [-6, 232, -4, -4, 0, 8],
    [12, 234, 8, 8, -10, -14],
    [28, 236, -3, -6, 12, -26],
    [32, 228, 11, 14, -8, -32],
    [-20, 228, 24, 24, 18, 16],
    [18, 226, 25, 22, -16, -14],
    [-22, 230, -24, -22, 10, 18],
    [24, 228, -22, -20, -12, -20],
  ];

  for (const [x, y, z, rx, ry, rz] of sheathSpecs) {
    sheaths.push({
      op: 'cylinder',
      radiusTop: 3.4,
      radiusBottom: 1.9,
      height: 11.5,
      radialSegments: 10,
      rotateDeg: [rx, ry, rz],
      translateMm: [x, y, z],
    });
  }

  return {
    op: 'union',
    children: sheaths,
  };
}

// ============================================================================
// ASSEMBLED PARTS LIST
// ============================================================================

const BERRY_CLUSTERS = buildBerryCanopyClusters();

const PARTS: BlueprintPart[] = [
  // 1. Hollow Matte-Charcoal 3D-Printed Inner Vessel Core
  {
    id: 'vase-inner-vessel-core',
    name: '3D-Printed Inner Vessel Core',
    group: 'Architectural Origami Vase',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 0, 0],
    toleranceMm: 0.15,
    notes:
      'Hollow revolved matte-charcoal PLA vessel core (Y = 0..200 mm, Ø43 mm open neck bore, 8 mm solid base) with procedural 0.2 mm FDM horizontal layer lines.',
    material: MAT_CHARCOAL_VASE_CORE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 36,
      csgRoot: buildInnerVesselCoreCsg(),
    },
  },

  // 2. 16-Fold Clockwise Spiral Origami Diagrid Fins
  {
    id: 'vase-diagrid-fin-cw',
    name: 'Clockwise Spiral Origami Fin',
    group: 'Architectural Origami Vase',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 26, 0],
    toleranceMm: 0.15,
    notes:
      '16-fold polar array of clockwise helical origami fin blades sweeping 67.5° from base to rim, flaring 38 mm radially at the Y = 76 mm equatorial star-burst peak.',
    pattern: {
      kind: 'polar',
      count: 16,
      axis: 'y',
      centerMm: [0, 0, 0],
      rotateInstances: true,
    },
    material: MAT_CHARCOAL_VASE_FINS,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 28,
      csgRoot: buildSpiralOrigamiFinCsg(1),
    },
  },

  // 3. 16-Fold Counter-Clockwise Spiral Origami Diagrid Fins
  {
    id: 'vase-diagrid-fin-ccw',
    name: 'Counter-Clockwise Spiral Origami Fin',
    group: 'Architectural Origami Vase',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 52, 0],
    toleranceMm: 0.15,
    notes:
      '16-fold polar array of counter-clockwise helical origami fin blades intersecting the CW array at 6 diamond lattice tiers from the flat resting base to the neck rim.',
    pattern: {
      kind: 'polar',
      count: 16,
      axis: 'y',
      centerMm: [0, 0, 0],
      rotateInstances: true,
    },
    material: MAT_CHARCOAL_VASE_FINS,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 28,
      csgRoot: buildSpiralOrigamiFinCsg(-1),
    },
  },

  // 4. Dried Botanical Nodal Leaf Sheaths / Bracts
  {
    id: 'botanical-nodal-sheaths',
    name: 'Stem Nodal Leaf Sheaths',
    group: 'Dried Botanical Arrangement',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 95, 0],
    toleranceMm: 0.4,
    notes: 'Conical brown botanical nodal sleeves & stem bracts along lower twig junctions.',
    material: MAT_LEAF_SHEATH,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 45,
      csgRoot: buildNodalLeafSheathsCsg(),
    },
  },

  // 5. Main Tapered Woody Botanical Stems
  ...MAIN_STEMS.map(
    (stem): BlueprintPart => ({
      id: stem.id,
      name: stem.name,
      group: 'Dried Botanical Arrangement',
      role: 'secondary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [0, 110, 0],
      toleranceMm: 0.5,
      material: stem.warm ? MAT_STEM_WOODY_WARM : MAT_STEM_WOODY_DARK,
      geometry: {
        kind: 'taperedTube',
        pathPoints: stem.points,
        radiusStart: stem.rStart,
        radiusEnd: stem.rEnd,
        radialSegments: 10,
      },
    })
  ),

  // 6. Secondary & Tertiary Branching Twigs
  ...SECONDARY_TWIGS.map(
    (twig): BlueprintPart => ({
      id: twig.id,
      name: twig.name,
      group: 'Dried Botanical Arrangement',
      role: 'detail',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [0, 128, 0],
      toleranceMm: 0.5,
      material: twig.warm ? MAT_STEM_WOODY_WARM : MAT_STEM_WOODY_DARK,
      geometry: {
        kind: 'taperedTube',
        pathPoints: twig.points,
        radiusStart: twig.rStart,
        radiusEnd: twig.rEnd,
        radialSegments: 8,
      },
    })
  ),

  // 7. Multi-Tone Cream / Warm-Tan / Toasted-Wheat Faux Seed-Bud & Berry Canopy
  {
    id: 'botanical-berries-cream',
    name: 'Cream-Oatmeal Seed-Bud Clusters',
    group: 'Dried Botanical Arrangement',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 148, 0],
    toleranceMm: 0.5,
    notes: 'Light cream-oatmeal dried faux berry and seed-bud raceme clusters across upper twigs.',
    material: MAT_BERRY_CREAM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 55,
      csgRoot: BERRY_CLUSTERS.cream,
    },
  },
  {
    id: 'botanical-berries-tan',
    name: 'Warm-Tan Botanical Berry Clusters',
    group: 'Dried Botanical Arrangement',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 156, 0],
    toleranceMm: 0.5,
    notes: 'Mid-tone warm beige-tan faux berry clusters adding depth to the dried arrangement.',
    material: MAT_BERRY_TAN,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 55,
      csgRoot: BERRY_CLUSTERS.tan,
    },
  },
  {
    id: 'botanical-berries-wheat',
    name: 'Toasted-Wheat Seed-Bud Accents',
    group: 'Dried Botanical Arrangement',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 164, 0],
    toleranceMm: 0.5,
    notes: 'Toasted-wheat darker seed buds nestled deeper in the botanical spray.',
    material: MAT_BERRY_WHEAT,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 55,
      csgRoot: BERRY_CLUSTERS.wheat,
    },
  },
];

// ============================================================================
// EXPORTED BLUEPRINT
// ============================================================================

export const ORIGAMI_DIAGRID_VASE_BLUEPRINT: MeshBlueprint = {
  id: 'origami-diagrid-vase',
  name: 'Origami Diagrid 3D-Printed Vase & Dried Botanicals',
  category: 'Architectural Decor & Additive Manufacturing',
  summary:
    '100% watertight Manifold-3D CAD reconstruction of a matte-charcoal 3D-printed architectural vase featuring a 16-fold double-helical origami diagrid lattice (32 interlocking tapered fins with dramatic 38 mm equatorial star-burst flares and procedural 0.2 mm FDM layer lines), hollow inner vessel core, and a multi-tone dried woody-stem and cream/tan berry botanical arrangement.',
  sourceImageUrl: '/assets/aistudio/origami_diagrid_vase.png',
  isReferencePreset: true,
  envelopeMm: {
    width: 316,
    height: 405,
    depth: 244,
  },
  toleranceSpecMm: 0.15,
  symmetryPlane: 'radial',
  photoMatchCamera: {
    positionMm: [-42, 235, 510],
    targetMm: [0, 165, 0],
    fov: 38,
  },
  parts: PARTS,
  reconstructedAt: new Date().toISOString(),
};
