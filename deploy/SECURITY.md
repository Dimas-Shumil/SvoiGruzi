# Production hardening — СВОИ ГРУЗЫ

Приложение рассчитано на схему:

Internet → 80/443 Nginx → 127.0.0.1:3000 Node.js

Node.js не должен слушать публичный интерфейс. `HOST` в production оставляем `127.0.0.1`.

## UFW

Перед включением UFW сначала убедитесь, какой SSH-порт используется, чтобы не потерять доступ к VPS.

Для стандартного SSH 22:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

Снаружи должны быть доступны только SSH и Nginx (80/443). Порт 3000 не открывать.

Проверка слушающих портов:

```bash
sudo ss -lntup
```

Ожидаемо Node.js:

```text
127.0.0.1:3000
```

а не `0.0.0.0:3000`.

## Production .env

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://YOUR_DOMAIN
TRUST_PROXY=1
```

`SESSION_SECRET`, `SMTP_PASS` и остальные секреты хранятся только в `.env`. `.env` не коммитить.

## SSH (этап деплоя)

После проверки входа по SSH-ключу рекомендуется отключить password authentication и прямой root login, затем включить fail2ban. Эти настройки выполняются на VPS, не в кодовой базе.


## Загрузка изображений автопарка

Загрузка доступна только авторизованному владельцу через `/api/control/uploads/vehicle-image`. Сервер принимает только JPG, PNG и WebP до 5 МБ, проверяет сигнатуру файла и сам генерирует имя. SVG, HTML и произвольные пути не принимаются. Для этого endpoint в Nginx разрешён body до 6 МБ; для остальных запросов остаётся лимит 1 МБ, а JSON в Express ограничен 64 КБ.
