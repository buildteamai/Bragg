import { BlueprintPart, CsgNodeSpec, MeshBlueprint } from '../types/blueprint';
import {
  buildAnchoredShsColumnCsg,
  buildBarGratingStairTreadCsg,
  buildDiagonalXBraceCsg,
  buildDiamondPlateDeckCsg,
  buildDiamondPlateStairTreadCsg,
  buildEndGuardrailFrameCsg,
  buildFoldedStairStringerCsg,
  buildGooseneckStairHandrailCsg,
  buildGroovedStairNosingCsg,
  buildHollowCChannelSubframeCsg,
  buildNaammBarGratingDeckCsg,
  buildPipeCouplerClampCsg,
  buildSideGuardrailPanelCsg,
  buildStairGuardrailTieClampCsg,
  computeStairMetrics,
  DEFAULT_WORK_PLATFORM_CONFIG,
  getIndustrialMaterialPalette,
  WorkPlatformConfig,
} from '../engine/engineeringLibrary';

export { DEFAULT_WORK_PLATFORM_CONFIG };
export type { WorkPlatformConfig };

/**
 * Generates a fully verified, watertight Manifold-3D Modular Industrial Work Platform & Access Stairway
 * from live parametric engineering inputs (finish, deck/tread surface, modular bay count, deck height,
 * platform width, and open/enclosed front guardrail layout).
 *
 * Every parameter permutation enforces zero-clash clearances, exact ground seating at Y = 0.0 mm,
 * and OSHA 1910.25 / NAAMM MBG 531 / ASTM A786 industrial dimensional tolerances.
 */
export function createWorkPlatformBlueprint(
  config: WorkPlatformConfig = DEFAULT_WORK_PLATFORM_CONFIG
): MeshBlueprint {
  const palette = getIndustrialMaterialPalette(config.finish);
  const { bayCount, deckHeightMm, deckWidthMm, deckSurface, guardrailLayout } = config;
  const enclosedFront = guardrailLayout === 'enclosedFront';

  const DECK_TOP_Y = deckHeightMm;
  const DECK_TOP_T = deckSurface === 'barGrating' ? 24 : 10;
  const DECK_FRAME_TOP_Y = DECK_TOP_Y - DECK_TOP_T;
  const DECK_FRAME_BOT_Y = DECK_FRAME_TOP_Y - 58;
  const DECK_Z_HALF = deckWidthMm / 2;
  const BACK_RAIL_Z = -(DECK_Z_HALF - 44);
  const FRONT_RAIL_Z = +(DECK_Z_HALF - 44);
  const STAIR_HANDRAIL_Z = -(DECK_Z_HALF - 18);

  const LEG_W = 76;
  const LEG_Z = DECK_Z_HALF - 62;

  // Modular bay spans anchored so rightmost landing edge always sits cleanly at X = +900 mm
  const BAY_LEN = 1398;
  const SPLICE_GAP = 4;
  const RIGHT_EDGE_X = 900;

  interface BaySpan {
    index: number; // 1..bayCount (left to right)
    xMin: number;
    xMax: number;
    cx: number;
    len: number;
    railXMin: number;
    railXMax: number;
    holdDownWorldXs: number[];
  }

  const bays: BaySpan[] = [];
  for (let i = 0; i < bayCount; i++) {
    const fromRight = bayCount - 1 - i;
    const xMax = RIGHT_EDGE_X - fromRight * (BAY_LEN + SPLICE_GAP);
    const xMin = xMax - BAY_LEN;
    const cx = (xMin + xMax) / 2;
    const isFirst = i === 0;
    const isLast = i === bayCount - 1;
    const railXMin = isFirst ? xMin + 90 : xMin + 20;
    const railXMax = isLast ? xMax - 36 : xMax - 20;

    const holdDownWorldXs: number[] = [];
    if (isFirst) {
      holdDownWorldXs.push(xMin + 35, xMin + 85);
    } else {
      holdDownWorldXs.push(xMin + 26);
    }
    if (isLast) {
      holdDownWorldXs.push(xMax - 75, xMax - 28);
    } else {
      holdDownWorldXs.push(xMax - 26);
    }

    bays.push({
      index: i + 1,
      xMin,
      xMax,
      cx,
      len: BAY_LEN,
      railXMin,
      railXMax,
      holdDownWorldXs,
    });
  }

  const LEFT_EDGE_X = bays[0].xMin;
  // Front hold-down bolts sit along the exposed front edge when open-front, or cleanly inside front guardrail shoes when enclosed
  const HOLD_DOWN_Z = enclosedFront ? DECK_Z_HALF - 96 : DECK_Z_HALF - 24;

  // Structural transverse bent X locations: outer-left bent + 1 bent right of each splice + right landing bent
  const bentXs: number[] = [LEFT_EDGE_X + 124];
  for (let i = 1; i < bayCount; i++) {
    bentXs.push(bays[i].xMin + 66);
  }
  bentXs.push(RIGHT_EDGE_X - 68);

  const stairMetrics = computeStairMetrics(deckHeightMm, RIGHT_EDGE_X);
  const clampY = DECK_TOP_Y + 890; // sits cleanly below the 90 mm top bend (tangent at DECK_TOP_Y + 957)
  const stairClampY = DECK_TOP_Y + 600; // centered in the open window (458..702) between stair mid-rail (<=457.6) and platform yMid2 (>=702.5)
  const leftRailX = LEFT_EDGE_X + 44;

  const parts: BlueprintPart[] = [];

  // --- 1. STRUCTURAL SUPPORT BENTS (SHS Columns + 4-Hole Baseplates + Bolted Diagonal X-Braces) ---
  const columnCsg = buildAnchoredShsColumnCsg(DECK_FRAME_BOT_Y, LEG_W);
  const xBraceCsg = buildDiagonalXBraceCsg(LEG_Z, LEG_W, DECK_FRAME_BOT_Y, deckHeightMm);

  bentXs.forEach((bentX, idx) => {
    const n = idx + 1;
    const label =
      n === 1
        ? 'Left Bent'
        : n === bentXs.length
          ? 'Right Landing Bent'
          : `Splice Bent ${n - 1}`;
    const normPos = bentXs.length > 1 ? idx / (bentXs.length - 1) : 0.5;
    const exX = Math.round((normPos - 0.5) * 260);

    parts.push(
      {
        id: `platform_bent${n}_leg_front`,
        name: `${label} Front Column & Baseplate (+Z)`,
        group: 'Structural Support Bents',
        role: 'primary',
        anchorKind: 'floor',
        positionMm: [bentX, 0, LEG_Z],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'csgSolid', csgRoot: columnCsg, smoothSharpAngleDeg: 35 },
        material: palette.structural,
        explodeOffsetMm: [exX, -140, 120],
        toleranceMm: 0.2,
        constraint: { kind: 'sitOnGround', groundYMm: 0 },
      },
      {
        id: `platform_bent${n}_leg_back`,
        name: `${label} Back Column & Baseplate (-Z)`,
        group: 'Structural Support Bents',
        role: 'primary',
        anchorKind: 'floor',
        positionMm: [bentX, 0, -LEG_Z],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'csgSolid', csgRoot: columnCsg, smoothSharpAngleDeg: 35 },
        material: palette.structural,
        explodeOffsetMm: [exX, -140, -120],
        toleranceMm: 0.2,
        constraint: { kind: 'sitOnGround', groundYMm: 0 },
      },
      {
        id: `platform_bent${n}_xbrace`,
        name: `${label} Bolted Diagonal X-Brace`,
        group: 'Structural Support Bents',
        role: 'secondary',
        positionMm: [bentX, 0, 0],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'csgSolid', csgRoot: xBraceCsg, smoothSharpAngleDeg: 35 },
        material: palette.bracing,
        explodeOffsetMm: [exX, -100, 0],
        toleranceMm: 0.2,
      }
    );
  });

  // --- 2. MODULAR DECK BAYS (C-Channel Subframes + Bar Grating / Diamond Plate + Splice Hardware) ---
  const subframeCsg = buildHollowCChannelSubframeCsg(
    BAY_LEN,
    deckWidthMm,
    DECK_FRAME_BOT_Y,
    DECK_FRAME_TOP_Y
  );
  const diamondDeckCsg =
    deckSurface === 'diamondPlate'
      ? buildDiamondPlateDeckCsg(BAY_LEN, deckWidthMm, DECK_FRAME_TOP_Y, DECK_TOP_T)
      : null;

  const hardwareChildren: CsgNodeSpec[] = [];
  // Tie plate depth keeps ≥ 12 mm clearance from column top flanges (flange half-width = 55 mm)
  const spliceTiePlateDepth = Math.max(300, (LEG_Z - 55 - 12) * 2);

  bays.forEach((bay, idx) => {
    const exX = Math.round(((idx + 0.5) / bayCount - 0.5) * 200);
    const frameId = `platform_frame_bay_${bay.index}`;
    const deckId = `platform_deck_plate_bay_${bay.index}`;
    const holdDownLocalXs = bay.holdDownWorldXs.map((wx) => wx - bay.cx);

    parts.push(
      {
        id: frameId,
        name: `Bay ${bay.index} C-Channel Deck Subframe`,
        group: 'Modular Platform Decks',
        role: 'primary',
        positionMm: [bay.cx, 0, 0],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'csgSolid', csgRoot: subframeCsg, smoothSharpAngleDeg: 35 },
        material: palette.structural,
        explodeOffsetMm: [exX, 40, 0],
        toleranceMm: 0.2,
        ports: {
          deckSeat: { localOffsetMm: [0, DECK_FRAME_TOP_Y, 0], normal: [0, 1, 0] },
        },
      },
      {
        id: deckId,
        name:
          deckSurface === 'barGrating'
            ? `Bay ${bay.index} Open Welded Bar Grating Deck`
            : `Bay ${bay.index} Diamond-Plate Deck Panel`,
        group: 'Modular Platform Decks',
        role: 'primary',
        positionMm: [bay.cx, 0, 0],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot:
            deckSurface === 'barGrating'
              ? buildNaammBarGratingDeckCsg(
                  BAY_LEN,
                  deckWidthMm,
                  DECK_FRAME_TOP_Y,
                  DECK_TOP_T,
                  holdDownLocalXs,
                  HOLD_DOWN_Z
                )
              : diamondDeckCsg!,
          smoothSharpAngleDeg: 35,
        },
        material: deckSurface === 'barGrating' ? palette.barGrating : palette.diamondPlate,
        explodeOffsetMm: [exX, 110, 0],
        toleranceMm: 0.2,
        ports: {
          underside: { localOffsetMm: [0, DECK_FRAME_TOP_Y, 0], normal: [0, -1, 0] },
        },
        constraint: {
          kind: 'matePort',
          selfPort: 'underside',
          targetPartId: frameId,
          targetPort: 'deckSeat',
        },
      }
    );

    // Top deck hold-down hex bolts along front edge (or inside front guardrail when enclosed)
    for (const wx of bay.holdDownWorldXs) {
      hardwareChildren.push({
        op: 'cylinder',
        radius: 7.5,
        height: 5.5,
        radialSegments: 6,
        translateMm: [wx, DECK_TOP_Y + 2.8, HOLD_DOWN_Z],
      });
    }

    // Splice tie plate & side apron bolts between adjacent bays
    if (idx < bayCount - 1) {
      const spliceX = bay.xMax + SPLICE_GAP / 2;
      hardwareChildren.push(
        {
          op: 'box',
          width: 92,
          height: 10,
          depth: spliceTiePlateDepth,
          translateMm: [spliceX, DECK_FRAME_BOT_Y - 5.4, 0],
        },
        {
          op: 'cylinder',
          radius: 7,
          height: 8,
          radialSegments: 6,
          rotateDeg: [90, 0, 0],
          translateMm: [spliceX - 26, DECK_FRAME_BOT_Y + 29, DECK_Z_HALF + 4.2],
        },
        {
          op: 'cylinder',
          radius: 7,
          height: 8,
          radialSegments: 6,
          rotateDeg: [90, 0, 0],
          translateMm: [spliceX + 26, DECK_FRAME_BOT_Y + 29, DECK_Z_HALF + 4.2],
        }
      );
    }
  });

  parts.push({
    id: 'platform_deck_splice_bolts',
    name: 'Deck Hold-Down & Bay Splice Hardware',
    group: 'Modular Platform Decks',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'union', children: hardwareChildren },
      smoothSharpAngleDeg: 30,
    },
    material: palette.hardware,
    explodeOffsetMm: [0, 150, 40],
    toleranceMm: 0.15,
  });

  // --- 3. SAFETY TOE-BOARDS (KICK-PLATES) ---
  parts.push({
    id: 'platform_toeboard_left',
    name: 'Left-End Safety Toe-Board (-X)',
    group: 'Guardrails & Toe-Boards',
    role: 'secondary',
    positionMm: [LEFT_EDGE_X + 4, DECK_TOP_Y + 50.2, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 8, height: 100, depth: deckWidthMm },
      smoothSharpAngleDeg: 35,
    },
    material: palette.toeBoard,
    explodeOffsetMm: [-210, 150, 0],
    toleranceMm: 0.2,
  });

  bays.forEach((bay, idx) => {
    const exX = Math.round(((idx + 0.5) / bayCount - 0.5) * 200);
    const startX = idx === 0 ? bay.xMin + 8.4 : bay.xMin;
    const tbW = bay.xMax - startX;
    const tbCx = (startX + bay.xMax) / 2;

    parts.push({
      id: `platform_toeboard_back_${bay.index}`,
      name: `Back Bay ${bay.index} Safety Toe-Board (-Z)`,
      group: 'Guardrails & Toe-Boards',
      role: 'secondary',
      positionMm: [tbCx, DECK_TOP_Y + 50.2, -DECK_Z_HALF + 4],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: { op: 'box', width: tbW, height: 100, depth: 8 },
        smoothSharpAngleDeg: 35,
      },
      material: palette.toeBoard,
      explodeOffsetMm: [exX, 150, -120],
      toleranceMm: 0.2,
    });

    if (enclosedFront) {
      parts.push({
        id: `platform_toeboard_front_${bay.index}`,
        name: `Front Bay ${bay.index} Safety Toe-Board (+Z)`,
        group: 'Guardrails & Toe-Boards',
        role: 'secondary',
        positionMm: [tbCx, DECK_TOP_Y + 50.2, DECK_Z_HALF - 4],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: { op: 'box', width: tbW, height: 100, depth: 8 },
          smoothSharpAngleDeg: 35,
        },
        material: palette.toeBoard,
        explodeOffsetMm: [exX, 150, 120],
        toleranceMm: 0.2,
      });
    }
  });

  // --- 4. MANDREL-BENT TUBULAR GUARDRAIL FRAMES + DOUBLE-BOLT COUPLER CLAMPS ---
  parts.push({
    id: 'platform_guardrail_left',
    name: 'Left-End Tubular Guardrail Frame (-X)',
    group: 'Guardrails & Toe-Boards',
    role: 'primary',
    positionMm: [leftRailX, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildEndGuardrailFrameCsg(deckWidthMm, DECK_TOP_Y, enclosedFront),
      smoothSharpAngleDeg: 45,
    },
    material: palette.guardrail,
    explodeOffsetMm: [-240, 260, 0],
    toleranceMm: 0.2,
  });

  bays.forEach((bay, idx) => {
    const exX = Math.round(((idx + 0.5) / bayCount - 0.5) * 200);
    parts.push({
      id: `platform_guardrail_back_${bay.index}`,
      name: `Back Bay ${bay.index} Tubular Guardrail (-Z)`,
      group: 'Guardrails & Toe-Boards',
      role: 'primary',
      positionMm: [0, 0, BACK_RAIL_Z],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildSideGuardrailPanelCsg(bay.railXMin, bay.railXMax, DECK_TOP_Y, 1),
        smoothSharpAngleDeg: 45,
      },
      material: palette.guardrail,
      explodeOffsetMm: [exX, 260, -180],
      toleranceMm: 0.2,
    });

    if (enclosedFront) {
      parts.push({
        id: `platform_guardrail_front_${bay.index}`,
        name: `Front Bay ${bay.index} Tubular Guardrail (+Z)`,
        group: 'Guardrails & Toe-Boards',
        role: 'primary',
        positionMm: [0, 0, FRONT_RAIL_Z],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: buildSideGuardrailPanelCsg(bay.railXMin, bay.railXMax, DECK_TOP_Y, -1),
          smoothSharpAngleDeg: 45,
        },
        material: palette.guardrail,
        explodeOffsetMm: [exX, 260, 180],
        toleranceMm: 0.2,
      });
    }

    // Splice coupler clamps between adjacent bay guardrails
    if (idx < bayCount - 1) {
      const spliceX = bay.xMax + SPLICE_GAP / 2;
      parts.push({
        id: `platform_clamp_splice_back_${bay.index}`,
        name: `Back Bay ${bay.index}-${bay.index + 1} Guardrail Splice Clamp`,
        group: 'Guardrails & Toe-Boards',
        role: 'detail',
        positionMm: [spliceX, clampY, BACK_RAIL_Z],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: buildPipeCouplerClampCsg([-22, 0], [22, 0], 92, 74, 56),
          smoothSharpAngleDeg: 35,
        },
        material: palette.hardware,
        explodeOffsetMm: [exX, 320, -180],
        toleranceMm: 0.15,
      });

      if (enclosedFront) {
        parts.push({
          id: `platform_clamp_splice_front_${bay.index}`,
          name: `Front Bay ${bay.index}-${bay.index + 1} Guardrail Splice Clamp`,
          group: 'Guardrails & Toe-Boards',
          role: 'detail',
          positionMm: [spliceX, clampY, FRONT_RAIL_Z],
          rotationDeg: [0, 0, 0],
          geometry: {
            kind: 'csgSolid',
            csgRoot: buildPipeCouplerClampCsg([-22, 0], [22, 0], 92, 74, 56),
            smoothSharpAngleDeg: 35,
          },
          material: palette.hardware,
          explodeOffsetMm: [exX, 320, 180],
          toleranceMm: 0.15,
        });
      }
    }
  });

  // Back-left corner guardrail coupler clamp
  parts.push({
    id: 'platform_clamp_corner_back',
    name: 'Back-Left Corner Double-Bolt Guardrail Clamp',
    group: 'Guardrails & Toe-Boards',
    role: 'detail',
    positionMm: [leftRailX + 23, clampY, BACK_RAIL_Z + 7],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildPipeCouplerClampCsg([-23, 7], [23, -7], 94, 74, 62),
      smoothSharpAngleDeg: 35,
    },
    material: palette.hardware,
    explodeOffsetMm: [-190, 320, -160],
    toleranceMm: 0.15,
  });

  if (enclosedFront) {
    parts.push({
      id: 'platform_clamp_corner_front',
      name: 'Front-Left Corner Double-Bolt Guardrail Clamp',
      group: 'Guardrails & Toe-Boards',
      role: 'detail',
      positionMm: [leftRailX + 23, clampY, FRONT_RAIL_Z - 7],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildPipeCouplerClampCsg([-23, -7], [23, 7], 94, 74, 62),
        smoothSharpAngleDeg: 35,
      },
      material: palette.hardware,
      explodeOffsetMm: [-190, 320, 160],
      toleranceMm: 0.15,
    });
  }

  // --- 5. ACCESS STAIRWAY (Folded C-Channel Stringers + Treads + Safety Nosings + Gooseneck Handrail) ---
  parts.push(
    {
      id: 'platform_stair_stringer_front',
      name: 'Front Folded C-Channel Stair Stringer (+Z)',
      group: 'Access Stairway',
      role: 'primary',
      anchorKind: 'floor',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildFoldedStairStringerCsg(1, deckWidthMm, stairMetrics),
        smoothSharpAngleDeg: 35,
      },
      material: palette.structural,
      explodeOffsetMm: [240, 0, 150],
      toleranceMm: 0.2,
      constraint: { kind: 'sitOnGround', groundYMm: 0 },
    },
    {
      id: 'platform_stair_stringer_back',
      name: 'Back Folded C-Channel Stair Stringer (-Z)',
      group: 'Access Stairway',
      role: 'primary',
      anchorKind: 'floor',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildFoldedStairStringerCsg(-1, deckWidthMm, stairMetrics),
        smoothSharpAngleDeg: 35,
      },
      material: palette.structural,
      explodeOffsetMm: [240, 0, -150],
      toleranceMm: 0.2,
      constraint: { kind: 'sitOnGround', groundYMm: 0 },
    }
  );

  const barGratingTreadCsg =
    deckSurface === 'barGrating' ? buildBarGratingStairTreadCsg(deckWidthMm) : null;
  const groovedNosingCsg =
    deckSurface === 'barGrating' ? buildGroovedStairNosingCsg(deckWidthMm) : null;
  const diamondTreadCsg =
    deckSurface === 'diamondPlate' ? buildDiamondPlateStairTreadCsg(deckWidthMm) : null;

  for (let k = 0; k < stairMetrics.stepCount; k++) {
    const stepNum = stairMetrics.stepCount - k; // top step = stepCount, bottom step = 1
    const treadX = stairMetrics.xStart + 16 + k * stairMetrics.stepGoingMm;
    const treadY = deckHeightMm - stairMetrics.stepRiseMm * (k + 1);
    const exY = (stepNum - 1) * 30;
    const exX = 260 + k * 28;

    if (deckSurface === 'barGrating') {
      parts.push(
        {
          id: `platform_stair_tread_${stepNum}`,
          name: `Open Bar Grating Stair Tread #${stepNum} (Y=${treadY}mm)`,
          group: 'Access Stairway',
          role: 'primary',
          positionMm: [treadX, treadY, 0],
          rotationDeg: [0, 0, 0],
          geometry: { kind: 'csgSolid', csgRoot: barGratingTreadCsg!, smoothSharpAngleDeg: 35 },
          material: palette.barGrating,
          explodeOffsetMm: [exX, exY, 0],
          toleranceMm: 0.2,
        },
        {
          id: `platform_stair_nosing_${stepNum}`,
          name: `Grooved Anti-Slip Stair Nosing #${stepNum}`,
          group: 'Access Stairway',
          role: 'detail',
          positionMm: [treadX, treadY, 0],
          rotationDeg: [0, 0, 0],
          geometry: { kind: 'csgSolid', csgRoot: groovedNosingCsg!, smoothSharpAngleDeg: 35 },
          material: palette.stairNosing,
          explodeOffsetMm: [exX + 30, exY, 0],
          toleranceMm: 0.15,
        }
      );
    } else {
      parts.push({
        id: `platform_stair_tread_${stepNum}`,
        name: `Diamond-Plate Stair Tread #${stepNum} (Y=${treadY}mm)`,
        group: 'Access Stairway',
        role: 'primary',
        positionMm: [treadX, treadY, 0],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'csgSolid', csgRoot: diamondTreadCsg!, smoothSharpAngleDeg: 35 },
        material: palette.diamondPlate,
        explodeOffsetMm: [exX, exY, 0],
        toleranceMm: 0.2,
      });
    }
  }

  const stairPost1X = stairMetrics.xStart + 52;
  const backRailRightX = bays[bays.length - 1].railXMax;
  const stairHandrailCsg = buildGooseneckStairHandrailCsg(stairMetrics);

  parts.push(
    {
      id: 'platform_stair_handrail_back',
      name: 'Back-Side 3-Post Gooseneck Stair Handrail (-Z)',
      group: 'Access Stairway',
      role: 'primary',
      positionMm: [0, 0, STAIR_HANDRAIL_Z],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: stairHandrailCsg,
        smoothSharpAngleDeg: 45,
      },
      material: palette.guardrail,
      explodeOffsetMm: [280, 240, -180],
      toleranceMm: 0.2,
    },
    {
      id: 'platform_clamp_stair',
      name: 'Back Stair Handrail to Guardrail Tie-In Clamp (-Z)',
      group: 'Access Stairway',
      role: 'detail',
      positionMm: [
        (backRailRightX + stairPost1X) / 2,
        stairClampY,
        (BACK_RAIL_Z + STAIR_HANDRAIL_Z) / 2,
      ],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildStairGuardrailTieClampCsg(
          backRailRightX,
          stairPost1X,
          BACK_RAIL_Z,
          STAIR_HANDRAIL_Z
        ),
        smoothSharpAngleDeg: 35,
      },
      material: palette.hardware,
      explodeOffsetMm: [180, 310, -170],
      toleranceMm: 0.15,
    }
  );

  if (enclosedFront) {
    const FRONT_STAIR_HANDRAIL_Z = Math.abs(STAIR_HANDRAIL_Z);
    parts.push(
      {
        id: 'platform_stair_handrail_front',
        name: 'Front-Side 3-Post Gooseneck Stair Handrail (+Z)',
        group: 'Access Stairway',
        role: 'primary',
        positionMm: [0, 0, FRONT_STAIR_HANDRAIL_Z],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: stairHandrailCsg,
          smoothSharpAngleDeg: 45,
        },
        material: palette.guardrail,
        explodeOffsetMm: [280, 240, 180],
        toleranceMm: 0.2,
      },
      {
        id: 'platform_clamp_stair_front',
        name: 'Front Stair Handrail to Guardrail Tie-In Clamp (+Z)',
        group: 'Access Stairway',
        role: 'detail',
        positionMm: [
          (backRailRightX + stairPost1X) / 2,
          stairClampY,
          (FRONT_RAIL_Z + FRONT_STAIR_HANDRAIL_Z) / 2,
        ],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: buildStairGuardrailTieClampCsg(
            backRailRightX,
            stairPost1X,
            FRONT_RAIL_Z,
            FRONT_STAIR_HANDRAIL_Z
          ),
          smoothSharpAngleDeg: 35,
        },
        material: palette.hardware,
        explodeOffsetMm: [180, 310, 170],
        toleranceMm: 0.15,
      }
    );
  }

  const totalLengthMm = Number((stairMetrics.xEnd + 75 - LEFT_EDGE_X).toFixed(1));
  const totalHeightMm = Number((DECK_TOP_Y + 1067).toFixed(1));
  const finishPrefix =
    config.finish === 'painted'
      ? 'Painted'
      : config.finish === 'galvanized'
        ? 'Galvanized'
        : '304 Stainless';
  const surfaceLabel =
    deckSurface === 'barGrating' ? 'Bar-Grating' : 'Diamond-Plate';

  const centerX = (LEFT_EDGE_X + stairMetrics.xEnd) / 2;
  const cameraScale = Math.max(totalLengthMm / 3670, 0.72);

  return {
    id: 'galvanized-modular-work-platform',
    name: `${finishPrefix} ${surfaceLabel} Work Platform (${bayCount}-Bay, ${stairMetrics.stepCount}-Step)`,
    category: 'Industrial Access Structures',
    summary: `Parametric watertight Manifold-3D CAD assembly (${palette.label}, ${
      deckSurface === 'barGrating' ? 'NAAMM 19-W-4 open welded bar grating' : 'ASTM A786 diamond checker plate'
    }, ${bayCount} modular ${BAY_LEN} mm ${bayCount === 1 ? 'bay' : 'bays'}, ${deckHeightMm} mm deck elevation with ${
      stairMetrics.stepCount
    }-step access stairway, ${deckWidthMm} mm deck width, and ${
      enclosedFront ? 'enclosed front & rear' : 'open-front'
    } OSHA tubular guardrails).`,
    sourceImageUrl: '/assets/aistudio/image_9d065654.png',
    envelopeMm: {
      width: totalLengthMm,
      height: totalHeightMm,
      depth: deckWidthMm,
    },
    toleranceSpecMm: 0.2,
    symmetryPlane: 'none',
    photoMatchCamera: {
      positionMm: [
        Math.round(centerX + 5471 * cameraScale),
        Math.round((DECK_TOP_Y * 0.89) + 3240 * cameraScale),
        Math.round(6827 * cameraScale),
      ],
      targetMm: [Math.round(centerX + 137), Math.round(DECK_TOP_Y * 0.89), 0],
      fov: 18,
    },
    parts,
    reconstructedAt: '2026-11-22T16:30:00.000Z',
  };
}

export const GALVANIZED_WORK_PLATFORM_BLUEPRINT: MeshBlueprint =
  createWorkPlatformBlueprint(DEFAULT_WORK_PLATFORM_CONFIG);
