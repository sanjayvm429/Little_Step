import { Notification, NotificationType } from '../models/Notification.js';
import { config } from '../config/index.js';

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Creates an in-app notification. Designed so email/SMS/push providers
 * can be plugged in later via NOTIFICATION_PROVIDER env var.
 */
export async function notify(input: NotifyInput) {
  const notification = await Notification.create({
    user: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data,
  });

  if (config.notificationProvider === 'console') {
    console.log(`[notify] user=${input.userId} type=${input.type} title="${input.title}"`);
  }
  // Future: if provider is 'sendgrid'/'twilio'/'fcm', dispatch external message here.

  return notification;
}

export async function notifyMany(inputs: NotifyInput[]) {
  return Promise.all(inputs.map(notify));
}
