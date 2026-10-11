const nodemailer = require("nodemailer");
const { env } = require("../config/env");

const smtpConfigured = Boolean(
  env.smtpHost &&
  env.smtpPort &&
  env.smtpUser &&
  env.smtpPass &&
  env.toEmail
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: {
        minVersion: "TLSv1.2",
        servername: env.smtpHost
      }
    })
  : null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function yesNo(value) {
  if (value === true) return "Да";
  if (value === false) return "Нет";
  return "Уточнить при звонке";
}


function formatDate(value) {
  if (!value) return "Уточнить при звонке";

  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "long",
      timeZone: "Asia/Krasnoyarsk"
    }).format(new Date(value));
  } catch {
    return "Уточнить при звонке";
  }
}

async function verifyMailConnection() {
  if (!transporter) {
    console.log("SMTP не настроен — email-уведомления отключены");
    return false;
  }

  try {
    await transporter.verify();
    console.log("SMTP готов к отправке писем");
    return true;
  } catch (error) {
    console.error("SMTP недоступен:", error.message);
    return false;
  }
}

async function sendMail({ subject, text, html }) {
  if (!transporter) return { skipped: true };

  return transporter.sendMail({
    from: `"СВОИ ГРУЗЫ" <${env.smtpUser}>`,
    to: env.toEmail,
    subject,
    text,
    html
  });
}

function detailRow(label, value, { accent = false } = {}) {
  return `
    <tr>
      <td style="padding:13px 0;border-bottom:1px solid #e8e6df;color:#858984;font-size:12px;line-height:1.45;vertical-align:top;width:38%;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:13px 0 13px 18px;border-bottom:1px solid #e8e6df;color:${accent ? "#111719" : "#2a3031"};font-size:14px;line-height:1.45;font-weight:${accent ? "800" : "650"};vertical-align:top;">
        ${escapeHtml(value)}
      </td>
    </tr>`;
}

async function sendNewRequestNotification(order) {
  const client = order.client || {};
  const vehicle = order.vehicleRecord || {};

  const name = client.name || "Не указано";
  const phone = client.phone || "Не указан";
  const normalizedPhone = client.phoneNormalized || "";
  const vehicleName = vehicle.name || order.vehicle || "Подобрать машину";

  const text = [
    "СВОИ ГРУЗЫ — новая заявка с сайта",
    "",
    `Имя: ${name}`,
    `Телефон: ${phone}`,
    `Откуда: ${order.pickupAddress || "Не указано"}`,
    `Куда: ${order.destinationAddress || "Не указано"}`,
    `Груз: ${order.cargoType || "Уточнить при звонке"}`,
    `Грузчики: ${yesNo(order.loadersRequired)}`,
    `Дата: ${formatDate(order.scheduledAt)}`,
    `Машина: ${vehicleName}`,
    "Источник: Сайт"
  ].join("\n");

  const phoneButton = normalizedPhone
    ? `<a href="tel:${escapeHtml(normalizedPhone)}" style="display:inline-block;background:#ffffff;color:#111719;text-decoration:none;font-size:13px;font-weight:800;line-height:1;padding:14px 18px;border-radius:7px;">Позвонить клиенту</a>`
    : "";

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#eceae4;font-family:Arial,Helvetica,sans-serif;color:#111719;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eceae4;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#fbfaf6;border-radius:12px;overflow:hidden;border:1px solid #dedbd2;">
            <tr>
              <td style="padding:28px 30px;background:#111719;color:#ffffff;">
                <div style="font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#b9bfbd;margin-bottom:12px;">СВОИ ГРУЗЫ</div>
                <div style="font-size:28px;font-weight:800;line-height:1.1;letter-spacing:-0.7px;">Новая заявка с сайта</div>
                <div style="margin-top:10px;font-size:13px;line-height:1.55;color:#c9cecc;">Клиент оставил данные для расчёта перевозки.</div>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 30px 8px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:#7d827f;margin-bottom:8px;">Контакт</div>
                <div style="font-size:23px;font-weight:800;line-height:1.25;color:#111719;">${escapeHtml(name)}</div>
                <div style="margin-top:6px;font-size:17px;font-weight:700;line-height:1.4;color:#373d3e;">${escapeHtml(phone)}</div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 30px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                  ${detailRow("Откуда", order.pickupAddress || "Не указано", { accent: true })}
                  ${detailRow("Куда", order.destinationAddress || "Не указано", { accent: true })}
                  ${detailRow("Что перевозим", order.cargoType || "Уточнить при звонке")}
                  ${detailRow("Нужны грузчики", yesNo(order.loadersRequired))}
                  ${detailRow("Дата перевозки", formatDate(order.scheduledAt))}
                  ${detailRow("Машина", vehicleName)}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 30px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#111719;border-radius:9px;">
                  <tr>
                    <td style="padding:20px;">
                      <div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#949b98;margin-bottom:8px;">Следующий шаг</div>
                      <div style="font-size:14px;font-weight:700;line-height:1.5;color:#ffffff;margin-bottom:16px;">Свяжитесь с клиентом, уточните детали и согласуйте стоимость.</div>
                      ${phoneButton}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 30px 20px;border-top:1px solid #e8e6df;color:#8b8f8c;font-size:11px;line-height:1.55;">
                Источник: сайт «СВОИ ГРУЗЫ». Служебный номер заявки клиенту и в письме не показывается.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendMail({
    subject: "Новая заявка с сайта — СВОИ ГРУЗЫ",
    text,
    html
  });
}

module.exports = {
  smtpConfigured,
  verifyMailConnection,
  sendMail,
  sendNewRequestNotification
};
