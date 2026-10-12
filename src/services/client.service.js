const { normalizePhone, formatPhone, normalizeSearch } = require('../lib/validation');

function optionalPhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { raw: null, normalized: null };
  const normalized = normalizePhone(raw);
  return { raw: formatPhone(normalized), normalized };
}

async function upsertClient(tx, input) {
  const parsed = optionalPhone(input.phone);

  let existing = parsed.normalized
    ? await tx.client.findUnique({ where: { phoneNormalized: parsed.normalized } })
    : null;

  if (!existing && input.clientId) {
    existing = await tx.client.findUnique({ where: { id: Number(input.clientId) } });
  }

  const name = input.name || existing?.name || null;
  const defaultVehicle = input.vehicle || existing?.defaultVehicle || null;
  const phone = parsed.raw ?? existing?.phone ?? null;
  const phoneNormalized = parsed.normalized ?? existing?.phoneNormalized ?? null;
  const notes = existing?.notes || null;
  const searchText = normalizeSearch(name, phone, phoneNormalized, defaultVehicle, notes);

  if (existing) {
    return tx.client.update({
      where: { id: existing.id },
      data: { phone, phoneNormalized, name, defaultVehicle, searchText, deletedAt: null },
    });
  }

  return tx.client.create({
    data: { phone, phoneNormalized, name, defaultVehicle, searchText },
  });
}

function clientSearchText(client) {
  return normalizeSearch(client.name, client.phone, client.phoneNormalized, client.defaultVehicle, client.notes);
}

module.exports = { upsertClient, clientSearchText, optionalPhone };
