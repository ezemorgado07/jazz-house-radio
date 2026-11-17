// Generadores de ruido para el mezclador de ambiente. Devuelven AudioBuffers
// mono listos para loopear sin costuras perceptibles (10s es suficiente).

// Pink noise — algoritmo de Paul Kellet (6 coeficientes de IIR en cascada).
// Suena a "lluvia" después de un highpass.
export function generatePinkNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const buffer = ctx.createBuffer(
    1,
    Math.floor(sampleRate * durationSec),
    sampleRate,
  )
  const data = buffer.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
  return buffer
}

// Brown noise — integración de ruido blanco con damping. Más oscuro que pink,
// con energía concentrada en bajas frecuencias. Suena a "murmullo de fondo".
export function generateBrownNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const buffer = ctx.createBuffer(
    1,
    Math.floor(sampleRate * durationSec),
    sampleRate,
  )
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

// Fireplace — pink noise suave como "glow" del fuego + crackles densos con
// decay largo. Suena más cálido y lleno que un crackle de vinilo.
export function generateFireplaceBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
  density = 0.003,
): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.floor(sampleRate * durationSec)
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  // Capa base: pink noise atenuado — el "hiss" caliente del fuego.
  const pinkBuf = generatePinkNoiseBuffer(ctx, durationSec)
  const pinkData = pinkBuf.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = pinkData[i] * 0.3
  }

  // Capa de crackles densos con decay exponencial largo (40 samples ~1ms a 44kHz).
  for (let i = 0; i < length; i++) {
    if (Math.random() < density) {
      const amp = (Math.random() * 0.7 + 0.3) * (Math.random() < 0.5 ? -1 : 1)
      for (let j = 0; j < 40 && i + j < length; j++) {
        data[i + j] += amp * Math.exp(-j * 0.15)
      }
      // Saltar unos samples para no pisar el click actual.
      i += 15
    }
  }

  return buffer
}
