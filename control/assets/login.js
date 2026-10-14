'use strict';

const form = document.querySelector('#login-form');
const errorBox = document.querySelector('#login-error');
const passwordInput = document.querySelector('#login-password');
const togglePassword = document.querySelector('[data-toggle-password]');

togglePassword?.addEventListener('click', () => {
  const visible = passwordInput.type === 'text';
  passwordInput.type = visible ? 'password' : 'text';
  togglePassword.setAttribute('aria-label', visible ? 'Показать пароль' : 'Скрыть пароль');
  togglePassword.querySelector('i')?.classList.toggle('ti-eye', visible);
  togglePassword.querySelector('i')?.classList.toggle('ti-eye-off', !visible);
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  if (!form.reportValidity()) return;

  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('span');
  const original = label?.textContent || 'Войти в платформу';
  button.disabled = true;
  if (label) label.textContent = 'Проверяем данные…';

  try {
    const response = await fetch('/api/control/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Не удалось войти');
    const requestedOrder = new URLSearchParams(window.location.search).get('openOrder');
    const safeOrder = requestedOrder && /^[1-9]\d{0,9}$/.test(requestedOrder) ? requestedOrder : null;
    window.location.replace(safeOrder
      ? `/control/app.html?openOrder=${safeOrder}#/requests?order=${safeOrder}`
      : '/control/app.html#/dashboard');
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    if (label) label.textContent = original;
  }
});
