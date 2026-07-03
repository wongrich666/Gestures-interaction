import type { LiquidControls, LiquidMode } from '../core/types'

type RenderOptions = {
  source: HTMLVideoElement
  width: number
  height: number
  mirrored: boolean
  fingers: Float32Array
  controls: LiquidControls
  mode: LiquidMode
  now: number
}

type ProgramInfo = {
  program: WebGLProgram
  attributes: {
    position: number
  }
  uniforms: Record<string, WebGLUniformLocation | null>
}

type Target = {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
}

const FINGER_FLOATS = 30

export class LiquidRealityRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly gl: WebGLRenderingContext
  private readonly simProgram: ProgramInfo
  private readonly renderProgram: ProgramInfo
  private readonly quadBuffer: WebGLBuffer
  private readonly videoTexture: WebGLTexture
  private targets: Target[] = []
  private targetIndex = 0
  private width = 0
  private height = 0
  private simWidth = 0
  private simHeight = 0
  private readonly prevFingers = new Float32Array(FINGER_FLOATS)
  private error: string | null = null

  constructor(canvas = document.createElement('canvas')) {
    this.canvas = canvas
    this.canvas.style.display = 'block'
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    })

    if (!gl) {
      throw new Error('WebGL1 is not available.')
    }

    this.gl = gl
    this.quadBuffer = createQuad(gl)
    this.videoTexture = createTexture(gl, 1, 1, gl.UNSIGNED_BYTE, null, gl.LINEAR)
    this.simProgram = createProgramInfo(gl, VERTEX_SHADER, SIM_FRAGMENT_SHADER, [
      'uCurr',
      'uPrev',
      'uTexel',
      'uAspect',
      'uFingers',
      'uPrevFingers',
      'uRadius',
      'uDamping',
      'uTime',
    ])
    this.renderProgram = createProgramInfo(gl, VERTEX_SHADER, RENDER_FRAGMENT_SHADER, [
      'uVideo',
      'uWave',
      'uTexel',
      'uAspect',
      'uIntensity',
      'uMode',
      'uMirrored',
    ])
  }

  getError() {
    return this.error
  }

  render(options: RenderOptions): HTMLCanvasElement | null {
    if (!Number.isFinite(options.width) || !Number.isFinite(options.height)) {
      return null
    }

    const width = Math.max(2, Math.floor(options.width))
    const height = Math.max(2, Math.floor(options.height))

    try {
      this.ensureSize(width, height)
      this.uploadVideo(options.source)
      this.stepSimulation(options)
      this.renderFinal(options)
      this.prevFingers.set(options.fingers)
      this.error = null

      return this.canvas
    } catch (error) {
      this.error = toErrorMessage(error)
      return null
    }
  }

  dispose() {
    const gl = this.gl

    for (const target of this.targets) {
      gl.deleteTexture(target.texture)
      gl.deleteFramebuffer(target.framebuffer)
    }

    gl.deleteTexture(this.videoTexture)
    gl.deleteBuffer(this.quadBuffer)
    gl.deleteProgram(this.simProgram.program)
    gl.deleteProgram(this.renderProgram.program)
  }

  private ensureSize(width: number, height: number) {
    if (this.width === width && this.height === height && this.targets.length === 3) {
      return
    }

    const gl = this.gl

    this.width = width
    this.height = height
    this.simWidth = Math.max(2, Math.floor(width * 0.5))
    this.simHeight = Math.max(2, Math.floor(height * 0.5))
    this.canvas.width = width
    this.canvas.height = height

    for (const target of this.targets) {
      gl.deleteTexture(target.texture)
      gl.deleteFramebuffer(target.framebuffer)
    }

    this.targets = [
      createTarget(gl, this.simWidth, this.simHeight),
      createTarget(gl, this.simWidth, this.simHeight),
      createTarget(gl, this.simWidth, this.simHeight),
    ]
    this.targetIndex = 0

    for (const target of this.targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
      gl.viewport(0, 0, this.simWidth, this.simHeight)
      gl.clearColor(0.5, 0.5, 0.5, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private uploadVideo(source: HTMLVideoElement) {
    const gl = this.gl

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  private stepSimulation(options: RenderOptions) {
    const gl = this.gl
    const prevIndex = this.targetIndex
    const currIndex = (this.targetIndex + 1) % 3
    const nextIndex = (this.targetIndex + 2) % 3
    const prev = this.targets[prevIndex]
    const curr = this.targets[currIndex]
    const next = this.targets[nextIndex]

    gl.useProgram(this.simProgram.program)
    this.bindQuad(this.simProgram)
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer)
    gl.viewport(0, 0, this.simWidth, this.simHeight)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, curr.texture)
    gl.uniform1i(this.simProgram.uniforms.uCurr, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, prev.texture)
    gl.uniform1i(this.simProgram.uniforms.uPrev, 1)
    gl.uniform2f(this.simProgram.uniforms.uTexel, 1 / this.simWidth, 1 / this.simHeight)
    gl.uniform1f(this.simProgram.uniforms.uAspect, this.width / Math.max(1, this.height))
    gl.uniform3fv(this.simProgram.uniforms.uFingers, options.fingers)
    gl.uniform3fv(this.simProgram.uniforms.uPrevFingers, this.prevFingers)
    gl.uniform1f(this.simProgram.uniforms.uRadius, options.controls.radius)
    gl.uniform1f(this.simProgram.uniforms.uDamping, options.controls.decay)
    gl.uniform1f(this.simProgram.uniforms.uTime, options.now * 0.001)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this.targetIndex = currIndex
  }

  private renderFinal(options: RenderOptions) {
    const gl = this.gl
    const wave = this.targets[(this.targetIndex + 1) % 3]

    gl.useProgram(this.renderProgram.program)
    this.bindQuad(this.renderProgram)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.uniform1i(this.renderProgram.uniforms.uVideo, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, wave.texture)
    gl.uniform1i(this.renderProgram.uniforms.uWave, 1)
    gl.uniform2f(this.renderProgram.uniforms.uTexel, 1 / this.simWidth, 1 / this.simHeight)
    gl.uniform1f(this.renderProgram.uniforms.uAspect, this.width / Math.max(1, this.height))
    gl.uniform1f(this.renderProgram.uniforms.uIntensity, options.controls.intensity)
    gl.uniform1f(this.renderProgram.uniforms.uMode, options.mode === 'crystal' ? 1 : 0)
    gl.uniform1f(this.renderProgram.uniforms.uMirrored, options.mirrored ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private bindQuad(info: ProgramInfo) {
    const gl = this.gl

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.enableVertexAttribArray(info.attributes.position)
    gl.vertexAttribPointer(info.attributes.position, 2, gl.FLOAT, false, 0, 0)
  }
}

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const SIM_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uCurr;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uAspect;
uniform vec3 uFingers[10];
uniform vec3 uPrevFingers[10];
uniform float uRadius;
uniform float uDamping;
uniform float uTime;

float decodeHeight(vec4 color) {
  return color.r * 2.0 - 1.0;
}

float encodeHeight(float value) {
  return value * 0.5 + 0.5;
}

float random(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float capsuleSdf(vec2 p, vec2 a, vec2 b, float radius) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

void main() {
  float c = decodeHeight(texture2D(uCurr, vUv));
  float p = decodeHeight(texture2D(uPrev, vUv));
  float axis =
    decodeHeight(texture2D(uCurr, vUv + vec2(uTexel.x, 0.0))) * 0.2 +
    decodeHeight(texture2D(uCurr, vUv - vec2(uTexel.x, 0.0))) * 0.2 +
    decodeHeight(texture2D(uCurr, vUv + vec2(0.0, uTexel.y))) * 0.2 +
    decodeHeight(texture2D(uCurr, vUv - vec2(0.0, uTexel.y))) * 0.2;
  float diag =
    decodeHeight(texture2D(uCurr, vUv + vec2(uTexel.x, uTexel.y))) * 0.05 +
    decodeHeight(texture2D(uCurr, vUv + vec2(-uTexel.x, uTexel.y))) * 0.05 +
    decodeHeight(texture2D(uCurr, vUv + vec2(uTexel.x, -uTexel.y))) * 0.05 +
    decodeHeight(texture2D(uCurr, vUv - vec2(uTexel.x, uTexel.y))) * 0.05;
  float avg = axis + diag;
  float val = avg * 2.0 - p;
  float ampFactor = 1.0 - smoothstep(0.0, 0.08, abs(val)) * 0.006;
  val *= uDamping * ampFactor;
  val += (random(vUv * 173.31 + uTime * 0.07) - 0.5) * 0.00035;

  vec2 aspect = vec2(uAspect, 1.0);
  vec2 pos = (vUv - 0.5) * aspect;
  float baseRadius = 0.038 * uRadius;
  float impulse = 0.0;

  for (int i = 0; i < 10; i++) {
    vec3 f = uFingers[i];
    vec3 pf = uPrevFingers[i];

    if (f.z > 0.5) {
      vec2 a = ((pf.z > 0.5 ? pf.xy : f.xy) - 0.5) * aspect;
      vec2 b = (f.xy - 0.5) * aspect;
      float d = capsuleSdf(pos, a, b, baseRadius);
      float vel = length((b - a) / aspect) * 1000.0;
      float force = 0.6 + clamp(vel * 0.012, 0.0, 1.2);
      float stamp = smoothstep(baseRadius, -baseRadius * 0.55, d) * force;
      impulse += stamp;
    }
  }

  impulse = clamp(impulse, 0.0, 1.8);
  val += impulse * 0.055;
  val = clamp(val, -0.98, 0.98);
  gl_FragColor = vec4(encodeHeight(val), encodeHeight(c), 0.5, 1.0);
}
`

const RENDER_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uWave;
uniform vec2 uTexel;
uniform float uAspect;
uniform float uIntensity;
uniform float uMode;
uniform float uMirrored;

float decodeHeight(vec4 color) {
  return color.r * 2.0 - 1.0;
}

vec3 sampleVideo(vec2 uv) {
  vec2 nextUv = clamp(uv, 0.001, 0.999);
  nextUv.x = mix(nextUv.x, 1.0 - nextUv.x, step(0.5, uMirrored));
  return texture2D(uVideo, nextUv).rgb;
}

vec3 softSample(vec2 uv, vec2 offset) {
  return (
    sampleVideo(uv + offset) * 0.58 +
    sampleVideo(uv + offset * 0.55) * 0.28 +
    sampleVideo(uv + offset * 1.25) * 0.14
  );
}

float wave(vec2 uv) {
  return decodeHeight(texture2D(uWave, uv));
}

void main() {
  float tl = wave(vUv + vec2(-uTexel.x, uTexel.y));
  float tc = wave(vUv + vec2(0.0, uTexel.y));
  float tr = wave(vUv + vec2(uTexel.x, uTexel.y));
  float ml = wave(vUv - vec2(uTexel.x, 0.0));
  float mc = wave(vUv);
  float mr = wave(vUv + vec2(uTexel.x, 0.0));
  float bl = wave(vUv - vec2(uTexel.x, uTexel.y));
  float bc = wave(vUv - vec2(0.0, uTexel.y));
  float br = wave(vUv + vec2(uTexel.x, -uTexel.y));
  vec2 grad = vec2(
    (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl),
    (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)
  );
  float lap = ((ml + mr + tc + bc) * 0.25) - mc;
  float gradLen = length(grad);
  vec2 aspect = vec2(1.0 / max(uAspect, 0.001), 1.0);
  vec2 safeGrad = gradLen > 0.0001 ? grad / gradLen : vec2(0.0);

  vec2 refractOffset = grad * 0.55 * uIntensity * aspect;
  vec2 lensOffset = safeGrad * lap * 0.18 * uIntensity * aspect;
  vec2 totalOffset = refractOffset + lensOffset;
  float dispersion = 0.015 + clamp(gradLen * 0.20, 0.0, 0.14);
  vec3 liquid;
  liquid.r = softSample(vUv, totalOffset * (1.0 + dispersion)).r;
  liquid.g = softSample(vUv, totalOffset).g;
  liquid.b = softSample(vUv, totalOffset * (1.0 - dispersion)).b;
  float brightness = 1.0 + clamp(mc * 2.2, -0.38, 0.45);
  liquid *= brightness;
  liquid = mix(liquid, liquid * vec3(1.06, 1.02, 0.94), smoothstep(0.02, 0.12, mc));
  liquid = mix(liquid, liquid * vec3(0.78, 0.90, 1.08), smoothstep(0.02, 0.12, -mc));

  vec3 normal = normalize(vec3(-grad.x, -grad.y, 0.8 / (uIntensity + 0.01)));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float cosTheta = clamp(dot(normal, viewDir), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
  vec3 reflection = sampleVideo(vUv - totalOffset * 1.6) * vec3(0.68, 0.84, 1.08);
  liquid = mix(liquid, reflection, fresnel * 0.32);

  vec3 lightDir = normalize(vec3(0.4, 0.7, 1.0));
  vec3 halfDir = normalize(lightDir + viewDir);
  float ndoth = max(dot(normal, halfDir), 0.0);
  float sharpSpec = pow(ndoth, 180.0) * 2.2;
  float broadSheen = pow(ndoth, 28.0) * 0.35;
  float causticMask = smoothstep(0.04, 0.10, mc) * smoothstep(0.01, 0.06, lap);
  liquid += vec3(1.0, 0.94, 0.78) * (sharpSpec + broadSheen + causticMask * 0.55);
  liquid = mix(liquid * vec3(0.88, 0.94, 1.04), liquid, smoothstep(0.006, 0.05, gradLen));

  vec2 facetGrad = floor(grad * 18.0) / 18.0;
  vec2 facetOffset = facetGrad * 0.7 * uIntensity * aspect;
  vec3 crystal = sampleVideo(vUv + facetOffset);
  vec2 facetR = floor(vec2(mr - mc, wave(vUv + vec2(uTexel.x, uTexel.y)) - mc) * 18.0) / 18.0;
  vec2 facetU = floor(vec2(tc - mc, wave(vUv + vec2(uTexel.x, uTexel.y)) - mc) * 18.0) / 18.0;
  float edge = step(0.018, length(facetR - facetGrad) + length(facetU - facetGrad));
  float facetLight = 0.86 + dot(normalize(vec3(facetGrad, 0.38)), lightDir) * 0.34;
  crystal *= facetLight;
  crystal += vec3(0.75, 0.90, 1.0) * edge * (0.22 + gradLen * 1.4);

  float crystalMask = step(0.5, uMode);
  vec3 color = mix(liquid, crystal, crystalMask);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

function createQuad(gl: WebGLRenderingContext) {
  const buffer = gl.createBuffer()

  if (!buffer) {
    throw new Error('Unable to create WebGL quad buffer.')
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  )

  return buffer
}

function createProgramInfo(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: string[],
): ProgramInfo {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()

  if (!program) {
    throw new Error('Unable to create WebGL program.')
  }

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'unknown link error'
    throw new Error(`WebGL program link failed: ${log}`)
  }

  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  const uniforms: Record<string, WebGLUniformLocation | null> = {}

  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name)
  }

  return {
    program,
    attributes: {
      position: 0,
    },
    uniforms,
  }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)

  if (!shader) {
    throw new Error('Unable to create WebGL shader.')
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'unknown compile error'
    gl.deleteShader(shader)
    throw new Error(`WebGL shader compile failed: ${log}`)
  }

  return shader
}

function createTexture(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  type: number,
  data: ArrayBufferView | null,
  filter: number,
) {
  const texture = gl.createTexture()

  if (!texture) {
    throw new Error('Unable to create WebGL texture.')
  }

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, data)

  return texture
}

function createTarget(gl: WebGLRenderingContext, width: number, height: number): Target {
  const texture = createTexture(gl, width, height, gl.UNSIGNED_BYTE, null, gl.LINEAR)
  const framebuffer = gl.createFramebuffer()

  if (!framebuffer) {
    throw new Error('Unable to create WebGL framebuffer.')
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`WebGL framebuffer incomplete: 0x${status.toString(16)}`)
  }

  return {
    texture,
    framebuffer,
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
