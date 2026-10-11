const { HttpError } = require("./http-error");

function text(value, label, max = 255, optional = true) {
  const result = String(value ?? "").trim();
  if (!result) {
    if (optional) return null;
    throw new HttpError(400, `${label}: заполните поле`, "VALIDATION_ERROR");
  }
  if (result.length > max) {
    throw new HttpError(400, `${label}: максимум ${max} символов`, "VALIDATION_ERROR");
  }
  if (/\u0000/.test(result)) {
    throw new HttpError(400, `${label}: некорректное значение`, "VALIDATION_ERROR");
  }
  return result;
}

function singleLineText(value, label, max = 255, optional = true) {
  const result = text(value, label, max, optional);
  if (result == null) return null;
  if (/[\r\n\u2028\u2029]/.test(result)) {
    throw new HttpError(400, `${label}: используйте одну строку`, "VALIDATION_ERROR");
  }
  if (/[<>]/.test(result)) {
    throw new HttpError(400, `${label}: недопустимые символы`, "VALIDATION_ERROR");
  }
  return result;
}

function personName(value, label = "Имя") {
  const result = singleLineText(value, label, 80, false);
  if (result.length < 2) {
    throw new HttpError(400, `${label}: минимум 2 символа`, "VALIDATION_ERROR");
  }
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .\-'’]{1,79}$/u.test(result)) {
    throw new HttpError(400, `${label}: проверьте написание`, "VALIDATION_ERROR");
  }
  return result;
}

function positiveId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "Некорректный идентификатор", "VALIDATION_ERROR");
  }
  return id;
}

function optionalDate(value, label = "Дата") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${label}: некорректная дата`, "VALIDATION_ERROR");
  }
  return date;
}

function publicServiceDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpError(400, "Дата: некорректное значение", "VALIDATION_ERROR");
  }

  const [year, month, day] = raw.split("-").map(Number);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  if (year < 2020 || month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new HttpError(400, "Дата: некорректное значение", "VALIDATION_ERROR");
  }
  const date = new Date(`${raw}T12:00:00+07:00`);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Krasnoyarsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (raw < today) {
    throw new HttpError(400, "Дата перевозки не может быть в прошлом", "VALIDATION_ERROR");
  }

  return date;
}

function enumValue(value, allowed, label, fallback = undefined) {
  if (value == null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, `${label}: выберите значение`, "VALIDATION_ERROR");
  }
  if (!allowed.has(value)) {
    throw new HttpError(400, `${label}: некорректное значение`, "VALIDATION_ERROR");
  }
  return value;
}

function moneyToCents(value, label = "Сумма", optional = false) {
  if (value == null || value === "") return optional ? null : 0;
  const raw = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new HttpError(400, `${label}: некорректная сумма`, "VALIDATION_ERROR");
  }
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 100000000) {
    throw new HttpError(400, `${label}: некорректная сумма`, "VALIDATION_ERROR");
  }
  return Math.round(number * 100);
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!/^[+()\-\s\d]+$/.test(raw)) {
    throw new HttpError(400, "Укажите корректный номер телефона", "VALIDATION_ERROR");
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new HttpError(400, "Укажите корректный номер телефона", "VALIDATION_ERROR");
  }
  let normalized = digits;
  if (digits.length === 11 && digits.startsWith("8")) normalized = `7${digits.slice(1)}`;
  return { raw, normalized: `+${normalized}` };
}

function safeSlug(value, label = "Машина") {
  const slug = singleLineText(value, label, 120);
  if (!slug) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, `${label}: некорректный идентификатор`, "VALIDATION_ERROR");
  }
  return slug;
}

function normalizeSearch(...values) {
  return values
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  text,
  singleLineText,
  personName,
  positiveId,
  optionalDate,
  publicServiceDate,
  enumValue,
  moneyToCents,
  normalizePhone,
  safeSlug,
  normalizeSearch
};
