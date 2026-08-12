import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apply = process.argv.includes('--apply');
const apiKey = process.env.MISTRAL_API_KEY ?? '';
const agentId = process.env.MISTRAL_AGENT_ID ?? '';
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'config/mistral-agent.json'), 'utf8'));
const edgeSource = readFileSync(resolve(process.cwd(), 'supabase/functions/travel-assistant/index.ts'), 'utf8');
const toolSchemaBlock = edgeSource.match(/const toolSchemas = \{([\s\S]*?)\n\} satisfies/)?.[1] ?? '';
const runtimeTools = [...toolSchemaBlock.matchAll(/^  ([a-z][a-z0-9_]+): (?:z\.|proposalSchema)/gm)].map((match) => match[1]);
const missingRuntimeTools = config.tools.filter((tool) => !runtimeTools.includes(tool));
const undocumentedRuntimeTools = runtimeTools.filter((tool) => !config.tools.includes(tool));

if (missingRuntimeTools.length || undocumentedRuntimeTools.length) {
  throw new Error([
    ...missingRuntimeTools.map((tool) => `Configured tool missing from Edge runtime: ${tool}`),
    ...undocumentedRuntimeTools.map((tool) => `Edge runtime tool missing from agent config: ${tool}`),
  ].join('\n'));
}

if (!apiKey || !agentId) throw new Error('MISTRAL_API_KEY and MISTRAL_AGENT_ID are required');

const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
const getResponse = await fetch(`https://api.mistral.ai/v1/agents/${encodeURIComponent(agentId)}`, { headers });
if (!getResponse.ok) throw new Error(`Could not read Mistral agent (${getResponse.status}): ${(await getResponse.text()).slice(0, 300)}`);
const current = await getResponse.json();

const expectedBuiltIns = new Set(config.builtInTools);
const currentBuiltIns = new Set((current.tools ?? []).map((tool) => tool.type).filter((type) => type !== 'function'));
const differences = [
  ...(current.model !== config.model ? [`model: ${current.model} -> ${config.model}`] : []),
  ...(current.instructions !== config.instructions ? ['instructions differ from config/mistral-agent.json'] : []),
  ...([...expectedBuiltIns].filter((tool) => !currentBuiltIns.has(tool)).map((tool) => `missing built-in tool: ${tool}`)),
];

if (!differences.length) {
  console.log(`Mistral agent ${agentId} matches ${config.version}. Runtime Outing functions are supplied by the Edge Function.`);
  process.exit(0);
}
if (!apply) {
  console.error(`Mistral agent drift detected:\n- ${differences.join('\n- ')}\nRun pnpm agent:sync to apply the repository configuration.`);
  process.exitCode = 1;
} else {
  const update = await fetch(`https://api.mistral.ai/v1/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      model: config.model,
      name: config.name,
      description: config.description,
      instructions: config.instructions,
      tools: config.builtInTools.map((type) => ({ type })),
      completion_args: { temperature: 0.2, max_tokens: 1200 },
    }),
  });
  if (!update.ok) throw new Error(`Could not update Mistral agent (${update.status}): ${(await update.text()).slice(0, 300)}`);
  console.log(`Updated Mistral agent ${agentId} to ${config.version}.`);
}
