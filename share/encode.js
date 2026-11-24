// Video and GIF encoding for the share builder. Everything runs in the browser.
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.esm.js';
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';

const H264 = ['avc1.640033', 'avc1.4d0033', 'avc1.42003e']; // High, Main, Baseline
const VP9 = ['vp09.00.10.08'];                              // only used when ?codec=vp9 is in the URL (testing)

export function videoSupported() {
  return typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
}

async function pickCodec(w, h, fps, bitrate) {
  const forceVp9 = /[?&]codec=vp9\b/.test(location.search);
  const list = forceVp9 ? VP9 : H264;
  for (const codec of list) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps });
      if (r && r.supported) return { codec, muxer: forceVp9 ? 'vp9' : 'avc' };
    } catch (e) { /* try the next one */ }
  }
  return null;
}

// draw(ctx, t) paints the frame at time t (seconds) on a w x h canvas.
export async function encodeMp4({ w, h, seconds, fps = 30, draw, onProgress }) {
  if (!videoSupported()) throw new Error('This browser cannot make MP4 video. Try Chrome or Safari, or download the GIF.');
  const bitrate = Math.round(w * h * fps * 0.09); // roughly 5.5 Mbps at 1080p, 30 fps
  const pick = await pickCodec(w, h, fps, bitrate);
  if (!pick) throw new Error('This browser cannot make MP4 video. Try Chrome or Safari, or download the GIF.');

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pick.muxer, width: w, height: h }, fastStart: 'in-memory' });
  let failure = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  enc.configure({ codec: pick.codec, width: w, height: h, bitrate, framerate: fps });

  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    draw(ctx, i / fps);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    if (onProgress && i % 6 === 0) { onProgress(i / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  await enc.flush();
  if (failure) throw failure;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// steps: [{ t, delay }] where t is the time to draw and delay is how long the frame shows (ms).
export async function encodeGif({ w, h, steps, draw, onProgress }) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const gif = GIFEncoder();
  for (let i = 0; i < steps.length; i++) {
    draw(ctx, steps[i].t);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256, { format: 'rgb565' });
    const index = applyPalette(data, palette, 'rgb565');
    gif.writeFrame(index, w, h, { palette, delay: steps[i].delay, repeat: 0 });
    if (onProgress) { onProgress((i + 1) / steps.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
