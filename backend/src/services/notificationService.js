const axios = require("axios");
const SocNotification = require("../models/SocNotification");
const logger = require("../utils/logger");
const { emitSocEvent } = require("./socketService");

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const createNotification = async ({ incident, channel, recipient, subject, body }) =>
  SocNotification.create({
    incidentId: incident?._id,
    channel,
    recipient,
    subject,
    body,
    status: "QUEUED"
  });

const markSent = async (notification, providerResponse = {}) =>
  SocNotification.findByIdAndUpdate(
    notification._id,
    {
      $set: {
        status: "SENT",
        sentAt: new Date(),
        providerResponse
      }
    },
    { new: true }
  );

const markFailed = async (notification, error) =>
  SocNotification.findByIdAndUpdate(
    notification._id,
    {
      $set: {
        status: "FAILED",
        failedAt: new Date(),
        providerResponse: {
          message: error.message,
          code: error.code,
          statusCode: error.response?.status
        }
      }
    },
    { new: true }
  );

const postWebhook = async ({ url, payload }) => {
  const timeout = parsePositiveInteger(process.env.SOC_NOTIFICATION_TIMEOUT_MS, 3500);
  const response = await axios.post(url, payload, {
    timeout,
    headers: { "Content-Type": "application/json" }
  });
  return {
    statusCode: response.status,
    provider: new URL(url).hostname
  };
};

const sendWebhookNotification = async ({ notification, incident, url }) => {
  if (!url) {
    return notification;
  }

  try {
    const providerResponse = await postWebhook({
      url,
      payload: {
        incidentId: incident?._id,
        incidentNumber: incident?.incidentNumber,
        title: incident?.title,
        severity: incident?.severity,
        priority: incident?.priority,
        status: incident?.status,
        message: notification.body
      }
    });
    return markSent(notification, providerResponse);
  } catch (error) {
    logger.warn("SOC notification delivery failed", {
      channel: notification.channel,
      message: error.message,
      code: error.code
    });
    return markFailed(notification, error);
  }
};

const sendTelegramNotification = async ({ notification, incident }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return notification;
  }

  try {
    const timeout = parsePositiveInteger(process.env.SOC_NOTIFICATION_TIMEOUT_MS, 3500);
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: `${incident.incidentNumber} ${incident.severity} ${incident.title}`,
        disable_web_page_preview: true
      },
      { timeout }
    );
    return markSent(notification, {
      provider: "telegram",
      statusCode: response.status
    });
  } catch (error) {
    logger.warn("SOC Telegram notification delivery failed", {
      message: error.message,
      code: error.code
    });
    return markFailed(notification, error);
  }
};

const notifyIncident = async ({ incident, io, channels = ["SOCKET", "EMAIL", "WEBHOOK", "DESKTOP"] }) => {
  const subject = `[${incident.severity}] ${incident.incidentNumber} ${incident.title}`;
  const body = `${incident.incidentNumber} is ${incident.status} with ${incident.priority} priority: ${incident.title}`;
  const notifications = [];

  for (const channel of channels) {
    const notification = await createNotification({
      incident,
      channel,
      recipient:
        channel === "EMAIL"
          ? process.env.SOC_ALERT_EMAIL_TO || "soc-team"
          : channel.toLowerCase(),
      subject,
      body
    });

    if (channel === "SOCKET") {
      emitSocEvent("soc-incident", incident, io);
      notifications.push(await markSent(notification, { provider: "socket.io" }));
    } else if (channel === "WEBHOOK") {
      notifications.push(await sendWebhookNotification({ notification, incident, url: process.env.SOC_WEBHOOK_URL }));
    } else if (channel === "SLACK") {
      notifications.push(await sendWebhookNotification({ notification, incident, url: process.env.SLACK_WEBHOOK_URL }));
    } else if (channel === "TELEGRAM") {
      notifications.push(await sendTelegramNotification({ notification, incident }));
    } else if (channel === "EMAIL" && process.env.SOC_EMAIL_WEBHOOK_URL) {
      notifications.push(await sendWebhookNotification({ notification, incident, url: process.env.SOC_EMAIL_WEBHOOK_URL }));
    } else {
      notifications.push(notification);
    }
  }

  return notifications;
};

module.exports = {
  createNotification,
  notifyIncident
};
