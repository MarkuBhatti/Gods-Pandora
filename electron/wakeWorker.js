// "Hey Pandora" keyword spotter — runs in its own thread so the app never stutters.
// Engine: sherpa-onnx streaming keyword spotting (k2-fsa, Apache-2.0), pure WebAssembly — no Python, no GPU, no cloud.
// It listens continuously to 16 kHz audio and fires only when the exact phrase is spoken.
const { parentPort, workerData } = require('worker_threads');

let kws = null; let stream = null;
try {
  let sherpa; try { sherpa = require(workerData.sherpa); } catch (_) { sherpa = require('sherpa-onnx'); }
  const m = workerData.model;
  kws = sherpa.createKws({
    featConfig: { samplingRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: m.encoder, decoder: m.decoder, joiner: m.joiner },
      tokens: m.tokens, provider: 'cpu', modelType: '', numThreads: 1, debug: 0, modelingUnit: 'bpe', bpeVocab: '',
    },
    maxActivePaths: 4,
    numTrailingBlanks: 1,
    keywordsScore: workerData.score || 1.5,
    keywordsThreshold: workerData.threshold || 0.2,
    keywords: workerData.keywordsText,
  });
  stream = kws.createStream();
  parentPort.postMessage({ type: 'ready' });
} catch (e) {
  parentPort.postMessage({ type: 'error', error: String((e && e.message) || e) });
}

parentPort.on('message', (msg) => {
  if (!kws || !stream) return;
  if (msg.type === 'audio') {
    try {
      stream.acceptWaveform(16000, new Float32Array(msg.data));
      while (kws.isReady(stream)) {
        kws.decode(stream);
        const r = kws.getResult(stream);
        if (r && r.keyword) { kws.reset(stream); parentPort.postMessage({ type: 'hit', keyword: r.keyword }); }
      }
    } catch (e) { parentPort.postMessage({ type: 'error', error: String((e && e.message) || e) }); }
  } else if (msg.type === 'stop') {
    try { stream.free(); kws.free(); } catch (_) { /* ignore */ }
    kws = null; stream = null;
  }
});
