const providers = {
  fal:        require('./providers/fal'),
  replicate:  require('./providers/replicate'),
  openai:     require('./providers/openai'),
  google:     require('./providers/google'),
  elevenlabs: require('./providers/elevenlabs'),
  stability:  require('./providers/stability'),
  local:      require('./providers/local'),
  higgsfield: require('./providers/higgsfield'),
  huggingface:require('./providers/huggingface'),
  system:     require('./providers/system'),      // free OS voice
  localaudio: require('./providers/localaudio'),  // free MusicGen / Bark on your GPU
};

const PROVIDER_LABEL = { fal: 'FAL.ai', replicate: 'Replicate', openai: 'OpenAI', google: 'Google AI Studio',
  elevenlabs: 'ElevenLabs', stability: 'Stability AI', higgsfield: 'Higgsfield', huggingface: 'Hugging Face' };

async function generate(payload, keys, helpers) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid generation payload.');
  const { provider, model } = payload;
  if (!provider) throw new Error('No provider specified.');
  if (!model)    throw new Error('No model specified.');

  const impl = providers[provider];
  if (!impl) throw new Error('Unknown provider: ' + provider + '. Check your model catalog.');

  const key = keys[provider];
  if (!key && !['local', 'system', 'localaudio'].includes(provider)) {
    throw new Error('No API key saved for ' + (PROVIDER_LABEL[provider] || provider) + '. Add it in Settings → API Keys.');
  }

  // audio: the text is spoken / described as-is — never append visual style, camera or character notes
  const prompt = payload.kind === 'audio' ? String(payload.prompt || '') : composePrompt(payload);
  if (!prompt || !prompt.trim()) throw new Error('Prompt is empty.');

  let refs = [];
  if (payload.kind !== 'audio') try { refs = collectRefs(payload, model, helpers); }
  catch (err) { console.warn('[generate] collectRefs error (continuing without refs):', err.message); }

  // Identity Lock: a trained identity on the selected character (or the first @mentioned character)
  const soulOwner = [payload.character, ...(Array.isArray(payload.mentions) ? payload.mentions : [])]
    .find((c) => c && c.soulId && (c.soulId.provider === provider));
  const params = { ...(payload.params || {}) };
  let finalPrompt = prompt;
  if (soulOwner && soulOwner.soulId.provider === 'local' && model.endpoint !== soulOwner.soulId.base) {
    // a local LoRA only fits the base it was trained on
  } else if (soulOwner && (model.soul || provider === 'local')) {
    params.soul = soulOwner.soulId;
    if (soulOwner.soulId.trigger) finalPrompt = soulOwner.soulId.trigger + ' ' + soulOwner.name + ', ' + prompt;
  }

  return impl.generate({ model, prompt: finalPrompt, refs, params, key });
}

function composePrompt(p) {
  const parts = [p.prompt].filter(Boolean);
  if (p.style && p.style.promptText)       parts.push('Visual style: ' + p.style.promptText);
  if (p.colorScheme && p.colorScheme.prompt) parts.push('Color design: ' + p.colorScheme.prompt);
  if (p.moodColor && p.moodColor.prompt)   parts.push('Color psychology: ' + p.moodColor.prompt);
  if (p.cameraPreset && p.cameraPreset.promptText) parts.push('Camera: ' + p.cameraPreset.promptText);
  if (p.character && p.character.name) {
    parts.push('Character (consistent identity "' + p.character.name + '"): ' + (p.character.description || '') + '. Keep this exact person identical to the reference images.');
    if (p.character.signatureColor) {
      parts.push('Signature color: ' + p.character.signatureColor + ' consistently follows this character (wardrobe/lighting accents), Kill-Bill-yellow style.');
    }
  }
  // @mentions: saved characters / locations / products referenced inside the prompt
  for (const m of Array.isArray(p.mentions) ? p.mentions : []) {
    if (!m || !m.name) continue;
    if (m.type === 'location') parts.push('@' + m.name + ' is a saved LOCATION: ' + (m.description || '') + '. Reproduce this environment faithfully from its reference images.');
    else if (m.type === 'product') parts.push('@' + m.name + ' is a saved PRODUCT: ' + (m.description || '') + '. Keep its exact shape, colors, materials, logo and label from the reference images.');
    else parts.push('@' + m.name + ' is a saved CHARACTER: ' + (m.description || '') + '. Keep this exact identity (face, hair, build) from the reference images.' + (m.signatureColor ? ' Signature color: ' + m.signatureColor + '.' : ''));
  }
  if (p.location && p.location.name) {
    parts.push(
      'LOCATION LOCK - scene takes place in the saved location "' + p.location.name + '": ' + (p.location.description || '') + '. ' +
      'Reproduce this exact environment faithfully: identical architecture, layout, furniture/props, materials, colors and spatial arrangement as in the location reference images. ' +
      'Only lighting, weather and camera angle may vary if requested.'
    );
  }
  return parts.join('\n');
}

function collectRefs(p, model, helpers) {
  if (!model || !model.refInput) return [];
  const files = [
    ...(Array.isArray(p.toolRefs)        ? p.toolRefs        : []),
    ...(Array.isArray(p.character && p.character.refs) ? p.character.refs : []),
    ...(Array.isArray(p.location  && p.location.refs)  ? p.location.refs  : []),
    ...(Array.isArray(p.mentions) ? p.mentions.flatMap((m) => (m && Array.isArray(m.refs) ? m.refs.slice(0, 2) : [])) : []),
  ];
  const unique = [...new Set(files.filter(Boolean))];
  return unique.slice(0, model.maxRefs || 6).map((f) => {
    try { return helpers.fileToDataUrl(f); }
    catch (err) { console.warn('[collectRefs] skipping unreadable ref:', f, err.message); return null; }
  }).filter(Boolean);
}

module.exports = { generate };
