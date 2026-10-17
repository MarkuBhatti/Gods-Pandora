// Anthropic Claude — powers App Forge (app/game generation), prompt enhancement and the AI Director.
async function complete({ key, system, prompt, model = 'claude-sonnet-5-5', maxTokens = 16000 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json.content.map((c) => c.text || '').join('');
}
module.exports = { complete };
