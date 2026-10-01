// Tap and confirm feedback — the same sounds and haptics as the Classic display.

export function playTap() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(900, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.06)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
    osc.start(); osc.stop(ctx.currentTime + 0.09)
    osc.onended = () => ctx.close()
  } catch {}
}

export function playConfirm() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    ;[[523.25, 0], [659.25, 0.1], [783.99, 0.2]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      const t = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.001, t)
      gain.gain.linearRampToValueAtTime(0.13, t + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
      osc.start(t); osc.stop(t + 0.6)
    })
    setTimeout(() => ctx.close(), 1400)
  } catch {}
}

export function hapticTap() { try { navigator.vibrate?.(8) } catch {} }
export function hapticConfirm() { try { navigator.vibrate?.([60, 40, 100]) } catch {} }
