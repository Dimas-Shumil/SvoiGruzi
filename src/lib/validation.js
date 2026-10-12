const { HttpError } = require('./http-error');

function text(value, field, maxLength = 500, required = false) {
  const normalized = String(value ?? '').replace(/\0/g, '').trim();
  if (required && !normalized) throw new HttpError(400, `Заполните поле «${field}»`, 'VALIDATION_ERROR');
  if (normalized.length > maxLength) throw new HttpError(400, `Поле «${field}» слишком длинное`, 'VALIDATION_ERROR');
  return normalized || null;
}

function singleLineText(value, field, maxLength = 255, required = false) {
  const normalized = text(value, field, maxLength, required);
  if (normalized == null) return null;
  if (/[\r\n\u2028\u2029]/.test(normalized)) {
    throw new HttpError(400, `Поле «${field}» должно быть в одну строку`, 'VALIDATION_ERROR');
  }
  if (/[<>]/.test(normalized)) {
    throw new HttpError(400, `Поле «${field}» содержит недопустимые символы`, 'VALIDATION_ERROR');
  }
  return normalized;
}

function personName(value, field = 'Имя') {
  const normalized = singleLineText(value, field, 80, true);
  if (normalized.length < 2) throw new HttpError(400, `Поле «${field}» слишком короткое`, 'VALIDATION_ERROR');
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .\-'’]{1,79}$/u.test(normalized)) {
    throw new HttpError(400, `Поле «${field}» содержит недопустимые символы`, 'VALIDATION_ERROR');
  }
  return normalized;
}

function positiveId(value, field = 'Идентификатор') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new HttpError(400, `${field} указан неверно`, 'VALIDATION_ERROR');
  return parsed;
}

function enumValue(value, allowed, field, fallback) {
  if (value == null && fallback !== undefined) return fallback;
  if (!allowed.has(value)) throw new HttpError(400, `Поле «${field}» указано неверно`, 'VALIDATION_ERROR');
  return value;
}

function optionalDate(value, field) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Поле «${field}» содержит неверную дату`, 'VALIDATION_ERROR');
  return date;
}

function publicServiceDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpError(400, 'Дата: некорректное значение', 'VALIDATION_ERROR');
  }

  const [year, month, day] = raw.split('-').map(Number);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (year < 2020 || month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new HttpError(400, 'Дата: некорректное значение', 'VALIDATION_ERROR');
  }

  const date = new Date(`${raw}T12:00:00+07:00`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Krasnoyarsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (raw < today) throw new HttpError(400, 'Дата перевозки не может быть в прошлом', 'VALIDATION_ERROR');
  return date;
}

function moneyToCents(value, field, required = false) {
  if (value === '' || value == null) {
    if (required) throw new HttpError(400, `Заполните поле «${field}»`, 'VALIDATION_ERROR');
    return null;
  }
  const normalized = String(value).replace(',', '.').replace(/\s/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000000) {
    throw new HttpError(400, `Поле «${field}» содержит неверную сумму`, 'VALIDATION_ERROR');
  }
  return Math.round(parsed * 100);
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (!/^7\d{10}$/.test(digits)) throw new HttpError(400, 'Укажите корректный номер телефона', 'VALIDATION_ERROR');
  return digits;
}

function formatPhone(digits) {
  return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function safeSlug(value, field = 'Slug', required = false) {
  const slug = singleLineText(value, field, 120, required);
  if (!slug) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, `Поле «${field}» указано неверно`, 'VALIDATION_ERROR');
  }
  return slug;
}

function normalizeSearch(...values) {
  return values
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9+]+/gi, ' ')
    .trim()
    .slice(0, 2000);
}

function dateRange(query, defaultDays = 30) {
  const now = new Date();
  const fallbackFrom = new Date(now.getTime() - defaultDays * 86400000);
  const from = query.from ? optionalDate(query.from, 'Начало периода') : fallbackFrom;
  const to = query.to ? optionalDate(query.to, 'Конец периода') : now;
  if (from >= to) throw new HttpError(400, 'Начало периода должно быть раньше конца', 'VALIDATION_ERROR');
  if (to.getTime() - from.getTime() > 370 * 86400000) {
    throw new HttpError(400, 'Период не может превышать 370 дней', 'VALIDATION_ERROR');
  }
  return { from, to };
}

module.exports = {
  text,
  singleLineText,
  personName,
  positiveId,
  enumValue,
  optionalDate,
  publicServiceDate,
  moneyToCents,
  normalizePhone,
  formatPhone,
  safeSlug,
  normalizeSearch,
  dateRange,
};
