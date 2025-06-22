// --
// Dynamic Audio Visualization using FBM 
// --
import * as THREE from "three";

import { dyno } from "@sparkjsdev/spark";

const { mul, combine, dynoVec3, dynoConst, dynoFloat, hashVec4 } = dyno;

// These are helper files to remove a bunch of the dyno / shader boilerplate
import { d } from "./dynoexp.ts";
import * as ShaderGen from "./shadergen.js";

import {
  SparkRenderer,
  FpsMovement,
  PointerControls,
  SplatMesh,
  VRButton,
  constructGrid,
} from "@sparkjsdev/spark";

// Set of global variables that are available to the shader during the render loop
const globalSpeed = dynoFloat(1.5);
const globalScale = dynoFloat(0.4);
const globalFrequency = dynoFloat(0.2);
const globalAmplitude = dynoFloat(1);
const globalPhase = dynoFloat(0.5);
const globalOctaves = dynoFloat(5);
const globalLacunarity = dynoFloat(2.0);
const globalPersistence = dynoFloat(0.5);

const globalOpacity = dynoFloat(0.5);
const globalRed = dynoFloat(0.16);
const globalGreen = dynoFloat(0.16);
const globalBlue = dynoFloat(0.32);
const globalRed2 = dynoFloat(0.36);
const globalGreen2 = dynoFloat(0.36);
const globalBlue2 = dynoFloat(0.64);

function renderfunc(index, dynoTime, dynoGlobals) {
  const random = hashVec4(index);
  let position = dynoConst("vec3", [0, 0, 0]);

  const amplitude = globalAmplitude;
  const frequency = globalFrequency;
  const speed = globalSpeed;
  const phase = globalPhase;

  // fBm parameters
  const lacunarity = globalLacunarity; // How frequency increases each octave
  const persistence = globalPersistence; // How amplitude decreases each octave

  const xPos = d`(${random}.x * ${dynoTime} * ${speed}) % 15`;
  const zPos = d`${random}.z * 15`;

  // Base value for fBm noise
  let yPos = d`0.0`;

  // Dynamically build fBm noise by summing octaves

  // octave 1
  // Calculate this octave's amplitude and frequency
  let octaveAmp = d`${amplitude} * pow(${persistence}, 1)`;
  let octaveFreq = d`${frequency} * pow(${lacunarity}, 1)`;

  // // Time offset for this octave
  let timeOffset = d`${dynoTime} * ${phase} * (1+1)`;

  // // Calculate this octave's contribution and add it to the result
  let octaveValue = d`${octaveAmp} * sin(${xPos} * ${octaveFreq} + ${timeOffset}) * sin(${zPos} * ${octaveFreq} + ${timeOffset})`;

  yPos = d`${yPos} + ${octaveValue}`;

  // Octave 2
  let doOctave = d`step(2, ${globalOctaves})`;
  octaveAmp = d`${amplitude} * pow(${persistence}, 2)`;
  octaveFreq = d`${frequency} * pow(${lacunarity}, 2)`;
  timeOffset = d`${dynoTime} * ${phase} * (2+1)`;
  octaveValue = d`${octaveAmp} * sin(${xPos} * ${octaveFreq} + ${timeOffset}) * sin(${zPos} * ${octaveFreq} + ${timeOffset})`;
  yPos = d`${yPos} + ${doOctave} * ${octaveValue}`;

  // Octave 3
  doOctave = d`step(3, ${globalOctaves})`;
  octaveAmp = d`${amplitude} * pow(${persistence}, 3)`;
  octaveFreq = d`${frequency} * pow(${lacunarity}, 3)`;
  timeOffset = d`${dynoTime} * ${phase} * (3+1)`;
  octaveValue = d`${octaveAmp} * sin(${xPos} * ${octaveFreq} + ${timeOffset}) * sin(${zPos} * ${octaveFreq} + ${timeOffset})`;
  yPos = d`${yPos} + (${doOctave} * ${octaveValue})`;

  // Octave 4
  doOctave = d`step(4, ${globalOctaves})`;
  octaveAmp = d`${amplitude} * pow(${persistence}, 4)`;
  octaveFreq = d`${frequency} * pow(${lacunarity}, 4)`;
  timeOffset = d`${dynoTime} * ${phase} * (4+1)`;
  octaveValue = d`${octaveAmp} * sin(${xPos} * ${octaveFreq} + ${timeOffset}) * sin(${zPos} * ${octaveFreq} + ${timeOffset})`;
  yPos = d`${yPos} + (${doOctave} * ${octaveValue})`;

  // Octave 5
  doOctave = d`step(5, ${globalOctaves})`;
  octaveAmp = d`${amplitude} * pow(${persistence}, 5)`;
  octaveFreq = d`${frequency} * pow(${lacunarity}, 5)`;
  timeOffset = d`${dynoTime} * ${phase} * (5+1)`;
  octaveValue = d`${octaveAmp} * sin(${xPos} * ${octaveFreq} + ${timeOffset}) * sin(${zPos} * ${octaveFreq} + ${timeOffset})`;
  yPos = d`${yPos} + (${doOctave} * ${octaveValue})`;

  position = combine({ vectorType: "vec3", x: xPos, y: yPos, z: zPos });

  const dynoColor1 = combine({
    vectorType: "vec3",
    x: globalRed,
    y: globalGreen,
    z: globalBlue,
  });
  const dynoColor2 = combine({
    vectorType: "vec3",
    x: globalRed2,
    y: globalGreen2,
    z: globalBlue2,
  });

  const mix = d`sin(${yPos}+.5)`;
  const rgb = d`mix(${dynoColor1}, ${dynoColor2}, ${mix})`;

  const anisoScale = dynoConst("vec3", [1, 1.5, 1]);

  const scales = d`${anisoScale} * ${dynoGlobals.scale}`;
  const dynoOpacity = globalOpacity;

  const quaternion = dynoConst(
    "vec4",
    new THREE.Quaternion(
      Math.random() * 0.1,
      Math.random() * 0.1,
      Math.random() * 0.1,
      1,
    ),
  );

  return {
    position: position,
    rgb: rgb,
    opacity: dynoOpacity,
    scales: scales,
    quaternion: quaternion,
  };
}

const audio = document.getElementById('audio');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 128; // You can try 256, 512, etc.

const source = audioCtx.createMediaElementSource(audio);
source.connect(analyser);
analyser.connect(audioCtx.destination);

const bufferLength = analyser.frequencyBinCount;
console.log("bufferLength: ", bufferLength);
const dataArray = new Uint8Array(bufferLength);

function updateFrequency() {

  analyser.getByteFrequencyData(dataArray);

  const scale = dataArray[0] * 0.002;
  globalScale.value = scale;

  const frequency = dataArray[1] * 0.001;
  globalFrequency.value = frequency;

  const amplitude = dataArray[2] * 0.007;
  globalAmplitude.value = amplitude;

  const green = dataArray[3] * 0.003;
  globalGreen.value = green;

  const blue = dataArray[4] * 0.004;
  globalBlue.value = blue;

  const red = dataArray[5] * 0.004;
  globalRed.value = red;

  const green2 = dataArray[6] * 0.0005;
  globalGreen2.value = green2;

  const blue2 = dataArray[7] * 0.001;
  globalBlue2.value = blue2;

  const red2 = dataArray[7] * 0.001;
  globalRed2.value = red2;

  const persistence = dataArray[8] * 0.003;
  globalPersistence.value = persistence;

  // If you want to iterate over all frequencies, you can do this:
  // for (let i = 0; i < bufferLength; i++) {
  //   // const val = dataArray[i];
  // }
}

async function main() {
  const canvas = document.getElementById("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas });
  const scene = new THREE.Scene();

  // Create a SparkRenderer and add it to the scene to render all the Gsplats.
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const camera = new THREE.PerspectiveCamera(
    75,
    canvas.width / canvas.height,
    0.1,
    1000,
  );
  camera.position.set(8, 5, 25);
  scene.add(camera);

  const fpsMovement = new FpsMovement({ moveSpeed: 0.5 });
  const pointerControls = new PointerControls({ canvas });

  function handleResize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  handleResize();
  window.addEventListener("resize", handleResize);

  const vrButton = VRButton.createButton(renderer);
  if (vrButton) {
    document.body.appendChild(vrButton);
  }

  const shadergen = ShaderGen.shaderBox({
    infunc: renderfunc,
    numSplats: 20000,
    globals: {
      anisoScale: dynoVec3(new THREE.Vector3(0.1, 0.1, 0.1)),
      updateFrame(time) {
        this.scale = mul(this.anisoScale, globalScale);
      },
    },
  });
  scene.add(shadergen.shadergen);

  console.log("Starting render loop");
  let lastTime;

  renderer.setAnimationLoop((time) => {
    const timeSeconds = time * 0.001;
    const deltaTime = timeSeconds - (lastTime ?? timeSeconds);
    lastTime = timeSeconds;

    pointerControls.update(deltaTime, camera);
    fpsMovement.update(deltaTime, camera);

    updateFrequency();

    renderer.render(scene, camera);
  });
}

main().catch(console.error);

// Required for browser autoplay policy
audio.addEventListener('play', () => {
  audioCtx.resume();
});