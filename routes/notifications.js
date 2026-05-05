import express from "express";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../services/notificationsService.js";

const router = express.Router();

// GET /notifications?users_id=...
router.get("/", async (req, res) => {
  const { users_id } = req.query;
  if (!users_id) {
    return res.status(400).json({ error: "users_id is required" });
  }
  const result = await getUserNotifications(users_id);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.status(200).json({ notifications: result.notifications });
});

// GET /notifications/unread-count?users_id=...
router.get("/unread-count", async (req, res) => {
  const { users_id } = req.query;
  if (!users_id) {
    return res.status(400).json({ error: "users_id is required" });
  }
  const result = await getUnreadCount(users_id);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.status(200).json({ unread: result.unread });
});

// PATCH /notifications/read-all   body: { users_id }
router.patch("/read-all", async (req, res) => {
  const { users_id } = req.body;
  if (!users_id) {
    return res.status(400).json({ error: "users_id is required" });
  }
  const result = await markAllAsRead(users_id);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.status(200).json({ message: "All notifications marked as read" });
});

// PATCH /notifications/:id/read
router.patch("/:id/read", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "notification_id is required" });
  }
  const result = await markAsRead(id);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.status(200).json({
    message: "Notification marked as read",
    notification: result.notification,
  });
});

// DELETE /notifications/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "notification_id is required" });
  }
  const result = await deleteNotification(id);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.status(200).json({ message: "Notification deleted successfully" });
});

// Cron-like endpoint — call this from pg_cron or manually to dispatch
// scheduled notifications whose time has come.
router.post("/run-due", async (req, res) => {
  const { runDueNotifications } =
    await import("../services/notificationsService.js");
  const result = await runDueNotifications();
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ dispatched: result.dispatched });
});

export default router;
