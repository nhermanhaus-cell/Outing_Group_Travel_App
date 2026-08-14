const projectUrl = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const [command = 'list', candidateId, destinationId] = process.argv.slice(2);

if (!projectUrl || !serviceKey) {
  throw new Error('SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required');
}

async function rest(path, init = {}) {
  const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 500));
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

if (command === 'list') {
  const rows = await rest('destination_candidates?select=id,name,country,status,demand_count,confidence,updated_at&order=demand_count.desc,updated_at.desc');
  console.table(rows);
  process.exit(0);
}

if (!candidateId) throw new Error('A candidate id is required');

if (command === 'review') {
  await rest(`destination_candidates?id=eq.${encodeURIComponent(candidateId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'in_review', updated_at: new Date().toISOString() }),
  });
  console.log(`Candidate ${candidateId} moved to editorial review.`);
} else if (command === 'reject') {
  await rest(`destination_candidates?id=eq.${encodeURIComponent(candidateId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'rejected', updated_at: new Date().toISOString() }),
  });
  console.log(`Candidate ${candidateId} rejected.`);
} else if (command === 'publish') {
  if (!destinationId) throw new Error('publish requires the reviewed destination id from the destinations table');
  const destination = await rest(`destinations?id=eq.${encodeURIComponent(destinationId)}&published=eq.true&select=id,slug,country,country_code,payload`);
  if (!destination?.length) throw new Error('A published, editorially reviewed destination row is required');
  const catalog = destination[0].payload ?? {};
  if (!destination[0].country || !destination[0].country_code) throw new Error('Destination identity must include a validated country and country code');
  if (!Array.isArray(catalog.bestMonths) || !catalog.bestMonths.length || !Array.isArray(catalog.sources) || !catalog.sources.length) {
    throw new Error('Publishing requires cited seasonality in the reviewed destination payload');
  }
  if (!Array.isArray(catalog.places) || catalog.places.length < 3) throw new Error('Publishing requires at least three reviewed place or activity candidates');
  if (!catalog.lgbtqContext || typeof catalog.lgbtqContext !== 'object') {
    throw new Error('Publishing requires reviewed LGBTQ+/legal context or an explicit not-verified context object');
  }
  await rest('rpc/publish_destination_candidate', {
    method: 'POST',
    body: JSON.stringify({ p_candidate_id: candidateId, p_destination_id: destinationId }),
  });
  console.log(`Candidate ${candidateId} linked to published destination ${destination[0].slug}.`);
} else {
  throw new Error('Use list, review <id>, reject <id>, or publish <id> <destination-id>');
}
