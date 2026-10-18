// ElevenLabs — text to speech / sound effects.
async function generate({ model, prompt, params, key }) {
  if (model.endpoint === 'sound-generation') { // sound effects from a description
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, ...(params.seconds ? { duration_seconds: Math.max(0.5, Math.min(22, +params.seconds)) } : {}) }),
    });
    if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 400)}`);
    return { dataUrl: `data:audio/mpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`, mime: 'audio/mpeg' };
  }
  const voice = params.voiceId || model.defaults?.voiceId || '21m00Tcm4TlvDq8ikWAM';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, model_id: model.endpoint })
  });
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { dataUrl: `data:audio/mpeg;base64,${buf.toString('base64')}`, mime: 'audio/mpeg' };
}
module.exports = { generate };
