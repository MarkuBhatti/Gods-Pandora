// "Hey Pandora" listener — runs in its own thread so the app never stutters.
// Engine: sherpa-onnx streaming speech recognition (k2-fsa zipformer, English, Apache-2.0), pure WebAssembly —
// no Python, no GPU, no cloud. It turns speech into text continuously; the app looks for "Hey Pandora" in the text
// (fuzzy, so "hey bandora" / "pan dora" also count). A keyword spotter can't do this reliably for a rare name.
const { parentPort, workerData } = require('worker_threads');

let rec = null; let stream = null; let lastPartial = '';
try {
  let sherpa; try { sherpa = require(workerData.sherpa); } catch (_) { sherpa = require('sherpa-onnx'); }
  const m = workerData.model;
  rec = sherpa.createOnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: m.encoder, decoder: m.decoder, joiner: m.joiner },
      paraformer: { encoder: '', decoder: '' }, zipformer2Ctc: { model: '' }, nemoCtc: { model: '' }, toneCtc: { model: '' },
      tokens: m.tokens, numThreads: 1, provider: 'cpu', debug: 0, modelType: '', modelingUnit: '', bpeVocab: '',
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.0,  // silence with nothing said
    rule2MinTrailingSilence: 0.7,  // pause after speech → end of utterance (fast response)
    rule3MinUtteranceLength: 15,
    hotwordsFile: '', hotwordsScore: 1.5,
    ctcFstDecoderConfig: { graph: '', maxActive: 3000 },
    ruleFsts: '', ruleFars: '',
  });
  stream = rec.createStream();
  parentPort.postMessage({ type: 'ready' });
} catch (e) {
  parentPort.postMessage({ type: 'error', error: String((e && e.message) || e) });
}

parentPort.on('message', (msg) => {
  if (!rec || !stream) return;
  if (msg.type === 'audio') {
    try {
      stream.acceptWaveform(16000, new Float32Array(msg.data));
      while (rec.isReady(stream)) rec.decode(stream);
      const text = String((rec.getResult(stream) || {}).text || '').trim();
      if (text && text !== lastPartial) { lastPartial = text; parentPort.postMessage({ type: 'partial', text }); }
      if (rec.isEndpoint(stream)) {
        if (text) parentPort.postMessage({ type: 'text', text });
        rec.reset(stream); lastPartial = '';
      }
    } catch (e) { parentPort.postMessage({ type: 'error', error: String((e && e.message) || e) }); }
  } else if (msg.type === 'reset') {
    try { rec.reset(stream); lastPartial = ''; } catch (_) { /* ignore */ }
  } else if (msg.type === 'stop') {
    try { stream.free(); rec.free(); } catch (_) { /* ignore */ }
    rec = null; stream = null;
  }
});
