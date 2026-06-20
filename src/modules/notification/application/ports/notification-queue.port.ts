export const NOTIFICATION_QUEUE_PORT = Symbol('NOTIFICATION_QUEUE_PORT');
export const NOTIFICATIONS_QUEUE = 'notifications';
export const DELIVER_NOTIFICATION_JOB = 'deliver';

export interface DeliverNotificationJob {
  notificationId: string;
}

/** Asynchronous delivery: the request path only enqueues; workers do the slow I/O. */
export interface NotificationQueuePort {
  enqueue(job: DeliverNotificationJob): Promise<void>;
}
