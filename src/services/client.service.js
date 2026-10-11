const { normalizePhone, normalizeSearch } = require("../lib/validation");

function optionalPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { raw: null, normalized: null };
  const parsed = normalizePhone(raw);
  return { raw: parsed.raw, normalized: parsed.normalized };
}

async function upsertClient(tx, { phone, name = null, vehicle = null, clientId = null }) {
  const parsedPhone = optionalPhone(phone);

  let existing = clientId
    ? await tx.client.findUnique({ where: { id: Number(clientId) } })
    : null;

  if (!existing && parsedPhone.normalized) {
    existing = await tx.client.findUnique({ where: { phoneNormalized: parsedPhone.normalized } });
  }

  const nextName = name || existing?.name || null;
  const nextVehicle = vehicle || existing?.defaultVehicle || null;
  const nextPhone = parsedPhone.raw ?? existing?.phone ?? null;
  const nextPhoneNormalized = parsedPhone.normalized ?? existing?.phoneNormalized ?? null;
  const nextNotes = existing?.notes || null;

  const data = {
    name: nextName,
    phone: nextPhone,
    phoneNormalized: nextPhoneNormalized,
    defaultVehicle: nextVehicle,
    deletedAt: null,
    searchText: normalizeSearch(nextName, nextPhone, nextPhoneNormalized, nextVehicle, nextNotes)
  };

  if (existing) {
    return tx.client.update({ where: { id: existing.id }, data });
  }

  return tx.client.create({ data });
}

function clientSearchText(client) {
  return normalizeSearch(
    client.name,
    client.phone,
    client.phoneNormalized,
    client.defaultVehicle,
    client.notes
  );
}

module.exports = { upsertClient, clientSearchText, optionalPhone };
