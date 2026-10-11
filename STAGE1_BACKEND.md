# Свои грузы — Backend Stage 1

На этом этапе перенесена архитектурная база из «Эвакуатор19» и добавлена специфика «СВОИ ГРУЗЫ».

## Уже работает после установки зависимостей

- Express server;
- Prisma + SQLite;
- защищённая auth-основа для CRM;
- публичная форма главной `POST /api/requests`;
- клиенты автоматически создаются/обновляются по телефону;
- заявка сохраняется как `Order` со статусом `PLANNED`;
- собственные и партнёрские автомобили;
- `Carrier`;
- привязка заявки к выбранной машине;
- публичные `GET /api/vehicles` и `GET /api/vehicles/:slug`;
- rate-limit / Origin / Helmet / httpOnly session foundation;
- health-check `/health`;
- SMTP/Nodemailer уведомления о новых заявках.

## Локальный запуск

1. `npm install`
2. скопировать `.env.example` → `.env`
3. заменить `SESSION_SECRET` на случайную строку длиной не менее 64 символов
4. `npx prisma generate`
5. `npx prisma migrate deploy`
6. `npm run vehicles:seed`
7. `npm run owner:create`
8. `npm start`
9. открыть `http://localhost:3000`

Важно: форму с backend проверять через Express на порту 3000, не через VS Code Live Server.

## Следующий этап

Полноценный перенос UI `control` из Эвакуатор19:
- обзор;
- заявки;
- клиенты;
- задачи;
- финансы;
- автопарк CRUD;
- партнёры CRUD;
- фильтр OWN / PARTNER;
- добавление фотографий и характеристик машин;
- публикация/скрытие;
- статусы доступности.


## SMTP

Стандартная схема ShumDev:

```env
SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-mail@mail.ru
SMTP_PASS=application-password
TO_EMAIL=your-mail@mail.ru
```

Для Mail.ru в `SMTP_PASS` используется пароль приложения.

SMTP не участвует в транзакции создания заявки:
1. заявка сохраняется в SQLite;
2. клиент получает успешный ответ;
3. email отправляется как дополнительное уведомление;
4. ошибка SMTP только логируется и не удаляет заявку.

При старте:
- `SMTP готов к отправке писем` — соединение успешно;
- `SMTP не настроен — email-уведомления отключены` — переменные пустые;
- `SMTP недоступен: ...` — настройки есть, но сервер почты не ответил.
