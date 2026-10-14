'use strict';

const state = {
  user: null,
  csrfToken: '',
  requestView: localStorage.getItem('sg-request-view') === 'board' ? 'board' : 'list',
  taskView: localStorage.getItem('sg-task-view') === 'board' ? 'board' : 'list',
  requestFilters: { search: '', status: '', type: '' },
  fleetFilters: { search: '', status: '', published: '' },
  vehicles: [],
  idleMinutes: 15
};

const app = document.querySelector('#app');
const appShell = document.querySelector('.control-shell');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');
let modalReturnFocus = null;

const labels = {
  orderStatus: {
    NEW: 'Новая',
    PLANNED: 'Запланированная',
    COMPLETED: 'Выполнена',
    CANCELLED: 'Отменена'
  },
  orderType: { REGULAR: 'Обычная', SCHEDULED: 'Запланированная' },
  paymentStatus: { UNPAID: 'Не оплачено', PARTIAL: 'Частично', PAID: 'Оплачено' },
  paymentMethod: { CASH: 'Наличные', TRANSFER: 'Перевод', CARD: 'Карта', OTHER: 'Другое' },
  taskStatus: { TODO: 'Нужно сделать', IN_PROGRESS: 'В процессе', DONE: 'Выполнено' },
  taskPriority: { LOW: 'Низкий', MEDIUM: 'Обычный', HIGH: 'Высокий' },
  expenseCategory: {
    FUEL: 'Топливо', REPAIR: 'Ремонт', ADVERTISING: 'Реклама', WASH: 'Мойка',
    SERVICE: 'Обслуживание', TAX: 'Налоги', OTHER: 'Прочее'
  },
  vehicleStatus: {
    AVAILABLE: 'Свободна', BUSY: 'Занята', MAINTENANCE: 'На обслуживании', UNAVAILABLE: 'Недоступна'
  },
  ownership: { OWN: 'Свой автопарк', PARTNER: 'Партнёрская' }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function attr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function money(cents) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', maximumFractionDigits: 0
  }).format((Number(cents) || 0) / 100);
}

function shortDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function dateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function time(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function datetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function localDayRange(date = new Date()) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function monthRange() {
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function isoRangeQuery(range) {
  return new URLSearchParams({ from: range.from, to: range.to }).toString();
}

function routeText(order) {
  const from = String(order?.pickupAddress || '').trim();
  const to = String(order?.destinationAddress || '').trim();
  if (from && to) return `${from} — ${to}`;
  if (from) return `Откуда: ${from}`;
  if (to) return `Куда: ${to}`;
  return 'Маршрут не указан';
}

function clientContact(client) {
  return client?.phone || 'Телефон не указан';
}

function formatCapacity(kg) {
  if (!kg) return '—';
  return kg >= 1000 ? `${String(kg / 1000).replace('.', ',')} т` : `${kg} кг`;
}

function formatMeters(value) {
  return value == null ? '—' : `${String(value).replace('.', ',')} м`;
}

async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRF-Token'] = state.csrfToken;

  const response = await fetch(`/api/control${path}`, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace('/control/login.html');
    throw new Error('Сессия завершена');
  }
  if (!response.ok) throw new Error(data.message || 'Не удалось выполнить запрос');
  return data;
}

function toast(message, type = 'success') {
  const element = document.createElement('div');
  element.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  element.innerHTML = `<i class="ti ${type === 'error' ? 'ti-alert-circle' : 'ti-circle-check'}"></i><span>${escapeHtml(message)}</span>`;
  toastRoot.append(element);
  window.setTimeout(() => element.remove(), 3800);
}

function badge(textValue, tone = '') {
  return `<span class="badge${tone ? ` badge--${tone}` : ''}">${escapeHtml(textValue)}</span>`;
}

function orderStatusBadge(status) {
  const tones = { NEW: 'blue', PLANNED: 'orange', COMPLETED: 'green', CANCELLED: 'red' };
  return badge(labels.orderStatus[status] || status, tones[status]);
}

function vehicleStatusBadge(status) {
  const tones = { AVAILABLE: 'green', BUSY: 'orange', MAINTENANCE: 'blue', UNAVAILABLE: 'red' };
  return badge(labels.vehicleStatus[status] || status, tones[status]);
}

function emptyState(icon, title, textValue = '') {
  return `<div class="empty-state"><i class="ti ti-${icon}"></i><div><b>${escapeHtml(title)}</b>${textValue ? `<p>${escapeHtml(textValue)}</p>` : ''}</div></div>`;
}

function pageHeader(title, subtitle, actions = '') {
  return `<header class="page-header"><div><span class="control-eyebrow">СВОИ ГРУЗЫ</span><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><div class="page-header__actions">${actions}</div></header>`;
}

function setActiveNav(route) {
  document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('is-active', link.dataset.route === route));
}

function openModal(title, body, footer = '', wide = false) {
  if (!modalRoot.firstElementChild) {
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  modalRoot.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><header class="modal__header"><div><span class="control-eyebrow">СВОИ ГРУЗЫ</span><h2 id="modal-title">${escapeHtml(title)}</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Закрыть"><i class="ti ti-x"></i></button></header><div class="modal__body">${body}</div>${footer ? `<footer class="modal__footer">${footer}</footer>` : ''}</section></div>`;
  document.body.classList.add('is-modal-open');
  appShell?.setAttribute('inert', '');
  const modal = modalRoot.querySelector('.modal');
  const initial = modal?.querySelector('input:not([type="hidden"]), select, textarea, button:not([data-close-modal])') || modal;
  initial?.focus({ preventScroll: true });
}

function closeModal() {
  if (!modalRoot.firstElementChild) return;
  modalRoot.innerHTML = '';
  document.body.classList.remove('is-modal-open');
  appShell?.removeAttribute('inert');
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus({ preventScroll: true });
  modalReturnFocus = null;
}

function modalFocusableElements() {
  return [...modalRoot.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function formError(form, message) {
  const box = form.querySelector('.form-error');
  if (box) {
    box.textContent = message;
    box.hidden = false;
  } else {
    toast(message, 'error');
  }
}

function formValues(form) {
  const values = Object.fromEntries(new FormData(form));
  form.querySelectorAll('input[type="checkbox"][name]').forEach((input) => {
    values[input.name] = input.checked;
  });
  return values;
}

async function ensureVehicles() {
  const { vehicles } = await api('/vehicles');
  state.vehicles = vehicles;
  return vehicles;
}


function vehicleOptions(selectedId = '') {
  return `<option value="">Без привязки</option>${state.vehicles.map((vehicle) => `<option value="${vehicle.id}"${String(vehicle.id) === String(selectedId || '') ? ' selected' : ''}>${escapeHtml(vehicle.name)}</option>`).join('')}`;
}

function sourceOptions(selected = 'Другое') {
  return ['Сайт', 'Яндекс', '2ГИС', 'Рекомендация', 'Постоянный клиент', 'Социальные сети', 'Телефон', 'Другое']
    .map((source) => `<option value="${attr(source)}"${source === selected ? ' selected' : ''}>${escapeHtml(source)}</option>`).join('');
}

function requestRow(order) {
  const mainDate = order.scheduledAt || order.createdAt;
  const vehicleName = order.vehicleRecord?.name || order.vehicle || 'Машина не выбрана';
  return `<article class="request-row" data-request-id="${order.id}" tabindex="0" role="button" aria-label="Открыть заявку"><span class="request-row__date"><b>${escapeHtml(time(mainDate))}</b><small>${escapeHtml(shortDate(mainDate))}</small></span><span class="request-row__route"><b>${escapeHtml(routeText(order))}</b><small>${escapeHtml(order.cargoType || vehicleName)}</small></span><span class="request-row__client"><b>${escapeHtml(order.client?.name || 'Без имени')}</b><small>${escapeHtml(clientContact(order.client))}</small></span>${orderStatusBadge(order.status)}<strong class="request-row__amount">${order.amountCents == null ? '—' : money(order.amountCents)}</strong></article>`;
}

async function renderDashboard() {
  const range = localDayRange();
  const data = await api(`/dashboard?${isoRangeQuery(range)}`);
  const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const fleetAttention = data.vehicles.filter((vehicle) => vehicle.status !== 'AVAILABLE');

  app.innerHTML = `<div class="page">
    ${pageHeader('Сегодня', today, '<button class="control-button control-button--primary" data-action="new-request"><i class="ti ti-plus"></i><span>Новая заявка</span></button>')}
    <section class="metric-grid">
      <article class="metric-card metric-card--accent"><span>Выручка сегодня</span><strong>${money(data.stats.revenueCents)}</strong><small>Оплачено ${money(data.stats.paidCents)}</small></article>
      <article class="metric-card"><span>Заявок</span><strong>${data.stats.orderCount}</strong><small>Средний чек ${money(data.stats.averageCheckCents)}</small></article>
      <article class="metric-card"><span>Расходы</span><strong>${money(data.stats.expenseCents)}</strong><small>За сегодняшний день</small></article>
      <article class="metric-card"><span>Прибыль</span><strong>${money(data.stats.profitCents)}</strong><small>${data.stats.debtCents ? `Долг ${money(data.stats.debtCents)}` : 'Долгов нет'}</small></article>
    </section>

    <div class="dashboard-grid">
      <section class="panel panel--span-2"><header class="panel__header"><div><h2>Сегодняшние заявки</h2><p>Последние обращения за день</p></div><a class="text-link" href="#/requests">Все заявки</a></header><div class="request-list">${data.recentOrders.length ? data.recentOrders.map(requestRow).join('') : emptyState('inbox', 'Сегодня заявок пока нет')}</div></section>

      <section class="panel"><header class="panel__header"><div><h3>Ближайшие</h3><p>Запланированные перевозки</p></div></header><div class="compact-list">${data.planned.length ? data.planned.map((order) => `<button class="compact-card" type="button" data-request-id="${order.id}"><span><b>${escapeHtml(dateTime(order.scheduledAt))}</b><small>${escapeHtml(routeText(order))}</small></span><i class="ti ti-chevron-right"></i></button>`).join('') : emptyState('calendar', 'Нет запланированных заявок')}</div></section>

      <section class="panel"><header class="panel__header"><div><h3>Задачи</h3><p>Что нельзя забыть</p></div><a class="text-link" href="#/tasks">Открыть</a></header><div class="compact-list">${data.activeTasks.length ? data.activeTasks.map((task) => `<button class="compact-card" type="button" data-task-id="${task.id}"><span><b>${escapeHtml(task.title)}</b><small>${task.dueAt ? dateTime(task.dueAt) : 'Без срока'} · ${escapeHtml(labels.taskPriority[task.priority])}</small></span><i class="ti ti-chevron-right"></i></button>`).join('') : emptyState('circle-check', 'Активных задач нет')}</div></section>

      <section class="panel panel--span-2"><header class="panel__header"><div><h2>Автопарк</h2><p>${fleetAttention.length ? 'Есть машины, требующие внимания' : 'Все машины доступны'}</p></div><a class="text-link" href="#/fleet">Автопарк</a></header><div class="fleet-mini-grid">${data.vehicles.length ? data.vehicles.map((vehicle) => `<button class="fleet-mini" type="button" data-vehicle-id="${vehicle.id}"><span class="fleet-mini__media">${vehicle.previewImage ? `<img src="${attr(vehicle.previewImage)}" alt="">` : '<i class="ti ti-truck"></i>'}</span><span class="fleet-mini__copy"><b>${escapeHtml(vehicle.name)}</b><small>${escapeHtml(vehicle.bodyType || 'Автомобиль')}</small></span>${vehicleStatusBadge(vehicle.status)}</button>`).join('') : emptyState('truck-off', 'Автопарк пуст')}</div></section>
    </div>
  </div>`;
}

function requestFiltersMarkup() {
  return `<section class="filters-bar"><label class="search-field"><i class="ti ti-search"></i><input id="request-search" type="search" maxlength="120" placeholder="Имя, телефон, маршрут, груз" value="${attr(state.requestFilters.search)}"></label><select class="control-select" id="request-status"><option value="">Все статусы</option>${Object.entries(labels.orderStatus).map(([value, label]) => `<option value="${value}"${state.requestFilters.status === value ? ' selected' : ''}>${label}</option>`).join('')}</select><select class="control-select" id="request-type"><option value="">Все типы</option>${Object.entries(labels.orderType).map(([value, label]) => `<option value="${value}"${state.requestFilters.type === value ? ' selected' : ''}>${label}</option>`).join('')}</select><div class="view-toggle"><button type="button" data-request-view="list" class="${state.requestView === 'list' ? 'is-active' : ''}" aria-label="Список"><i class="ti ti-list"></i></button><button type="button" data-request-view="board" class="${state.requestView === 'board' ? 'is-active' : ''}" aria-label="Доска"><i class="ti ti-layout-kanban"></i></button></div></section>`;
}

function requestBoard(orders) {
  const columns = [['NEW', 'Новые'], ['PLANNED', 'Запланированные'], ['COMPLETED', 'Выполненные'], ['CANCELLED', 'Отменённые']];
  return `<section class="board">${columns.map(([status, title]) => {
    const rows = orders.filter((order) => order.status === status);
    return `<div class="board-column"><header class="board-column__header"><h3>${title}</h3><span>${rows.length}</span></header><div class="board-column__body">${rows.length ? rows.map((order) => `<button class="board-card" type="button" data-request-id="${order.id}"><span class="board-card__top">${orderStatusBadge(order.status)}<small>${escapeHtml(shortDate(order.createdAt))}</small></span><b>${escapeHtml(order.client?.name || 'Без имени')}</b><p>${escapeHtml(routeText(order))}</p><span class="board-card__foot"><small>${escapeHtml(order.cargoType || order.vehicle || 'Груз не указан')}</small><strong>${order.amountCents == null ? '—' : money(order.amountCents)}</strong></span></button>`).join('') : '<div class="board-empty">Пусто</div>'}</div></div>`;
  }).join('')}</section>`;
}

async function renderRequests() {
  app.innerHTML = `<div class="page">${pageHeader('Заявки', 'Все обращения с сайта и созданные вручную', '<button class="control-button control-button--primary" data-action="new-request"><i class="ti ti-plus"></i><span>Новая заявка</span></button>')}${requestFiltersMarkup()}<section id="requests-content" class="panel">${emptyState('loader-2', 'Загружаем заявки')}</section></div>`;
  await loadRequests();

  let timer;
  document.querySelector('#request-search')?.addEventListener('input', (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.requestFilters.search = event.target.value;
      loadRequests();
    }, 250);
  });
  document.querySelector('#request-status')?.addEventListener('change', (event) => {
    state.requestFilters.status = event.target.value;
    loadRequests();
  });
  document.querySelector('#request-type')?.addEventListener('change', (event) => {
    state.requestFilters.type = event.target.value;
    loadRequests();
  });
}

async function loadRequests() {
  const query = new URLSearchParams({ limit: '100' });
  Object.entries(state.requestFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const data = await api(`/orders?${query}`);
  const content = document.querySelector('#requests-content');
  if (!content) return;
  content.classList.toggle('panel', state.requestView === 'list');
  content.innerHTML = data.orders.length
    ? state.requestView === 'board' ? requestBoard(data.orders) : `<div class="request-list">${data.orders.map(requestRow).join('')}</div>`
    : emptyState('inbox-off', 'Заявки не найдены', 'Измени фильтры или создай новую заявку.');
}

function requestFormMarkup(order = null) {
  const isScheduled = order?.type === 'SCHEDULED';
  const amount = order?.amountCents == null ? '' : order.amountCents / 100;
  const paidAmount = order?.paidAmountCents ? order.paidAmountCents / 100 : '';
  const loaders = order?.loadersRequired === true ? 'true' : order?.loadersRequired === false ? 'false' : '';

  return `<form id="request-form" class="form-grid request-form" novalidate data-request-id="${order?.id || ''}" data-current-status="${attr(order?.status || '')}">
    <div class="request-type-toggle field--wide" role="group" aria-label="Тип заявки">
      <button type="button" data-request-type-choice="REGULAR" class="${isScheduled ? '' : 'is-active'}">Обычный</button>
      <button type="button" data-request-type-choice="SCHEDULED" class="${isScheduled ? 'is-active' : ''}">Запланированный</button>
    </div>
    <input type="hidden" name="type" value="${isScheduled ? 'SCHEDULED' : 'REGULAR'}">
    <p class="request-form__hint field--wide" id="request-type-hint">${isScheduled ? 'Укажите дату и время перевозки — статус будет «Запланированная».' : 'Обычная заявка создаётся со статусом «Новая».'}</p>
    <label class="control-field field--wide" id="request-scheduled-field"${isScheduled ? '' : ' hidden'}><span class="control-field__label">Дата и время *</span><input class="control-input" name="scheduledAt" type="datetime-local" value="${attr(datetimeLocal(order?.scheduledAt))}"></label>

    <div class="request-route field--wide">
      <label class="request-route__field"><i class="ti ti-map-pin-filled"></i><span><small>Откуда</small><input name="pickupAddress" maxlength="300" value="${attr(order?.pickupAddress || '')}" placeholder="Адрес подачи"></span></label>
      <label class="request-route__field"><i class="ti ti-flag-filled"></i><span><small>Куда</small><input name="destinationAddress" maxlength="300" value="${attr(order?.destinationAddress || '')}" placeholder="Адрес назначения"></span></label>
    </div>

    <label class="control-field"><span class="control-field__label">Телефон</span><span class="control-input-wrap"><i class="ti ti-phone"></i><input name="phone" type="tel" maxlength="30" value="${attr(order?.client?.phone || '')}" placeholder="+7 999 000-00-00"></span></label>
    <label class="control-field"><span class="control-field__label">Имя клиента *</span><input class="control-input" name="clientName" required maxlength="120" value="${attr(order?.client?.name || '')}" placeholder="Например, Алексей"></label>
    <label class="control-field field--wide"><span class="control-field__label">Автомобиль</span><select class="control-select" name="vehicleId">${vehicleOptions(order?.vehicleId)}</select></label>

    <label class="control-field"><span class="control-field__label">Что перевозим</span><input class="control-input" name="cargoType" maxlength="120" value="${attr(order?.cargoType || '')}" placeholder="Мебель, техника, коробки"></label>
    <label class="control-field"><span class="control-field__label">Грузчики</span><select class="control-select" name="loadersRequired"><option value=""${loaders === '' ? ' selected' : ''}>Не указано</option><option value="true"${loaders === 'true' ? ' selected' : ''}>Нужны</option><option value="false"${loaders === 'false' ? ' selected' : ''}>Не нужны</option></select></label>

    <label class="control-field"><span class="control-field__label">Стоимость, ₽ *</span><input class="control-input" name="amount" type="number" min="0" max="100000000" step="1" required value="${attr(amount)}" placeholder="Сумма заказа"></label>
    <label class="control-field"><span class="control-field__label">Статус оплаты</span><select class="control-select" name="paymentStatus"><option value="PAID"${order?.paymentStatus === 'PAID' || !order ? ' selected' : ''}>Оплачено</option><option value="UNPAID"${order?.paymentStatus === 'UNPAID' ? ' selected' : ''}>Не оплачено</option><option value="PARTIAL"${order?.paymentStatus === 'PARTIAL' ? ' selected' : ''}>Частично</option></select></label>
    <label class="control-field"><span class="control-field__label">Способ оплаты</span><select class="control-select" name="paymentMethod"><option value="">Не указан</option>${Object.entries(labels.paymentMethod).map(([value, label]) => `<option value="${value}"${order?.paymentMethod === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="control-field"><span class="control-field__label">Оплачено, ₽</span><input class="control-input" name="paidAmount" type="number" min="0" step="1" value="${attr(paidAmount)}" placeholder="Для частичной оплаты"></label>
    <label class="control-field"><span class="control-field__label">Источник</span><select class="control-select" name="source">${sourceOptions(order?.source || 'Другое')}</select></label>
    <label class="control-field field--wide"><span class="control-field__label">Комментарий</span><textarea class="control-textarea" name="notes" maxlength="2000" placeholder="Дополнительные детали">${escapeHtml(order?.notes || '')}</textarea></label>
    <div class="form-error field--wide" hidden></div>
  </form>`;
}

async function openRequestForm(order = null) {
  if (!state.vehicles.length) await ensureVehicles();
  openModal(order ? `Заявка №${order.id}` : 'Новый заказ', requestFormMarkup(order), `<button class="control-button" type="button" data-close-modal>Отмена</button><button class="control-button control-button--primary" type="submit" form="request-form">${order ? 'Сохранить' : 'Создать заказ'}</button>`, true);
  document.querySelector('.modal')?.classList.add('modal--request');

  const form = document.querySelector('#request-form');
  const scheduledField = document.querySelector('#request-scheduled-field');
  const hint = document.querySelector('#request-type-hint');
  document.querySelectorAll('[data-request-type-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.requestTypeChoice;
      form.elements.type.value = type;
      document.querySelectorAll('[data-request-type-choice]').forEach((item) => item.classList.toggle('is-active', item === button));
      scheduledField.hidden = type !== 'SCHEDULED';
      scheduledField.querySelector('input').required = type === 'SCHEDULED';
      hint.textContent = type === 'SCHEDULED'
        ? 'Укажите дату и время перевозки — статус будет «Запланированная».'
        : 'Обычная заявка создаётся со статусом «Новая».';
      if (!form.dataset.requestId) form.elements.paymentStatus.value = type === 'SCHEDULED' ? 'UNPAID' : 'PAID';
    });
  });
  const scheduledInput = scheduledField?.querySelector('input');
  if (scheduledInput) scheduledInput.required = isScheduledRequest(form);
  form?.addEventListener('submit', submitRequestForm);
}

function isScheduledRequest(form) {
  return form?.elements?.type?.value === 'SCHEDULED';
}

async function submitRequestForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = document.querySelector('[form="request-form"]');
  button.disabled = true;
  try {
    const body = formValues(form);
    if (body.scheduledAt) body.scheduledAt = new Date(body.scheduledAt).toISOString();
    else body.scheduledAt = null;
    const id = form.dataset.requestId;
    const currentStatus = form.dataset.currentStatus;
    if (!id || ['NEW', 'PLANNED'].includes(currentStatus)) {
      body.status = body.type === 'SCHEDULED' ? 'PLANNED' : 'NEW';
    }
    await api(id ? `/orders/${id}` : '/orders', { method: id ? 'PATCH' : 'POST', body });
    closeModal();
    toast(id ? 'Заявка сохранена' : 'Заявка создана');
    await renderCurrentRoute();
  } catch (error) {
    formError(form, error.message);
  } finally {
    button.disabled = false;
  }
}

async function showRequest(id) {
  const { order } = await api(`/orders/${id}`);
  const debt = Math.max((order.amountCents || 0) - (order.paidAmountCents || 0), 0);
  openModal(`Заявка №${order.id}`, `<div class="detail-grid">
    <div class="detail-item"><span>Статус</span><strong>${orderStatusBadge(order.status)}</strong></div>
    <div class="detail-item"><span>Создана</span><strong>${escapeHtml(dateTime(order.createdAt))}</strong></div>
    <div class="detail-item"><span>Клиент</span><strong>${escapeHtml(order.client?.name || 'Без имени')}</strong></div>
    <div class="detail-item"><span>Телефон</span><strong>${order.client?.phone ? `<a href="tel:${attr(order.client.phoneNormalized || order.client.phone)}">${escapeHtml(order.client.phone)}</a>` : 'Не указан'}</strong></div>
    <div class="detail-item detail-item--wide"><span>Маршрут</span><strong>${escapeHtml(routeText(order))}</strong></div>
    <div class="detail-item"><span>Груз</span><strong>${escapeHtml(order.cargoType || '—')}</strong></div>
    <div class="detail-item"><span>Грузчики</span><strong>${order.loadersRequired === true ? 'Нужны' : order.loadersRequired === false ? 'Не нужны' : 'Не указано'}</strong></div>
    <div class="detail-item"><span>Машина</span><strong>${escapeHtml(order.vehicleRecord?.name || order.vehicle || 'Не выбрана')}</strong></div>
    <div class="detail-item"><span>Дата перевозки</span><strong>${escapeHtml(dateTime(order.scheduledAt))}</strong></div>
    <div class="detail-item"><span>Стоимость</span><strong>${order.amountCents == null ? 'Не указана' : money(order.amountCents)}</strong></div>
    <div class="detail-item"><span>Оплата</span><strong>${escapeHtml(labels.paymentStatus[order.paymentStatus])}${debt ? ` · долг ${money(debt)}` : ''}</strong></div>
    <div class="detail-item"><span>Источник</span><strong>${escapeHtml(order.source)}</strong></div>
    <div class="detail-item detail-item--wide"><span>Комментарий</span><strong>${escapeHtml(order.notes || '—')}</strong></div>
  </div>
  <div class="modal-actions">
    ${['NEW', 'PLANNED'].includes(order.status) ? `<button class="control-button control-button--primary" data-request-status="COMPLETED" data-request-id="${order.id}"><i class="ti ti-check"></i> Выполнить</button>` : ''}
    ${!['COMPLETED', 'CANCELLED'].includes(order.status) ? `<button class="control-button" data-request-status="CANCELLED" data-request-id="${order.id}">Отменить</button>` : ''}
    <button class="control-button" data-edit-request="${order.id}"><i class="ti ti-edit"></i> Редактировать</button>
    <button class="control-button control-button--danger" data-delete-request="${order.id}"><i class="ti ti-trash"></i> Удалить</button>
  </div>`, '<button class="control-button" type="button" data-close-modal>Закрыть</button>', true);
}

function clientRow(client) {
  return `<article class="client-row" data-client-id="${client.id}" tabindex="0" role="button" aria-label="Открыть клиента ${attr(client.name || client.phone || `#${client.id}`)}"><span class="client-row__identity"><span class="list-avatar">${escapeHtml((client.name || client.phone || '?').slice(0, 1).toUpperCase())}</span><span><b>${escapeHtml(client.name || 'Без имени')}</b><small>${escapeHtml(clientContact(client))}</small></span></span><span class="client-row__vehicle">${escapeHtml(client.defaultVehicle || 'Машина не указана')}</span><span><b>${client._count?.orders || 0}</b><small>заявок</small></span><strong>${money(client.totalCents)}</strong><strong class="client-row__debt">${client.debtCents ? money(client.debtCents) : '—'}</strong></article>`;
}

async function renderClients() {
  const { clients } = await api('/clients');
  app.innerHTML = `<div class="page">${pageHeader('Клиенты', 'Контакты, история заявок и задолженности')}<section class="filters-bar"><label class="search-field search-field--grow"><i class="ti ti-search"></i><input id="client-search" type="search" maxlength="120" placeholder="Имя, телефон или машина"></label></section><section id="clients-content" class="panel"><div class="client-list client-list--head"><span>Клиент</span><span>Машина</span><span>История</span><span>Сумма</span><span>Долг</span></div><div class="client-list">${clients.length ? clients.map(clientRow).join('') : emptyState('users', 'Клиенты появятся после первой заявки')}</div></section></div>`;
  let timer;
  document.querySelector('#client-search')?.addEventListener('input', (event) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const data = await api(`/clients?search=${encodeURIComponent(event.target.value)}`);
        document.querySelector('#clients-content').innerHTML = `<div class="client-list client-list--head"><span>Клиент</span><span>Машина</span><span>История</span><span>Сумма</span><span>Долг</span></div><div class="client-list">${data.clients.length ? data.clients.map(clientRow).join('') : emptyState('user-off', 'Клиенты не найдены')}</div>`;
      } catch (error) { toast(error.message, 'error'); }
    }, 250);
  });
}

function clientFormMarkup(client = null) {
  return `<form id="client-form" class="form-grid" data-client-id="${client?.id || ''}">
    <label class="control-field"><span class="control-field__label">Имя *</span><input class="control-input" name="name" required maxlength="120" value="${attr(client?.name || '')}" placeholder="Имя клиента"></label>
    <label class="control-field"><span class="control-field__label">Телефон</span><input class="control-input" name="phone" type="tel" maxlength="30" value="${attr(client?.phone || '')}" placeholder="+7 999 000-00-00"></label>
    <label class="control-field field--wide"><span class="control-field__label">Предпочитаемая машина</span><input class="control-input" name="defaultVehicle" maxlength="180" value="${attr(client?.defaultVehicle || '')}" placeholder="Если есть"></label>
    <label class="control-field field--wide"><span class="control-field__label">Заметка</span><textarea class="control-textarea" name="notes" maxlength="2000" placeholder="Особенности клиента, договорённости">${escapeHtml(client?.notes || '')}</textarea></label>
    <div class="form-error field--wide" hidden></div>
  </form>`;
}

async function showClient(id) {
  const { client } = await api(`/clients/${id}`);
  openModal(client.name || client.phone || `Клиент №${client.id}`, `${clientFormMarkup(client)}
    <section class="subpanel"><header class="subpanel__header"><div><h3>История заявок</h3><p>${client.orders.length} записей</p></div></header><div class="request-list">${client.orders.length ? client.orders.map(requestRow).join('') : emptyState('inbox', 'Заявок нет')}</div></section>`, `<button class="control-button control-button--danger" type="button" data-delete-client="${client.id}"><i class="ti ti-trash"></i> Удалить</button><button class="control-button" type="button" data-close-modal>Отмена</button><button class="control-button control-button--primary" type="submit" form="client-form">Сохранить</button>`, true);

  document.querySelector('#client-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api(`/clients/${client.id}`, { method: 'PATCH', body: formValues(form) });
      closeModal();
      toast('Клиент сохранён');
      await renderClients();
    } catch (error) { formError(form, error.message); }
  });
}

function fleetCard(vehicle) {
  return `<article class="fleet-admin-card" data-vehicle-id="${vehicle.id}" tabindex="0" role="button" aria-label="Открыть ${attr(vehicle.name)}"><div class="fleet-admin-card__media">${vehicle.previewImage ? `<img src="${attr(vehicle.previewImage)}" alt="">` : '<i class="ti ti-truck"></i>'}</div><div class="fleet-admin-card__body"><div class="fleet-admin-card__head"><div><h3>${escapeHtml(vehicle.name)}</h3><p>${escapeHtml(vehicle.shortDescription || vehicle.bodyType || 'Без описания')}</p></div>${vehicleStatusBadge(vehicle.status)}</div><div class="fleet-admin-card__specs"><span><b>${formatCapacity(vehicle.capacityKg)}</b><small>грузоподъёмность</small></span><span><b>${vehicle.volumeM3 ? `${String(vehicle.volumeM3).replace('.', ',')} м³` : '—'}</b><small>объём</small></span><span><b>${escapeHtml(vehicle.bodyType || '—')}</b><small>кузов</small></span></div><div class="fleet-admin-card__foot"><span>${vehicle.published ? '<i class="ti ti-eye"></i> На сайте' : '<i class="ti ti-eye-off"></i> Скрыта'}</span><span>${vehicle._count?.orders || 0} заявок</span></div></div></article>`;
}

function fleetFiltersMarkup() {
  return `<section class="filters-bar"><label class="search-field search-field--grow"><i class="ti ti-search"></i><input id="fleet-search" type="search" maxlength="120" placeholder="Название, slug, кузов" value="${attr(state.fleetFilters.search)}"></label><select class="control-select" id="fleet-status"><option value="">Все статусы</option>${Object.entries(labels.vehicleStatus).map(([value, label]) => `<option value="${value}"${state.fleetFilters.status === value ? ' selected' : ''}>${label}</option>`).join('')}</select><select class="control-select" id="fleet-published"><option value="">Любая видимость</option><option value="true"${state.fleetFilters.published === 'true' ? ' selected' : ''}>На сайте</option><option value="false"${state.fleetFilters.published === 'false' ? ' selected' : ''}>Скрытые</option></select></section>`;
}

async function renderFleet() {
  app.innerHTML = `<div class="page">${pageHeader('Автопарк', 'Машины, которые отображаются на сайте', '<button class="control-button control-button--primary" data-action="new-vehicle"><i class="ti ti-plus"></i><span>Добавить машину</span></button>')}${fleetFiltersMarkup()}<section id="fleet-content" class="fleet-admin-grid">${emptyState('loader-2', 'Загружаем автопарк')}</section></div>`;
  await loadFleet();

  let timer;
  document.querySelector('#fleet-search')?.addEventListener('input', (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.fleetFilters.search = event.target.value; loadFleet(); }, 250);
  });
  document.querySelector('#fleet-status')?.addEventListener('change', (event) => { state.fleetFilters.status = event.target.value; loadFleet(); });
  document.querySelector('#fleet-published')?.addEventListener('change', (event) => { state.fleetFilters.published = event.target.value; loadFleet(); });
}

async function loadFleet() {
  const query = new URLSearchParams();
  const filters = { search: state.fleetFilters.search, status: state.fleetFilters.status, published: state.fleetFilters.published };
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const data = await api(`/vehicles?${query}`);
  state.vehicles = data.vehicles;
  const content = document.querySelector('#fleet-content');
  if (!content) return;
  content.innerHTML = data.vehicles.length ? data.vehicles.map(fleetCard).join('') : emptyState('truck-off', 'Машины не найдены', 'Добавь автомобиль или измени фильтры.');
}

function vehicleGalleryItems(vehicle) {
  const items = [];
  const seen = new Set();
  if (vehicle?.previewImage) {
    items.push({ image: vehicle.previewImage, alt: vehicle.name || '' });
    seen.add(vehicle.previewImage);
  }
  for (const image of vehicle?.images || []) {
    if (!image?.image || seen.has(image.image)) continue;
    items.push({ image: image.image, alt: image.alt || '' });
    seen.add(image.image);
  }
  return items.slice(0, 12);
}

function vehicleFormMarkup(vehicle = null) {
  const gallery = JSON.stringify(vehicleGalleryItems(vehicle));
  const ownership = vehicle?.ownershipType || 'OWN';
  const carrier = vehicle?.carrier || {};
  const bodyTypeOptions = ['Фургон', 'Тент', 'Бортовой', 'Рефрижератор', 'Изотермический'];
  const currentBodyType = String(vehicle?.bodyType || '').trim();
  const bodyTypePreset = bodyTypeOptions.includes(currentBodyType) ? currentBodyType : currentBodyType ? 'OTHER' : '';
  const customBodyType = bodyTypePreset === 'OTHER' ? currentBodyType : '';
  return `<form id="vehicle-form" class="form-grid" data-vehicle-id="${vehicle?.id || ''}">
    <div class="form-section-title field--wide"><span>Основное</span></div>
    <label class="control-field"><span class="control-field__label">Название *</span><input class="control-input" name="name" required maxlength="160" value="${attr(vehicle?.name || '')}" placeholder="Газель NEXT 4.2 м"></label>
    <label class="control-field"><span class="control-field__label">Slug *</span><input class="control-input" name="slug" required maxlength="120" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="${attr(vehicle?.slug || '')}" placeholder="gazelle-next-4-2"></label>
    <label class="control-field field--wide"><span class="control-field__label">Краткое описание</span><input class="control-input" name="shortDescription" maxlength="400" value="${attr(vehicle?.shortDescription || '')}" placeholder="Текст в карточке и верхнем блоке car.html"></label>
    <label class="control-field field--wide"><span class="control-field__label">Основное описание</span><textarea class="control-textarea" name="description" maxlength="4000" placeholder="Описание автомобиля">${escapeHtml(vehicle?.description || '')}</textarea></label>

    <div class="form-section-title field--wide"><span>Принадлежность</span></div>
    <div class="request-type-toggle field--wide" role="group" aria-label="Принадлежность машины">
      <button type="button" data-ownership-choice="OWN" class="${ownership === 'OWN' ? 'is-active' : ''}">Собственная</button>
      <button type="button" data-ownership-choice="PARTNER" class="${ownership === 'PARTNER' ? 'is-active' : ''}">Партнёрская</button>
    </div>
    <input type="hidden" name="ownershipType" value="${attr(ownership)}">
    <div class="partner-fields field--wide" data-partner-fields${ownership === 'PARTNER' ? '' : ' hidden'}>
      <label class="control-field"><span class="control-field__label">Имя партнёра *</span><input class="control-input" name="partnerName" maxlength="120" value="${attr(carrier.name || '')}" placeholder="Имя владельца машины"></label>
      <label class="control-field"><span class="control-field__label">Телефон партнёра *</span><input class="control-input" name="partnerPhone" type="tel" maxlength="30" value="${attr(carrier.phone || '')}" placeholder="+7 999 000-00-00"></label>
      <label class="control-field"><span class="control-field__label">Компания</span><input class="control-input" name="partnerCompanyName" maxlength="180" value="${attr(carrier.companyName || '')}"></label>
      <label class="control-field"><span class="control-field__label">Email</span><input class="control-input" name="partnerEmail" type="email" maxlength="180" value="${attr(carrier.email || '')}"></label>
      <label class="control-field"><span class="control-field__label">Комиссия, %</span><input class="control-input" name="partnerCommissionPercent" type="number" min="0" max="100" step="0.1" value="${attr(carrier.commissionPercent ?? '')}"></label>
      <label class="control-field"><span class="control-field__label">Заметка</span><input class="control-input" name="partnerNotes" maxlength="1000" value="${attr(carrier.notes || '')}"></label>
    </div>

    <div class="form-section-title field--wide"><span>Характеристики для car.html</span></div>
    <label class="control-field"><span class="control-field__label">Грузоподъёмность, кг</span><input class="control-input" name="capacityKg" type="number" min="0" step="1" value="${attr(vehicle?.capacityKg ?? '')}"></label>
    <label class="control-field"><span class="control-field__label">Объём, м³</span><input class="control-input" name="volumeM3" type="number" min="0" step="0.1" value="${attr(vehicle?.volumeM3 ?? '')}"></label>
    <label class="control-field"><span class="control-field__label">Длина кузова, м</span><input class="control-input" name="bodyLengthM" type="number" min="0" step="0.1" value="${attr(vehicle?.bodyLengthM ?? '')}"></label>
    <label class="control-field"><span class="control-field__label">Ширина кузова, м</span><input class="control-input" name="bodyWidthM" type="number" min="0" step="0.1" value="${attr(vehicle?.bodyWidthM ?? '')}"></label>
    <label class="control-field"><span class="control-field__label">Высота кузова, м</span><input class="control-input" name="bodyHeightM" type="number" min="0" step="0.1" value="${attr(vehicle?.bodyHeightM ?? '')}"></label>
    <label class="control-field"><span class="control-field__label">Тип кузова</span><select class="control-select" name="bodyTypePreset"><option value=""${bodyTypePreset === '' ? ' selected' : ''}>Не указано</option>${bodyTypeOptions.map((option) => `<option value="${attr(option)}"${bodyTypePreset === option ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}<option value="OTHER"${bodyTypePreset === 'OTHER' ? ' selected' : ''}>Другое</option></select></label>
    <label class="control-field" data-body-type-other${bodyTypePreset === 'OTHER' ? '' : ' hidden'}><span class="control-field__label">Другой тип кузова</span><input class="control-input" name="bodyTypeOther" maxlength="120" value="${attr(customBodyType)}" placeholder="Укажите тип кузова"></label>
    <input type="hidden" name="bodyType" value="${attr(currentBodyType)}">
    <label class="control-field"><span class="control-field__label">Погрузка</span><input class="control-input" name="loadingType" maxlength="160" value="${attr(vehicle?.loadingType || '')}" placeholder="Задняя / боковая"></label>
    <label class="control-field"><span class="control-field__label">Зона работы</span><input class="control-input" name="serviceArea" maxlength="180" value="${attr(vehicle?.serviceArea || '')}" placeholder="Абакан и Хакасия"></label>
    <label class="control-field field--wide"><span class="control-field__label">Текст над характеристиками</span><textarea class="control-textarea" name="specsDescription" maxlength="2000">${escapeHtml(vehicle?.specsDescription || '')}</textarea></label>
    <label class="control-field field--wide"><span class="control-field__label">Описание блока «Что можно перевозить»</span><textarea class="control-textarea" name="cargoDescription" maxlength="2000">${escapeHtml(vehicle?.cargoDescription || '')}</textarea></label>
    <label class="control-field field--wide"><span class="control-field__label">Что можно перевозить</span><textarea class="control-textarea" name="cargoItems" maxlength="3000" placeholder="Каждый пункт с новой строки">${escapeHtml(vehicle?.cargoItems || '')}</textarea></label>
    <label class="control-field field--wide"><span class="control-field__label">Категории</span><input class="control-input" name="categories" maxlength="400" value="${attr(vehicle?.categories || '')}" placeholder="Переезды, мебель, техника"></label>

    <div class="form-section-title field--wide"><span>Фотографии</span></div>
    <div class="control-field field--wide">
      <div class="vehicle-gallery-editor" data-vehicle-gallery-editor></div>
      <input type="hidden" name="gallery" value="${attr(gallery)}">
      <span class="media-tools"><button class="inline-action" type="button" data-vehicle-upload="gallery"><i class="ti ti-photo-plus"></i> Добавить фотографии</button><small class="control-field__hint">До 12 фото. Первое фото — главное. Его можно поменять прямо в списке.</small></span>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-vehicle-file="gallery" hidden>
    </div>

    <div class="form-section-title field--wide"><span>Публикация</span></div>
    <label class="control-field"><span class="control-field__label">Статус</span><select class="control-select" name="status">${Object.entries(labels.vehicleStatus).map(([value, label]) => `<option value="${value}"${(vehicle?.status || 'AVAILABLE') === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="control-field"><span class="control-field__label">Порядок</span><input class="control-input" name="sortOrder" type="number" min="-10000" max="10000" step="1" value="${attr(vehicle?.sortOrder ?? 0)}"></label>
    <label class="switch-field field--wide"><input name="published" type="checkbox"${vehicle?.published !== false ? ' checked' : ''}><span class="switch-field__toggle"></span><span><b>Показывать на сайте</b><small>Скрытая машина остаётся в истории заявок.</small></span></label>
    <div class="form-error field--wide" hidden></div>
  </form>`;
}

function readVehicleGallery(form) {
  try {
    const value = JSON.parse(form.elements.gallery?.value || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.image === 'string' && item.image.trim()).slice(0, 12)
      .map((item) => ({ image: item.image.trim(), alt: String(item.alt || '').trim() }));
  } catch {
    return [];
  }
}

function renderVehicleGalleryEditor(form) {
  const editor = form.querySelector('[data-vehicle-gallery-editor]');
  if (!editor) return;
  const gallery = readVehicleGallery(form);
  editor.innerHTML = gallery.length
    ? gallery.map((item, index) => `<figure class="vehicle-gallery-editor__item"><img src="${attr(item.image)}" alt="${attr(item.alt || `Фото ${index + 1}`)}"><div class="vehicle-gallery-editor__actions"><button class="vehicle-gallery-editor__main${index === 0 ? ' is-main' : ''}" type="button" data-main-gallery-image="${index}"${index === 0 ? ' disabled' : ''}>${index === 0 ? 'Главное фото' : 'Сделать главным'}</button><button class="vehicle-gallery-editor__remove" type="button" data-remove-gallery-image="${index}" aria-label="Удалить фото ${index + 1}" title="Удалить фото"><i class="ti ti-x" aria-hidden="true"></i></button></div></figure>`).join('')
    : '<div class="vehicle-gallery-editor__empty"><i class="ti ti-photo"></i><span>Фотографий пока нет</span></div>';
}

function writeVehicleGallery(form, gallery) {
  form.elements.gallery.value = JSON.stringify(gallery.slice(0, 12));
  renderVehicleGalleryEditor(form);
}

async function uploadVehicleImage(file) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(file.type)) throw new Error('Разрешены только JPG, PNG и WebP');
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('Размер изображения должен быть не больше 5 МБ');
  const response = await fetch('/api/control/uploads/vehicle-image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': file.type, 'X-CSRF-Token': state.csrfToken },
    credentials: 'same-origin',
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace('/control/login.html');
    throw new Error('Сессия завершена');
  }
  if (!response.ok) throw new Error(data.message || 'Не удалось загрузить изображение');
  return data.path;
}

function slugifyVehicleName(value) {
  const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  return String(value || '').toLowerCase().split('').map((char) => map[char] ?? char).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 120);
}

function bindVehicleEditor() {
  const form = document.querySelector('#vehicle-form');
  if (!form) return;

  const nameInput = form.elements.name;
  const slugInput = form.elements.slug;
  let slugTouched = Boolean(form.dataset.vehicleId && slugInput.value);
  slugInput.addEventListener('input', () => { slugTouched = true; });
  nameInput.addEventListener('input', () => {
    if (!slugTouched || !slugInput.value.trim()) slugInput.value = slugifyVehicleName(nameInput.value);
  });
  if (!form.dataset.vehicleId && !slugInput.value) slugInput.value = slugifyVehicleName(nameInput.value);

  const bodyTypePreset = form.elements.bodyTypePreset;
  const bodyTypeOtherField = form.querySelector('[data-body-type-other]');
  const bodyTypeOtherInput = form.elements.bodyTypeOther;
  const syncBodyType = () => {
    const preset = bodyTypePreset.value;
    const isOther = preset === 'OTHER';
    bodyTypeOtherField.hidden = !isOther;
    bodyTypeOtherInput.required = isOther;
    form.elements.bodyType.value = isOther ? bodyTypeOtherInput.value.trim() : preset;
  };
  bodyTypePreset.addEventListener('change', syncBodyType);
  bodyTypeOtherInput.addEventListener('input', syncBodyType);
  syncBodyType();

  const partnerFields = form.querySelector('[data-partner-fields]');
  const syncOwnership = (value) => {
    form.elements.ownershipType.value = value;
    form.querySelectorAll('[data-ownership-choice]').forEach((button) => button.classList.toggle('is-active', button.dataset.ownershipChoice === value));
    partnerFields.hidden = value !== 'PARTNER';
    for (const name of ['partnerName', 'partnerPhone']) form.elements[name].required = value === 'PARTNER';
  };
  form.querySelectorAll('[data-ownership-choice]').forEach((button) => button.addEventListener('click', () => syncOwnership(button.dataset.ownershipChoice)));
  syncOwnership(form.elements.ownershipType.value);

  renderVehicleGalleryEditor(form);
  form.querySelector('[data-vehicle-gallery-editor]')?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-gallery-image]');
    if (removeButton) {
      const index = Number(removeButton.dataset.removeGalleryImage);
      const gallery = readVehicleGallery(form);
      if (Number.isInteger(index) && index >= 0 && index < gallery.length) {
        gallery.splice(index, 1);
        writeVehicleGallery(form, gallery);
      }
      return;
    }
    const mainButton = event.target.closest('[data-main-gallery-image]');
    if (mainButton && !mainButton.disabled) {
      const index = Number(mainButton.dataset.mainGalleryImage);
      const gallery = readVehicleGallery(form);
      if (Number.isInteger(index) && index > 0 && index < gallery.length) {
        const [selected] = gallery.splice(index, 1);
        gallery.unshift(selected);
        writeVehicleGallery(form, gallery);
      }
    }
  });

  const button = form.querySelector('[data-vehicle-upload="gallery"]');
  const input = form.querySelector('[data-vehicle-file="gallery"]');
  button?.addEventListener('click', () => input.click());
  input?.addEventListener('change', async () => {
    const files = [...input.files];
    if (!files.length) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = `Загружаем ${files.length} фото…`;
    try {
      const current = readVehicleGallery(form);
      if (current.length + files.length > 12) throw new Error('В галерее может быть максимум 12 фотографий');
      const uploaded = [];
      for (const file of files) {
        const imagePath = await uploadVehicleImage(file);
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        uploaded.push({ image: imagePath, alt });
      }
      writeVehicleGallery(form, [...current, ...uploaded]);
      toast(`Загружено фото: ${uploaded.length}`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      input.value = '';
      button.disabled = false;
      button.innerHTML = original;
    }
  });
}

async function openVehicleForm(vehicle = null) {
  const isEdit = Boolean(vehicle?.id);
  openModal(isEdit ? vehicle.name : 'Добавить машину', vehicleFormMarkup(vehicle), `<button class="control-button" type="button" data-close-modal>Отмена</button><button class="control-button control-button--primary" type="submit" form="vehicle-form">${isEdit ? 'Сохранить' : 'Добавить машину'}</button>`, true);
  document.querySelector('#vehicle-form')?.addEventListener('submit', submitVehicleForm);
  bindVehicleEditor();
}

async function submitVehicleForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = document.querySelector('[form="vehicle-form"]');
  button.disabled = true;
  try {
    const body = formValues(form);
    body.images = readVehicleGallery(form);
    delete body.gallery;
    delete body.bodyTypePreset;
    delete body.bodyTypeOther;
    const id = form.dataset.vehicleId;
    await api(id ? `/vehicles/${id}` : '/vehicles', { method: id ? 'PATCH' : 'POST', body });
    closeModal();
    toast(id ? 'Машина сохранена' : 'Машина добавлена');
    await renderCurrentRoute();
  } catch (error) {
    formError(form, error.message);
  } finally { button.disabled = false; }
}

async function showVehicle(id) {
  const { vehicle } = await api(`/vehicles/${id}`);
  const partner = vehicle.ownershipType === 'PARTNER' && vehicle.carrier
    ? `<div class="detail-item"><span>Принадлежность</span><strong>Партнёрская</strong></div><div class="detail-item"><span>Партнёр</span><strong>${escapeHtml(vehicle.carrier.name)}</strong></div>`
    : `<div class="detail-item"><span>Принадлежность</span><strong>Собственная</strong></div>`;
  openModal(vehicle.name, `<div class="vehicle-detail"><div class="vehicle-detail__hero">${vehicle.previewImage ? `<img src="${attr(vehicle.previewImage)}" alt="">` : '<i class="ti ti-truck"></i>'}<div><span>${vehicleStatusBadge(vehicle.status)}</span><h3>${escapeHtml(vehicle.name)}</h3><p>${escapeHtml(vehicle.shortDescription || 'Описание не заполнено')}</p></div></div><div class="detail-grid">${partner}<div class="detail-item"><span>Slug</span><strong>${escapeHtml(vehicle.slug)}</strong></div><div class="detail-item"><span>На сайте</span><strong>${vehicle.published ? 'Да' : 'Нет'}</strong></div><div class="detail-item"><span>Грузоподъёмность</span><strong>${formatCapacity(vehicle.capacityKg)}</strong></div><div class="detail-item"><span>Объём</span><strong>${vehicle.volumeM3 ? `${String(vehicle.volumeM3).replace('.', ',')} м³` : '—'}</strong></div><div class="detail-item"><span>Размер кузова</span><strong>${formatMeters(vehicle.bodyLengthM)} × ${formatMeters(vehicle.bodyWidthM)} × ${formatMeters(vehicle.bodyHeightM)}</strong></div><div class="detail-item"><span>Тип кузова</span><strong>${escapeHtml(vehicle.bodyType || '—')}</strong></div><div class="detail-item"><span>Погрузка</span><strong>${escapeHtml(vehicle.loadingType || '—')}</strong></div><div class="detail-item"><span>Зона работы</span><strong>${escapeHtml(vehicle.serviceArea || '—')}</strong></div><div class="detail-item"><span>Заявок в истории</span><strong>${vehicle._count?.orders || 0}</strong></div></div>${vehicle.images.length ? `<div class="vehicle-gallery-admin">${vehicle.images.map((image) => `<img src="${attr(image.image)}" alt="${attr(image.alt || '')}">`).join('')}</div>` : ''}</div><div class="modal-actions"><button class="control-button" data-edit-vehicle="${vehicle.id}"><i class="ti ti-edit"></i> Редактировать</button><button class="control-button control-button--danger" data-delete-vehicle="${vehicle.id}"><i class="ti ti-trash"></i> Удалить</button></div>`, '<button class="control-button" type="button" data-close-modal>Закрыть</button>', true);
}

function taskCard(task) {
  return `<article class="task-row${task.status === 'DONE' ? ' is-done' : ''}"><input class="task-row__check" type="checkbox" data-task-done="${task.id}" aria-label="${task.status === 'DONE' ? 'Вернуть задачу' : 'Выполнить задачу'}"${task.status === 'DONE' ? ' checked' : ''}><span class="task-row__content"><b>${escapeHtml(task.title)}</b><small>${escapeHtml(task.description || '')}</small></span>${badge(labels.taskPriority[task.priority], task.priority === 'HIGH' ? 'orange' : '')}<span class="task-row__date">${task.dueAt ? dateTime(task.dueAt) : 'Без срока'}</span><button class="icon-button icon-button--danger" type="button" data-delete-task="${task.id}" aria-label="Удалить задачу"><i class="ti ti-trash"></i></button></article>`;
}

async function renderTasks() {
  const { tasks } = await api('/tasks');
  const list = `<section class="panel"><div class="task-list">${tasks.length ? tasks.map(taskCard).join('') : emptyState('circle-check', 'Задач пока нет')}</div></section>`;
  const columns = [['TODO', 'Нужно сделать'], ['IN_PROGRESS', 'В процессе'], ['DONE', 'Выполнено']];
  const board = `<section class="board board--tasks">${columns.map(([status, title]) => {
    const rows = tasks.filter((task) => task.status === status);
    return `<div class="board-column"><header class="board-column__header"><h3>${title}</h3><span>${rows.length}</span></header><div class="board-column__body">${rows.length ? rows.map((task) => `<article class="board-card"><span class="board-card__top">${badge(labels.taskPriority[task.priority], task.priority === 'HIGH' ? 'orange' : '')}<small>${task.dueAt ? shortDate(task.dueAt) : 'Без срока'}</small></span><b>${escapeHtml(task.title)}</b><p>${escapeHtml(task.description || '')}</p><span class="board-card__foot"><button class="text-link" type="button" data-task-status="${status === 'TODO' ? 'IN_PROGRESS' : status === 'IN_PROGRESS' ? 'DONE' : 'TODO'}" data-task-id="${task.id}">${status === 'TODO' ? 'Начать' : status === 'IN_PROGRESS' ? 'Завершить' : 'Вернуть'}</button><button class="icon-button icon-button--danger" type="button" data-delete-task="${task.id}" aria-label="Удалить"><i class="ti ti-trash"></i></button></span></article>`).join('') : '<div class="board-empty">Пусто</div>'}</div></div>`;
  }).join('')}</section>`;
  const actions = `<div class="view-toggle"><button type="button" data-task-view="list" class="${state.taskView === 'list' ? 'is-active' : ''}" aria-label="Список"><i class="ti ti-list"></i></button><button type="button" data-task-view="board" class="${state.taskView === 'board' ? 'is-active' : ''}" aria-label="Доска"><i class="ti ti-layout-kanban"></i></button></div><button class="control-button control-button--primary" data-action="new-task"><i class="ti ti-plus"></i><span>Новая задача</span></button>`;
  app.innerHTML = `<div class="page">${pageHeader('Задачи', 'Звонки, обслуживание и внутренние дела', actions)}<div id="tasks-content">${state.taskView === 'board' ? board : list}</div></div>`;
}

function openTaskForm() {
  openModal('Новая задача', `<form id="task-form" class="form-grid"><label class="control-field field--wide"><span class="control-field__label">Название *</span><input class="control-input" name="title" required maxlength="240" placeholder="Что нужно сделать"></label><label class="control-field"><span class="control-field__label">Приоритет</span><select class="control-select" name="priority"><option value="LOW">Низкий</option><option value="MEDIUM" selected>Обычный</option><option value="HIGH">Высокий</option></select></label><label class="control-field"><span class="control-field__label">Срок</span><input class="control-input" name="dueAt" type="datetime-local"></label><label class="control-field field--wide"><span class="control-field__label">Описание</span><textarea class="control-textarea" name="description" maxlength="2000"></textarea></label><div class="form-error field--wide" hidden></div></form>`, '<button class="control-button" type="button" data-close-modal>Отмена</button><button class="control-button control-button--primary" type="submit" form="task-form">Создать</button>');
  document.querySelector('#task-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formValues(form);
    if (body.dueAt) body.dueAt = new Date(body.dueAt).toISOString();
    try {
      await api('/tasks', { method: 'POST', body });
      closeModal();
      toast('Задача создана');
      await renderTasks();
    } catch (error) { formError(form, error.message); }
  });
}

async function renderFinances() {
  const range = monthRange();
  const query = isoRangeQuery(range);
  const [summary, expenseData] = await Promise.all([api(`/finances/summary?${query}`), api(`/finances/expenses?${query}`)]);
  app.innerHTML = `<div class="page">${pageHeader('Финансы', 'Доходы и расходы за текущий месяц', '<button class="control-button control-button--primary" data-action="new-expense"><i class="ti ti-plus"></i><span>Добавить расход</span></button>')}
    <section class="finance-grid"><article class="finance-card finance-card--accent"><span>Выручка</span><strong>${money(summary.stats.revenueCents)}</strong></article><article class="finance-card"><span>Оплачено</span><strong>${money(summary.stats.paidCents)}</strong></article><article class="finance-card finance-card--danger"><span>Расходы</span><strong>${money(summary.stats.expenseCents)}</strong></article><article class="finance-card"><span>Прибыль</span><strong>${money(summary.stats.profitCents)}</strong></article></section>
    <section class="panel"><header class="panel__header"><div><h2>Расходы</h2><p>${summary.stats.orderCount} выполненных заявок · средний чек ${money(summary.stats.averageCheckCents)} · долг ${money(summary.stats.debtCents)}</p></div><button class="text-link" type="button" data-action="export-csv">Выгрузить CSV</button></header><div class="expense-list">${expenseData.expenses.length ? expenseData.expenses.map((expense) => `<article class="expense-row"><span>${shortDate(expense.occurredAt)}</span><span>${escapeHtml(labels.expenseCategory[expense.category])}<small>${escapeHtml(expense.note || '')}</small></span><strong>${money(expense.amountCents)}</strong><button class="icon-button icon-button--danger" type="button" data-delete-expense="${expense.id}" aria-label="Удалить расход"><i class="ti ti-trash"></i></button></article>`).join('') : emptyState('receipt', 'Расходов за месяц нет')}</div></section>
  </div>`;
}

function openExpenseForm() {
  const now = datetimeLocal(new Date());
  openModal('Новый расход', `<form id="expense-form" class="form-grid"><label class="control-field"><span class="control-field__label">Сумма, ₽ *</span><input class="control-input" name="amount" type="number" min="0.01" step="0.01" required></label><label class="control-field"><span class="control-field__label">Категория</span><select class="control-select" name="category">${Object.entries(labels.expenseCategory).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label class="control-field field--wide"><span class="control-field__label">Дата и время</span><input class="control-input" name="occurredAt" type="datetime-local" value="${now}"></label><label class="control-field field--wide"><span class="control-field__label">Комментарий</span><textarea class="control-textarea" name="note" maxlength="1000"></textarea></label><div class="form-error field--wide" hidden></div></form>`, '<button class="control-button" type="button" data-close-modal>Отмена</button><button class="control-button control-button--primary" type="submit" form="expense-form">Добавить</button>');
  document.querySelector('#expense-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formValues(form);
    if (body.occurredAt) body.occurredAt = new Date(body.occurredAt).toISOString();
    try {
      await api('/finances/expenses', { method: 'POST', body });
      closeModal();
      toast('Расход добавлен');
      await renderFinances();
    } catch (error) { formError(form, error.message); }
  });
}

// Native Web Push: subscription is always activated by a direct user click.
const pushSupported = () => Boolean(window.isSecureContext &&
  ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window));

function vapidToBytes(base64Url) {
  const encoded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function pushRegistration() {
  return navigator.serviceWorker.register('/control/push-sw.js', { scope: '/control/' });
}

async function pushSubscription() {
  if (!pushSupported()) return null;
  const registration = await pushRegistration();
  return registration.pushManager.getSubscription();
}

async function enablePush() {
  if (!pushSupported()) throw new Error('Уведомления не поддерживаются этим браузером или требуется HTTPS.');
  // Permission must be requested immediately inside a trusted click handler.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Разрешите уведомления для сайта в настройках браузера.');
  const status = await api('/push/status');
  if (!status.configured || !status.publicKey) throw new Error('Добавьте VAPID-ключи на сервере.');
  const registration = await pushRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const existingKey = subscription.options?.applicationServerKey;
    const expected = vapidToBytes(status.publicKey);
    if (existingKey && (existingKey.byteLength !== expected.byteLength ||
      !new Uint8Array(existingKey).every((v, i) => v === expected[i]))) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidToBytes(status.publicKey)
    });
  }
  await api('/push/subscribe', { method: 'POST', body: subscription.toJSON() });
}

async function disablePush() {
  const subscription = await pushSubscription();
  if (subscription) {
    await api('/push/subscribe', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  }
}

async function renderSettings() {
  const status = await api('/push/status');
  const available = pushSupported();
  let subscribed = false;
  if (available) {
    try { subscribed = Boolean(await pushSubscription()); } catch { subscribed = false; }
  }
  const blocked = available && Notification.permission === 'denied';
  const enabled = available && status.configured && !blocked;
  const explanation = !window.isSecureContext ? 'Web Push работает по HTTPS (или localhost).'
    : !available ? 'Этот браузер не поддерживает Web Push. На iPhone установите приложение на экран «Домой» через Safari (iOS 16.4+).'
    : !status.configured ? 'На сервере пока нет VAPID-ключей. Укажите их в .env и перезапустите PM2.'
    : blocked ? 'Уведомления заблокированы. Разрешите их в настройках браузера.'
    : subscribed ? 'Это устройство подписано на уведомления о новых заявках.'
    : 'Разрешите уведомления на каждом устройстве, где вы работаете с админкой.';
  app.innerHTML = `<div class="page">${pageHeader('Настройки', 'Уведомления и устройства')}
    <section class="panel push-settings"><div class="push-settings__header"><div class="push-settings__symbol"><i class="ti ti-bell"></i></div><div><span class="control-eyebrow">Новые заявки</span><h2>Web Push уведомления</h2><p>${escapeHtml(explanation)}</p></div></div>
    <div class="push-settings__meta">${badge(status.configured ? 'Сервер настроен' : 'Сервер не настроен', status.configured ? 'green' : 'orange')}${badge(subscribed ? 'Устройство подключено' : 'Устройство не подключено', subscribed ? 'green' : 'orange')}<span>Ваших подписок: ${Number(status.subscriptions) || 0}</span></div>
    <div class="push-settings__actions"><button type="button" class="control-button control-button--primary" data-action="push-enable" ${(!enabled || subscribed) ? 'disabled' : ''}><i class="ti ti-bell-ringing"></i> Включить</button><button type="button" class="control-button" data-action="push-test" ${(!enabled || !subscribed) ? 'disabled' : ''}>Проверить</button><button type="button" class="control-button" data-action="push-disable" ${(!enabled || !subscribed) ? 'disabled' : ''}>Отключить на этом устройстве</button></div>
    <p class="push-settings__note">Push приходит при новой заявке с сайта. Нажатие открывает соответствующую заявку в CRM. Для iPhone: «Поделиться» → «На экран Домой» → запустить приложение и включить здесь.</p>
    </section></div>`;
}

function renderMore() {
  app.innerHTML = `<div class="page">${pageHeader('Ещё', 'Дополнительные разделы')}<section class="more-grid"><a class="more-link" href="#/fleet"><i class="ti ti-truck"></i><span><b>Автопарк</b><small>Машины и публикация</small></span></a><a class="more-link" href="#/tasks"><i class="ti ti-checklist"></i><span><b>Задачи</b><small>Дела и напоминания</small></span></a><a class="more-link" href="#/finances"><i class="ti ti-wallet"></i><span><b>Финансы</b><small>Доходы и расходы</small></span></a><a class="more-link" href="#/settings"><i class="ti ti-bell"></i><span><b>Уведомления</b><small>Включить Web Push</small></span></a><button class="more-link" data-action="logout"><i class="ti ti-logout"></i><span><b>Выйти</b><small>Завершить сессию</small></span></button></section></div>`;
}

function currentRoute() {
  return window.location.hash.replace(/^#\//, '').split('/')[0].split('?')[0] || 'dashboard';
}

async function renderCurrentRoute() {
  const route = currentRoute();
  setActiveNav(route);
  app.setAttribute('aria-busy', 'true');
  try {
    if (route === 'dashboard') await renderDashboard();
    else if (route === 'requests') {
      await renderRequests();
      const orderId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('order');
      if (orderId && /^[1-9]\d{0,9}$/.test(orderId)) {
        try { await showRequest(Number(orderId)); } catch (error) { toast(error.message, 'error'); }
      }
    }
    else if (route === 'clients') await renderClients();
    else if (route === 'fleet') await renderFleet();
    else if (route === 'tasks') await renderTasks();
    else if (route === 'finances') await renderFinances();
    else if (route === 'settings') await renderSettings();
    else if (route === 'more') renderMore();
    else window.location.hash = '#/dashboard';
  } catch (error) {
    app.innerHTML = `<div class="page">${pageHeader('Не удалось загрузить раздел', error.message)}${emptyState('alert-triangle', 'Повтори попытку', 'Если ошибка останется, проверь консоль сервера.')}</div>`;
  } finally {
    app.removeAttribute('aria-busy');
    app.focus({ preventScroll: true });
  }
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); }
  finally { window.location.replace('/control/login.html'); }
}

document.addEventListener('click', async (event) => {
  const close = event.target.closest('[data-close-modal]');
  if (close && modalRoot.contains(close)) { closeModal(); return; }
  if (event.target.matches('[data-modal-backdrop]')) { closeModal(); return; }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'new-request') { await openRequestForm(); return; }
  if (action === 'new-vehicle') { await openVehicleForm(); return; }
  if (action === 'new-task') { openTaskForm(); return; }
  if (action === 'new-expense') { openExpenseForm(); return; }
  if (['push-enable', 'push-disable', 'push-test'].includes(action)) {
    const button = event.target.closest('[data-action]');
    if (button?.disabled) return;
    button.disabled = true;
    try {
      if (action === 'push-enable') { await enablePush(); toast('Уведомления включены на этом устройстве'); }
      else if (action === 'push-disable') { await disablePush(); toast('Уведомления отключены на этом устройстве'); }
      else { const result = await api('/push/test', { method: 'POST', body: {} }); toast(`Тест отправлен: ${result.sent} устройствам`); }
      await renderSettings();
    } catch (error) { toast(error.message, 'error'); button.disabled = false; }
    return;
  }
  if (action === 'logout') { await logout(); return; }
  if (action === 'export-csv') {
    const range = monthRange();
    window.location.assign(`/api/control/finances/export.csv?${isoRangeQuery(range)}`);
    return;
  }

  const requestView = event.target.closest('[data-request-view]');
  if (requestView) {
    state.requestView = requestView.dataset.requestView;
    localStorage.setItem('sg-request-view', state.requestView);
    document.querySelectorAll('[data-request-view]').forEach((button) => button.classList.toggle('is-active', button === requestView));
    await loadRequests();
    return;
  }

  const taskView = event.target.closest('[data-task-view]');
  if (taskView) {
    state.taskView = taskView.dataset.taskView;
    localStorage.setItem('sg-task-view', state.taskView);
    await renderTasks();
    return;
  }

  const statusButton = event.target.closest('[data-request-status]');
  if (statusButton) {
    try {
      await api(`/orders/${statusButton.dataset.requestId}`, { method: 'PATCH', body: { status: statusButton.dataset.requestStatus } });
      closeModal();
      toast('Статус заявки изменён');
      await renderCurrentRoute();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }

  const editRequest = event.target.closest('[data-edit-request]');
  if (editRequest) {
    const { order } = await api(`/orders/${editRequest.dataset.editRequest}`);
    await openRequestForm(order);
    return;
  }

  const deleteRequest = event.target.closest('[data-delete-request]');
  if (deleteRequest) {
    if (!window.confirm('Удалить заявку без возможности восстановления?')) return;
    try {
      await api(`/orders/${deleteRequest.dataset.deleteRequest}`, { method: 'DELETE' });
      closeModal();
      toast('Заявка удалена');
      await renderCurrentRoute();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }

  const deleteClient = event.target.closest('[data-delete-client]');
  if (deleteClient) {
    if (!window.confirm('Удалить клиента из списка? История его заявок сохранится.')) return;
    try {
      await api(`/clients/${deleteClient.dataset.deleteClient}`, { method: 'DELETE' });
      closeModal();
      toast('Клиент удалён');
      await renderClients();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }

  const editVehicle = event.target.closest('[data-edit-vehicle]');
  if (editVehicle) {
    const { vehicle } = await api(`/vehicles/${editVehicle.dataset.editVehicle}`);
    await openVehicleForm(vehicle);
    return;
  }

  const deleteVehicle = event.target.closest('[data-delete-vehicle]');
  if (deleteVehicle) {
    if (!window.confirm('Удалить машину? Если по ней уже есть заявки, машина будет безопасно скрыта, а история сохранится.')) return;
    try {
      const data = await api(`/vehicles/${deleteVehicle.dataset.deleteVehicle}`, { method: 'DELETE' });
      closeModal();
      toast(data.archived ? 'Машина скрыта, история сохранена' : 'Машина удалена');
      await renderFleet();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }


  const taskDone = event.target.closest('[data-task-done]');
  if (taskDone) {
    try {
      await api(`/tasks/${taskDone.dataset.taskDone}`, { method: 'PATCH', body: { status: taskDone.checked ? 'DONE' : 'TODO' } });
      await renderCurrentRoute();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }

  const taskStatus = event.target.closest('[data-task-status]');
  if (taskStatus) {
    try {
      await api(`/tasks/${taskStatus.dataset.taskId}`, { method: 'PATCH', body: { status: taskStatus.dataset.taskStatus } });
      await renderTasks();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }

  const deleteTask = event.target.closest('[data-delete-task]');
  if (deleteTask) {
    if (!window.confirm('Удалить задачу?')) return;
    try {
      await api(`/tasks/${deleteTask.dataset.deleteTask}`, { method: 'DELETE' });
      toast('Задача удалена');
      await renderTasks();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }

  const deleteExpense = event.target.closest('[data-delete-expense]');
  if (deleteExpense) {
    event.stopPropagation();
    if (!window.confirm('Удалить расход?')) return;
    try {
      await api(`/finances/expenses/${deleteExpense.dataset.deleteExpense}`, { method: 'DELETE' });
      toast('Расход удалён');
      await renderFinances();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }

  const requestElement = event.target.closest('.request-row[data-request-id], .board-card[data-request-id], .compact-card[data-request-id]');
  if (requestElement) { await showRequest(requestElement.dataset.requestId); return; }

  const clientElement = event.target.closest('.client-row[data-client-id]');
  if (clientElement) { await showClient(clientElement.dataset.clientId); return; }

  const vehicleElement = event.target.closest('.fleet-admin-card[data-vehicle-id], .fleet-mini[data-vehicle-id]');
  if (vehicleElement) { await showVehicle(vehicleElement.dataset.vehicleId); return; }

  const dashboardTask = event.target.closest('[data-task-id]');
  if (dashboardTask) { window.location.hash = '#/tasks'; }
});

document.addEventListener('keydown', (event) => {
  const modal = modalRoot.querySelector('.modal');
  if (event.key === 'Escape' && modal) {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key === 'Tab' && modal) {
    const focusable = modalFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!modal.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }

  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.request-row[data-request-id], .board-card[data-request-id], .compact-card[data-request-id], .client-row[data-client-id], .fleet-admin-card[data-vehicle-id], .fleet-mini[data-vehicle-id]')) {
    event.preventDefault();
    event.target.click();
  }
});

let idleTimer = null;
let lastKeepAliveAt = 0;

function armIdleTimer() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    window.location.replace('/control/login.html?reason=idle');
  }, state.idleMinutes * 60 * 1000);
}

function registerAdminActivity() {
  armIdleTimer();
  const now = Date.now();
  if (now - lastKeepAliveAt < 60 * 1000 || !state.csrfToken) return;
  lastKeepAliveAt = now;
  api('/auth/me').catch(() => {});
}

for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'input']) {
  document.addEventListener(eventName, registerAdminActivity, { passive: true });
}

window.addEventListener('hashchange', renderCurrentRoute);

(async function boot() {
  try {
    const data = await api('/auth/me');
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    state.idleMinutes = Number(data.idleMinutes) || 15;
    armIdleTimer();
    document.querySelector('#user-name').textContent = data.user.name;
    document.querySelector('#user-role').textContent = data.user.role;
    document.querySelector('#user-avatar').textContent = data.user.name.slice(0, 1).toUpperCase();
    await ensureVehicles();
    await renderCurrentRoute();
  } catch (error) {
    if (!error.message.includes('Сессия')) toast(error.message, 'error');
  }
})();
