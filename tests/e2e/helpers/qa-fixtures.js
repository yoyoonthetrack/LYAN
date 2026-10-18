'use strict';

// Browser-only rows. They are injected into PostgREST responses for one test
// and are never inserted into Supabase. These tests therefore check the UI
// and the client's own filters, not Row Level Security or persisted data.

const OPEN_REQUEST_ID = '11111111-1111-4111-a111-111111111111';
const CLOSED_REQUEST_ID = '22222222-2222-4222-a222-222222222222';
const SERVICE_ID = '33333333-3333-4333-a333-333333333333';

function requestRow(id, ownerId, status) {
  return {
    id,
    requester_id: ownerId,
    title: status === 'OPEN' ? 'Annonce QA isolée' : 'Annonce QA clôturée',
    description: 'Fixture locale, jamais enregistrée.',
    category: 'Ménage',
    location: 'Le Gosier (971 - Guadeloupe)',
    status,
    visibility: 'PUBLIC',
    safety_status: 'SAFE',
    target_user_id: null,
    classification_status: 'CLASSIFIED',
    budget: 40,
    created_at: status === 'OPEN' ? '2026-10-01T10:00:00.000Z' : '2026-08-01T10:00:00.000Z'
  };
}

function serviceRow(ownerId) {
  return {
    id: SERVICE_ID,
    owner_id: ownerId,
    title: 'Aide QA isolée',
    category: 'Ménage',
    description: 'Fixture locale, jamais enregistrée.',
    is_active: true,
    active: true,
    created_at: '2026-10-01T10:00:00.000Z'
  };
}

async function fulfill(route, body) {
  const count = Array.isArray(body) ? body.length : 1;
  const single = !Array.isArray(body);
  await route.fulfill({
    status: 200,
    headers: {
      'content-type': single ? 'application/vnd.pgrst.object+json' : 'application/json',
      'content-range': count ? `0-${count - 1}/${count}` : '*/0'
    },
    body: JSON.stringify(body)
  });
}

function blockWrite(route) {
  const method = route.request().method();
  if (method === 'OPTIONS' || method === 'HEAD') return route.continue();
  if (method === 'GET') return null;
  return route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Fixture route blocked a write.' })
  });
}

async function installPublishedServiceFixture(page, ownerId) {
  await page.route('**/rest/v1/services*', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return blockWrite(route);
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const rows = await response.json();
    const list = Array.isArray(rows) ? rows : [];
    if (list.length >= 500 || list.some((row) => row.id === SERVICE_ID)) return route.fulfill({ response });
    list.push(serviceRow(ownerId));
    return fulfill(route, list);
  });
}

async function installRequestFixtures(page, ownerId) {
  const openRow = requestRow(OPEN_REQUEST_ID, ownerId, 'OPEN');
  const closedRow = requestRow(CLOSED_REQUEST_ID, ownerId, 'CLOSED');
  await page.route('**/rest/v1/requests*', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return blockWrite(route);
    const url = new URL(request.url());
    const idFilter = url.searchParams.get('id');
    if (idFilter === `eq.${OPEN_REQUEST_ID}` || idFilter === `eq.${CLOSED_REQUEST_ID}`) {
      const row = idFilter.endsWith(OPEN_REQUEST_ID) ? openRow : closedRow;
      const single = (request.headers().accept || '').includes('vnd.pgrst.object');
      return fulfill(route, single ? row : [row]);
    }
    const requester = url.searchParams.get('requester_id');
    if (requester === `eq.${ownerId}` && !url.searchParams.has('status')) {
      return fulfill(route, [openRow, closedRow]);
    }
    if (url.searchParams.get('status') === 'eq.OPEN') {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const rows = await response.json();
      const list = Array.isArray(rows) ? rows : [];
      if (list.length >= 500 || list.some((row) => row.id === OPEN_REQUEST_ID)) return route.fulfill({ response });
      list.push(openRow);
      return fulfill(route, list);
    }
    return route.continue();
  });
}

module.exports = {
  OPEN_REQUEST_ID,
  CLOSED_REQUEST_ID,
  installPublishedServiceFixture,
  installRequestFixtures
};
