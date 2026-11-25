import * as THREE from 'three';
import { MeshBlueprint } from '../types/blueprint';
import { serializeInstallationUsdaScope } from './installationOverlay';
import {
  applySimCommand,
  createInitialSimState,
  stepSimState,
} from './machineSimEngine';

const MM_TO_IN = 1 / 25.4;

export interface SotMeshTextureBindings {
  /** Relative USD asset path, e.g. "./textures/decal_branding.png" */
  diffuse?: string;
  /** Relative USD asset path to tangent-space normal map */
  normal?: string;
  /** Relative USD asset path to grayscale roughness map */
  roughness?: string;
  /** Relative USD asset path to sRGB emissive map */
  emissive?: string;
  /** If true, wire diffuse texture alpha channel to opacity (for decals/signage) */
  useAlphaOpacity?: boolean;
  /** Wrap mode: "repeat" (default) or "clamp" (recommended for decals/screens) */
  wrapMode?: 'repeat' | 'clamp';
}

function sanitizeUsdIdent(raw: string, fallback = 'Part'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) return fallback;
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

function fmt(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6) return '0';
  return Number(n.toFixed(4)).toString();
}

interface ExportMaterialRecord {
  matKey: string;
  color: [number, number, number];
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  opacity: number;
  ior: number;
  emissive: [number, number, number];
  emissiveIntensity: number;
  textures?: SotMeshTextureBindings;
}

/**
 * Converts an 18D (mm, Y-up, front +Z) export group into a SOT-compliant
 * OpenUSD (.usda) string:
 *   - metersPerUnit = 0.0254 (inches)
 *   - upAxis = "Z"
 *   - front -> -Y  (rigid +90° X rotation: (x, y, z)_mm -> (x, -z, y)_in)
 *   - floor at z = 0
 *   - defaultPrim set
 *   - UsdPreviewSurface + OmniPBR per material (with full PBR + UsdUVTexture support)
 *   - primvars:st UVs on every mesh (uv_check.py = 0)
 */
export function serializeGroupToSotUsda(
  exportGroup: THREE.Group,
  blueprint: MeshBlueprint,
  buildRevision?: number
): string {
  exportGroup.updateMatrixWorld(true);

  const rootPrim = sanitizeUsdIdent(blueprint.id || blueprint.name, 'Model18D');
  const meshes: {
    primName: string;
    partId?: string;
    matKey: string;
    doubleSided: boolean;
    points: [number, number, number][];
    normals: [number, number, number][];
    uvs: [number, number][];
    indices: number[];
  }[] = [];

  const uniqueMats = new Map<string, ExportMaterialRecord>();
  const usedNames = new Map<string, number>();
  let globalMinZ = Infinity;

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMat = new THREE.Matrix3();

  exportGroup.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.visible || !obj.geometry) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return;

    const normAttr = geom.getAttribute('normal');
    const uvAttr = geom.getAttribute('uv');
    const idxAttr = geom.getIndex();

    const baseName = sanitizeUsdIdent(obj.name || (obj.userData?.partId as string) || 'Mesh', 'Mesh');
    const count = usedNames.get(baseName) ?? 0;
    usedNames.set(baseName, count + 1);
    const primName = count === 0 ? baseName : `${baseName}_${count}`;

    normalMat.getNormalMatrix(obj.matrixWorld);

    const points: [number, number, number][] = [];
    const normals: [number, number, number][] = [];
    const uvs: [number, number][] = [];

    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(obj.matrixWorld);
      // Y-up mm -> Z-up inch (front +Z -> -Y, up +Y -> +Z)
      const xIn = v.x * MM_TO_IN;
      const yIn = -v.z * MM_TO_IN;
      const zIn = v.y * MM_TO_IN;
      if (zIn < globalMinZ) globalMinZ = zIn;
      points.push([xIn, yIn, zIn]);

      let nx = 0;
      let ny = 0;
      let nz = 1;
      if (normAttr) {
        n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize();
        nx = n.x;
        ny = -n.z;
        nz = n.y;
      }
      normals.push([nx, ny, nz]);

      if (uvAttr) {
        uvs.push([uvAttr.getX(i), uvAttr.getY(i)]);
      } else {
        // Dominant-axis box-projected UV (12 in tile) so textured PBR maps never stretch
        const ax = Math.abs(nx);
        const ay = Math.abs(ny);
        const az = Math.abs(nz);
        if (az >= ax && az >= ay) {
          uvs.push([xIn / 12.0, yIn / 12.0]);
        } else if (ax >= ay && ax >= az) {
          uvs.push([yIn / 12.0, zIn / 12.0]);
        } else {
          uvs.push([xIn / 12.0, zIn / 12.0]);
        }
      }
    }

    const indices: number[] = [];
    if (idxAttr) {
      for (let i = 0; i < idxAttr.count; i++) {
        indices.push(idxAttr.getX(i));
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices.push(i);
      }
    }
    if (indices.length < 3) return;

    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const phys = mat as THREE.MeshPhysicalMaterial | undefined;
    const c = phys?.color ?? new THREE.Color('#888888');
    const color: [number, number, number] = [c.r, c.g, c.b];
    const metallic = typeof phys?.metalness === 'number' ? phys.metalness : 0.1;
    const roughness = typeof phys?.roughness === 'number' ? phys.roughness : 0.5;
    const clearcoat = typeof phys?.clearcoat === 'number' ? phys.clearcoat : 0.0;
    const clearcoatRoughness = typeof phys?.clearcoatRoughness === 'number' ? phys.clearcoatRoughness : 0.15;
    const opacity = typeof phys?.opacity === 'number' ? phys.opacity : 1.0;
    const ior = typeof phys?.ior === 'number' ? phys.ior : 1.5;
    const eCol = phys?.emissive ?? new THREE.Color(0x000000);
    const emissiveIntensity = typeof phys?.emissiveIntensity === 'number' ? phys.emissiveIntensity : 0.0;
    const emissive: [number, number, number] = [
      eCol.r * emissiveIntensity,
      eCol.g * emissiveIntensity,
      eCol.b * emissiveIntensity,
    ];
    const textures = obj.userData?.sotTextures as SotMeshTextureBindings | undefined;
    const finishLabel = (obj.userData?.finishName as string | undefined) || phys?.name || '';

    const texSig = textures
      ? `${textures.diffuse || ''}|${textures.normal || ''}|${textures.roughness || ''}|${textures.emissive || ''}|${textures.useAlphaOpacity ? 'a' : ''}`
      : '';
    const rawKey = finishLabel
      ? `${finishLabel}${texSig ? '_' + sanitizeUsdIdent(textures?.diffuse || 'tex') : ''}`
      : `Mat_${Math.round(color[0] * 255)}_${Math.round(color[1] * 255)}_${Math.round(color[2] * 255)}_m${Math.round(metallic * 100)}_r${Math.round(roughness * 100)}`;
    const matKey = sanitizeUsdIdent(rawKey, 'Mat');

    if (!uniqueMats.has(matKey)) {
      uniqueMats.set(matKey, {
        matKey,
        color,
        metallic,
        roughness,
        clearcoat,
        clearcoatRoughness,
        opacity,
        ior,
        emissive,
        emissiveIntensity,
        textures,
      });
    }

    const doubleSided =
      Boolean(obj.userData?.isDecal) ||
      opacity < 0.999 ||
      phys?.side === THREE.DoubleSide;

    meshes.push({
      primName,
      partId: typeof obj.userData?.partId === 'string' ? obj.userData.partId : undefined,
      matKey,
      doubleSided,
      points,
      normals,
      uvs,
      indices,
    });
  });

  // Ground assembly on z = 0
  const zShift = Number.isFinite(globalMinZ) ? -globalMinZ : 0;

  // Pre-bake deterministic 30 fps simulation cycle into USD timeSamples so the .usda animates
  // natively when opened in Omniverse Composer / Kit / usdview (and can be overridden live by Sim18DDriver)
  const SIM_FPS = 30;
  let bakedEndFrame = 0;
  const bakedPartSamples = new Map<string, string[]>();
  const bakedJetPosSamples: string[] = [];
  const bakedJetVisSamples: string[] = [];

  if (blueprint.simulation && blueprint.simulation.toolpath.length > 0) {
    const spec = blueprint.simulation;
    let sim = applySimCommand(createInitialSimState(spec), spec, 'start');
    const maxFrames = SIM_FPS * 90; // cap at 90s
    const dt = 1 / SIM_FPS;
    const sampleEvery = 3; // 10 Hz keyframes (smooth linear interpolation in USD, compact file size)
    let lastJetVis = '';

    for (let f = 0; f <= maxFrames; f++) {
      const isLast = sim.state === 'COMPLETE' || f === maxFrames;
      if (f % sampleEvery === 0 || isLast) {
        bakedEndFrame = f;
        // Sum axis offsets per partId -> SOT USD (x, -z, y)_in
        const perPart = new Map<string, [number, number, number]>();
        for (const ax of spec.axes) {
          const val = sim.axisOffsetsMm[ax.id] ?? 0;
          for (const pid of ax.partIds) {
            const vec = perPart.get(pid) || [0, 0, 0];
            if (ax.motionAxis === 'x') vec[0] += val;
            else if (ax.motionAxis === 'y') vec[1] += val;
            else if (ax.motionAxis === 'z') vec[2] += val;
            perPart.set(pid, vec);
          }
        }
        for (const [pid, [vx, vy, vz]] of perPart.entries()) {
          const arr = bakedPartSamples.get(pid) || [];
          arr.push(`${f}: (${fmt(vx * MM_TO_IN)}, ${fmt(-vz * MM_TO_IN)}, ${fmt(vy * MM_TO_IN)})`);
          bakedPartSamples.set(pid, arr);
        }

        const [nx, ny, nz] = sim.nozzleTipWorldMm;
        bakedJetPosSamples.push(`${f}: (${fmt(nx * MM_TO_IN)}, ${fmt(-nz * MM_TO_IN)}, ${fmt(ny * MM_TO_IN)})`);
        const vis = sim.jetActive ? '"inherited"' : '"invisible"';
        if (vis !== lastJetVis || isLast) {
          bakedJetVisSamples.push(`${f}: ${vis}`);
          lastJetVis = vis;
        }
      }
      if (isLast) break;
      sim = stepSimState(sim, spec, dt);
    }
  }

  const out: string[] = [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrim}"`,
    '    metersPerUnit = 0.0254',
    '    upAxis = "Z"',
    ...(bakedEndFrame > 0
      ? [
          '    startTimeCode = 0',
          `    endTimeCode = ${bakedEndFrame}`,
          `    timeCodesPerSecond = ${SIM_FPS}`,
        ]
      : []),
    `    doc = "18D SOT USD Export: ${blueprint.name.replace(/"/g, "'")} (r${buildRevision ?? 1}) | Z-up, inches, front -Y, z=0"`,
    ')',
    '',
    `def Xform "${rootPrim}" (`,
    '    kind = "component"',
    ')',
    '{',
    '    def Scope "Geom"',
    '    {',
  ];

  for (const m of meshes) {
    const triCount = Math.floor(m.indices.length / 3);
    const fvc = new Array(triCount).fill('3').join(', ');
    const fvi = m.indices.slice(0, triCount * 3).join(', ');
    const pts = m.points.map(([x, y, z]) => `(${fmt(x)}, ${fmt(y)}, ${fmt(z + zShift)})`).join(', ');
    const nrms = m.normals.map(([x, y, z]) => `(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`).join(', ');
    const st = m.uvs.map(([u, vv]) => `(${fmt(u)}, ${fmt(vv)})`).join(', ');

    out.push(`        def Mesh "${m.primName}" (`);
    out.push('            prepend apiSchemas = ["MaterialBindingAPI"]');
    if (m.partId) {
      out.push('            customData = {');
      out.push(`                string partId = "${m.partId.replace(/"/g, "'")}"`);
      out.push('            }');
    }
    out.push('        )');
    out.push('        {');
    out.push(`            uniform bool doubleSided = ${m.doubleSided ? '1' : '0'}`);
    out.push('            uniform token subdivisionScheme = "none"');
    out.push(`            int[] faceVertexCounts = [${fvc}]`);
    out.push(`            int[] faceVertexIndices = [${fvi}]`);
    out.push(`            point3f[] points = [${pts}]`);
    out.push(`            normal3f[] normals = [${nrms}] (`);
    out.push('                interpolation = "vertex"');
    out.push('            )');
    out.push(`            texCoord2f[] primvars:st = [${st}] (`);
    out.push('                interpolation = "vertex"');
    out.push('            )');
    out.push(`            rel material:binding = </${rootPrim}/Looks/${m.matKey}>`);
    if (m.partId && bakedPartSamples.has(m.partId)) {
      const samples = bakedPartSamples.get(m.partId)!;
      out.push(`            double3 xformOp:translate:simOffset.timeSamples = {`);
      out.push(`                ${samples.join(', ')}`);
      out.push('            }');
      out.push('            uniform token[] xformOpOrder = ["xformOp:translate:simOffset"]');
    }
    out.push('        }');
  }

  out.push('    }');
  out.push('');
  out.push('    def Scope "Looks"');
  out.push('    {');

  for (const [matKey, mat] of uniqueMats.entries()) {
    const matPath = `/${rootPrim}/Looks/${matKey}`;
    const rgb = `(${fmt(mat.color[0])}, ${fmt(mat.color[1])}, ${fmt(mat.color[2])})`;
    const emRgb = `(${fmt(mat.emissive[0])}, ${fmt(mat.emissive[1])}, ${fmt(mat.emissive[2])})`;
    const hasEmissive = mat.emissive[0] > 1e-4 || mat.emissive[1] > 1e-4 || mat.emissive[2] > 1e-4;
    const tex = mat.textures;
    const hasAnyTex = Boolean(tex && (tex.diffuse || tex.normal || tex.roughness || tex.emissive));
    const wrap = tex?.wrapMode ?? 'repeat';

    out.push(`        def Material "${matKey}"`);
    out.push('        {');
    out.push(`            token outputs:surface.connect = <${matPath}/PreviewSurface.outputs:surface>`);
    out.push(`            token outputs:mdl:surface.connect = <${matPath}/OmniPBR.outputs:out>`);
    out.push('');

    if (hasAnyTex) {
      out.push('            def Shader "PrimvarReader_st"');
      out.push('            {');
      out.push('                uniform token info:id = "UsdPrimvarReader_float2"');
      out.push('                token inputs:varname = "st"');
      out.push('                float2 outputs:result');
      out.push('            }');
      out.push('');
    }

    if (tex?.diffuse) {
      out.push('            def Shader "DiffuseTexture"');
      out.push('            {');
      out.push('                uniform token info:id = "UsdUVTexture"');
      out.push(`                asset inputs:file = @${tex.diffuse}@`);
      out.push('                token inputs:sourceColorSpace = "sRGB"');
      out.push(`                token inputs:wrapS = "${wrap}"`);
      out.push(`                token inputs:wrapT = "${wrap}"`);
      out.push(`                float2 inputs:st.connect = <${matPath}/PrimvarReader_st.outputs:result>`);
      out.push('                float3 outputs:rgb');
      out.push('                float outputs:a');
      out.push('            }');
      out.push('');
    }

    if (tex?.normal) {
      out.push('            def Shader "NormalTexture"');
      out.push('            {');
      out.push('                uniform token info:id = "UsdUVTexture"');
      out.push(`                asset inputs:file = @${tex.normal}@`);
      out.push('                token inputs:sourceColorSpace = "raw"');
      out.push(`                token inputs:wrapS = "${wrap}"`);
      out.push(`                token inputs:wrapT = "${wrap}"`);
      out.push('                float4 inputs:scale = (2, 2, 2, 1)');
      out.push('                float4 inputs:bias = (-1, -1, -1, 0)');
      out.push(`                float2 inputs:st.connect = <${matPath}/PrimvarReader_st.outputs:result>`);
      out.push('                float3 outputs:rgb');
      out.push('            }');
      out.push('');
    }

    if (tex?.roughness) {
      out.push('            def Shader "RoughnessTexture"');
      out.push('            {');
      out.push('                uniform token info:id = "UsdUVTexture"');
      out.push(`                asset inputs:file = @${tex.roughness}@`);
      out.push('                token inputs:sourceColorSpace = "raw"');
      out.push(`                token inputs:wrapS = "${wrap}"`);
      out.push(`                token inputs:wrapT = "${wrap}"`);
      out.push(`                float2 inputs:st.connect = <${matPath}/PrimvarReader_st.outputs:result>`);
      out.push('                float outputs:r');
      out.push('            }');
      out.push('');
    }

    if (tex?.emissive) {
      out.push('            def Shader "EmissiveTexture"');
      out.push('            {');
      out.push('                uniform token info:id = "UsdUVTexture"');
      out.push(`                asset inputs:file = @${tex.emissive}@`);
      out.push('                token inputs:sourceColorSpace = "sRGB"');
      out.push(`                token inputs:wrapS = "${wrap}"`);
      out.push(`                token inputs:wrapT = "${wrap}"`);
      out.push(`                float2 inputs:st.connect = <${matPath}/PrimvarReader_st.outputs:result>`);
      out.push('                float3 outputs:rgb');
      out.push('            }');
      out.push('');
    }

    out.push('            def Shader "PreviewSurface"');
    out.push('            {');
    out.push('                uniform token info:id = "UsdPreviewSurface"');
    if (tex?.diffuse) {
      out.push(`                color3f inputs:diffuseColor.connect = <${matPath}/DiffuseTexture.outputs:rgb>`);
    } else {
      out.push(`                color3f inputs:diffuseColor = ${rgb}`);
    }
    out.push(`                float inputs:metallic = ${fmt(mat.metallic)}`);
    if (tex?.roughness) {
      out.push(`                float inputs:roughness.connect = <${matPath}/RoughnessTexture.outputs:r>`);
    } else {
      out.push(`                float inputs:roughness = ${fmt(mat.roughness)}`);
    }
    if (tex?.normal) {
      out.push(`                normal3f inputs:normal.connect = <${matPath}/NormalTexture.outputs:rgb>`);
    }
    if (mat.clearcoat > 0.01) {
      out.push(`                float inputs:clearcoat = ${fmt(mat.clearcoat)}`);
      out.push(`                float inputs:clearcoatRoughness = ${fmt(mat.clearcoatRoughness)}`);
    }
    if (Math.abs(mat.ior - 1.5) > 0.01) {
      out.push(`                float inputs:ior = ${fmt(mat.ior)}`);
    }
    if (tex?.emissive) {
      out.push(`                color3f inputs:emissiveColor.connect = <${matPath}/EmissiveTexture.outputs:rgb>`);
    } else if (hasEmissive) {
      out.push(`                color3f inputs:emissiveColor = ${emRgb}`);
    }
    if (tex?.diffuse && tex?.useAlphaOpacity) {
      out.push(`                float inputs:opacity.connect = <${matPath}/DiffuseTexture.outputs:a>`);
      out.push('                float inputs:opacityThreshold = 0.05');
    } else if (mat.opacity < 0.999) {
      out.push(`                float inputs:opacity = ${fmt(mat.opacity)}`);
    }
    out.push('                token outputs:surface');
    out.push('            }');
    out.push('');

    out.push('            def Shader "OmniPBR"');
    out.push('            {');
    out.push('                uniform token info:implementationSource = "sourceAsset"');
    out.push('                uniform asset info:mdl:sourceAsset = @OmniPBR.mdl@');
    out.push('                uniform token info:mdl:sourceAsset:subIdentifier = "OmniPBR"');
    if (tex?.diffuse) {
      out.push(`                asset inputs:diffuse_texture = @${tex.diffuse}@`);
      out.push('                color3f inputs:diffuse_tint = (1, 1, 1)');
    } else {
      out.push(`                color3f inputs:diffuse_color_constant = ${rgb}`);
    }
    out.push(`                float inputs:metallic_constant = ${fmt(mat.metallic)}`);
    if (tex?.roughness) {
      out.push(`                asset inputs:reflectionroughness_texture = @${tex.roughness}@`);
      out.push('                float inputs:reflection_roughness_texture_influence = 1');
    } else {
      out.push(`                float inputs:reflection_roughness_constant = ${fmt(mat.roughness)}`);
    }
    if (tex?.normal) {
      out.push(`                asset inputs:normalmap_texture = @${tex.normal}@`);
    }
    if (mat.clearcoat > 0.01) {
      out.push('                bool inputs:enable_clearcoat = 1');
      out.push(`                float inputs:clearcoat_weight = ${fmt(mat.clearcoat)}`);
      out.push(`                float inputs:clearcoat_roughness = ${fmt(mat.clearcoatRoughness)}`);
    }
    if (tex?.emissive) {
      out.push('                bool inputs:enable_emission = 1');
      out.push(`                asset inputs:emissive_color_texture = @${tex.emissive}@`);
      out.push(`                float inputs:emissive_intensity = ${fmt(Math.max(0.35, mat.emissiveIntensity))}`);
    } else if (hasEmissive) {
      out.push('                bool inputs:enable_emission = 1');
      out.push(`                color3f inputs:emissive_color = ${emRgb}`);
      out.push(`                float inputs:emissive_intensity = ${fmt(mat.emissiveIntensity)}`);
    }
    if (tex?.diffuse && tex?.useAlphaOpacity) {
      out.push('                bool inputs:enable_opacity = 1');
      out.push('                bool inputs:enable_opacity_texture = 1');
      out.push(`                asset inputs:opacity_texture = @${tex.diffuse}@`);
      out.push('                int inputs:opacity_mode = 0');
    } else if (mat.opacity < 0.999) {
      out.push('                bool inputs:enable_opacity = 1');
      out.push(`                float inputs:opacity_constant = ${fmt(mat.opacity)}`);
    }
    out.push('                token outputs:out');
    out.push('            }');
    out.push('        }');
  }

  out.push('    }');
  out.push(...serializeInstallationUsdaScope(blueprint, '    ', `/${rootPrim}`));
  if (blueprint.simulation) {
    const sim = blueprint.simulation;
    const simJson = JSON.stringify(sim).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    out.push('');
    out.push('    def Scope "Simulation" (');
    out.push('        customData = {');
    out.push('            string format = "18d-kit-sim-manifest/1"');
    out.push(`            string simSpecJson = "${simJson}"`);
    out.push('        }');
    out.push('    )');
    out.push('    {');
    // Emit Workpiece Plate mesh if defined (Z-up, inches, front -Y)
    if (sim.workpiece) {
      const wp = sim.workpiece;
      const hx = (wp.sizeMm[0] * 0.5) * MM_TO_IN;
      const hy = (wp.sizeMm[2] * 0.5) * MM_TO_IN;
      const hz = (wp.sizeMm[1] * 0.5) * MM_TO_IN;
      const cx = wp.positionMm[0] * MM_TO_IN;
      const cy = -wp.positionMm[2] * MM_TO_IN;
      const cz = wp.positionMm[1] * MM_TO_IN;
      const pts = [
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
      ];
      const fvc = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
      const fvi = [
        4, 5, 6, 4, 6, 7, // +Z top
        0, 2, 1, 0, 3, 2, // -Z bottom
        0, 1, 5, 0, 5, 4, // -Y front
        2, 3, 7, 2, 7, 6, // +Y back
        1, 2, 6, 1, 6, 5, // +X right
        3, 0, 4, 3, 4, 7, // -X left
      ];
      const uvs = pts.map((_p, i) => `(${i % 2}, ${i >= 4 ? 1 : 0})`).join(', ');
      const ptsStr = pts.map(([x, y, z]) => `(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`).join(', ');
      out.push('        def Material "WorkpieceMat"');
      out.push('        {');
      out.push(`            token outputs:surface.connect = </${rootPrim}/Simulation/WorkpieceMat/PreviewSurface.outputs:surface>`);
      out.push(`            token outputs:mdl:surface.connect = </${rootPrim}/Simulation/WorkpieceMat/OmniPBR.outputs:out>`);
      out.push('            def Shader "PreviewSurface"');
      out.push('            {');
      out.push('                uniform token info:id = "UsdPreviewSurface"');
      out.push('                color3f inputs:diffuseColor = (0.39, 0.45, 0.54)');
      out.push('                float inputs:metallic = 0.78');
      out.push('                float inputs:roughness = 0.36');
      out.push('                token outputs:surface');
      out.push('            }');
      out.push('            def Shader "OmniPBR"');
      out.push('            {');
      out.push('                uniform token info:implementationSource = "sourceAsset"');
      out.push('                uniform asset info:mdl:sourceAsset = @OmniPBR.mdl@');
      out.push('                uniform token info:mdl:sourceAsset:subIdentifier = "OmniPBR"');
      out.push('                color3f inputs:diffuse_color_constant = (0.39, 0.45, 0.54)');
      out.push('                float inputs:metallic_constant = 0.78');
      out.push('                float inputs:reflection_roughness_constant = 0.36');
      out.push('                token outputs:out');
      out.push('            }');
      out.push('        }');
      out.push('        def Mesh "Workpiece" (');
      out.push('            prepend apiSchemas = ["MaterialBindingAPI"]');
      out.push('        )');
      out.push('        {');
      out.push(`            rel material:binding = </${rootPrim}/Simulation/WorkpieceMat>`);
      out.push(`            int[] faceVertexCounts = [${fvc.join(', ')}]`);
      out.push(`            int[] faceVertexIndices = [${fvi.join(', ')}]`);
      out.push(`            point3f[] points = [${ptsStr}]`);
      out.push(`            texCoord2f[] primvars:st = [${uvs}] (`);
      out.push('                interpolation = "vertex"');
      out.push('            )');
      out.push('        }');
    }
    // Emit JetBeam mesh (hidden by default; shown & moved by Sim18DDriver when jetActive)
    {
      const r = 0.22;
      const h = 5.5;
      const pts = [
        [-r, -r, -h], [r, -r, -h], [r, r, -h], [-r, r, -h],
        [-r, -r, 0], [r, -r, 0], [r, r, 0], [-r, r, 0],
      ];
      const fvc = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
      const fvi = [4, 5, 6, 4, 6, 7, 0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
      const uvs = pts.map((_p, i) => `(${i % 2}, ${i >= 4 ? 1 : 0})`).join(', ');
      const ptsStr = pts.map(([x, y, z]) => `(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`).join(', ');
      out.push('        def Material "JetBeamMat"');
      out.push('        {');
      out.push(`            token outputs:surface.connect = </${rootPrim}/Simulation/JetBeamMat/PreviewSurface.outputs:surface>`);
      out.push(`            token outputs:mdl:surface.connect = </${rootPrim}/Simulation/JetBeamMat/OmniPBR.outputs:out>`);
      out.push('            def Shader "PreviewSurface"');
      out.push('            {');
      out.push('                uniform token info:id = "UsdPreviewSurface"');
      out.push('                color3f inputs:diffuseColor = (0.22, 0.74, 0.97)');
      out.push('                color3f inputs:emissiveColor = (0.22, 0.74, 0.97)');
      out.push('                float inputs:opacity = 0.88');
      out.push('                token outputs:surface');
      out.push('            }');
      out.push('            def Shader "OmniPBR"');
      out.push('            {');
      out.push('                uniform token info:implementationSource = "sourceAsset"');
      out.push('                uniform asset info:mdl:sourceAsset = @OmniPBR.mdl@');
      out.push('                uniform token info:mdl:sourceAsset:subIdentifier = "OmniPBR"');
      out.push('                color3f inputs:diffuse_color_constant = (0.22, 0.74, 0.97)');
      out.push('                bool inputs:enable_emission = 1');
      out.push('                color3f inputs:emissive_color = (0.22, 0.74, 0.97)');
      out.push('                float inputs:emissive_intensity = 1.6');
      out.push('                token outputs:out');
      out.push('            }');
      out.push('        }');
      out.push('        def Mesh "JetBeam" (');
      out.push('            prepend apiSchemas = ["MaterialBindingAPI"]');
      out.push('        )');
      out.push('        {');
      if (bakedJetVisSamples.length > 0) {
        out.push(`            token visibility.timeSamples = { ${bakedJetVisSamples.join(', ')} }`);
      } else {
        out.push('            token visibility = "invisible"');
      }
      if (bakedJetPosSamples.length > 0) {
        out.push(`            double3 xformOp:translate:simJetPos.timeSamples = {`);
        out.push(`                ${bakedJetPosSamples.join(', ')}`);
        out.push('            }');
        out.push('            uniform token[] xformOpOrder = ["xformOp:translate:simJetPos"]');
      }
      out.push(`            rel material:binding = </${rootPrim}/Simulation/JetBeamMat>`);
      out.push(`            int[] faceVertexCounts = [${fvc.join(', ')}]`);
      out.push(`            int[] faceVertexIndices = [${fvi.join(', ')}]`);
      out.push(`            point3f[] points = [${ptsStr}]`);
      out.push(`            texCoord2f[] primvars:st = [${uvs}] (`);
      out.push('                interpolation = "vertex"');
      out.push('            )');
      out.push('        }');
    }
    out.push('    }');
  }
  out.push('}');
  out.push('');

  return out.join('\n');
}
