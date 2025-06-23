//--
// Utility function to generate a shader for the sparkjs library
// 
// This is a wrapper around the sparkjs library that allows for easy
// generation of shaders for the sparkjs library.
//--
import { SplatGenerator, SplatTransformer, dyno } from "@sparkjsdev/spark";

const {
  combine,
  combineGsplat,
  defineGsplat,
  dynoBlock,
  dynoConst,
  dynoFloat,
  dynoLiteral,
  Gsplat
} = dyno;

export const DEFAULT_SHADER: Record<string, never> = {};

export function shaderBox({
  infunc,
  numSplats,
  globals,
  onFrame,
}: {
  infunc: (
    index: number,
    dynoTime: ReturnType<typeof dynoFloat>,
    globals: Record<string, unknown>,
  ) => {
    position: ReturnType<typeof combine>;
    scales: ReturnType<typeof dynoConst>;
    quaternion: ReturnType<typeof dynoConst>;
    rgb: ReturnType<typeof dynoConst>;
    opacity: ReturnType<typeof dynoConst>;
  };
  numSplats?: number;
  globals?: Record<string, unknown>;
  onFrame?: ({
    object,
    time,
    deltaTime,
  }: { object: SplatGenerator; time: number; deltaTime: number }) => void;
}) {
  const dynoTime = dynoFloat(0);
  let dynoGlobals: Record<string, unknown>;
  if (
    typeof globals === "object" &&
    globals !== null &&
    !Array.isArray(globals)
  ) {
    dynoGlobals = globals;
  } else {
    dynoGlobals = {};
  }
  const splatFunc = infunc;

  console.log("dynoGlobals initialized:", dynoGlobals);

  const shadergen = new SplatGenerator({
    numSplats,
    generator: dynoBlock(
      { index: "int" },
      { gsplat: Gsplat },
      ({ index }) => {
        const splat = splatFunc(index, dynoTime, dynoGlobals);

        let gsplat = combineGsplat({
          flags: dynoLiteral("uint", "GSPLAT_FLAG_ACTIVE"),
          index: index,
          center: splat.position,
          scales: splat.scales,
          quaternion: splat.quaternion,
          rgb: splat.rgb,
          opacity: splat.opacity,
        });
        gsplat = transformer.applyGsplat(gsplat);
        return { gsplat };
      },
      {
        globals: () => [defineGsplat],
      },
    ),
    construct: () => ({}),
    update: ({ object, time, deltaTime }) => {
      dynoTime.value = time;

      if (dynoGlobals.updateFrame) {
        dynoGlobals.updateFrame(time);
      }
      const _updated = transformer.update(shadergen);

      onFrame?.({ object, time, deltaTime });
      shadergen.updateVersion();
    },
  });

  const transformer: SplatTransformer = new SplatTransformer();
  return {
    shadergen,
  };
}

export type SHADER_RESULT_TYPE = ReturnType<typeof shaderBox>;
