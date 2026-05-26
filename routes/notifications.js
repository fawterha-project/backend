import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireExternalApiKey } from "../middleware/externalApiKey.js";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../services/notificationsService.js";

const router = express.Router();

// ────────────────────────────────────────────────────────────
// User-facing routes (require JWT)
// ────────────────────────────────────────────────────────────

// GET /notifications
router.get("/", authMiddleware, async (req, res) => {
  const result = await getUserNotifications(req.user.users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ notifications: result.notifications });
});

// GET /notifications/unread-count
router.get("/unread-count", authMiddleware, async (req, res) => {
  const result = await getUnreadCount(req.user.users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ unread: result.unread });
});

// PATCH /notifications/read-all
router.patch("/read-all", authMiddleware, async (req, res) => {
  const result = await markAllAsRead(req.user.users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ message: "All notifications marked as read" });
});

// PATCH /notifications/:id/read
router.patch("/:id/read", authMiddleware, async (req, res) => {
  const result = await markAsRead(req.params.id, req.user.users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({
    message: "Notification marked as read",
    notification: result.notification,
  });
});

// DELETE /notifications/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  const result = await deleteNotification(req.params.id, req.user.users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ message: "Notification deleted successfully" });
});

// ────────────────────────────────────────────────────────────
// Admin / cron endpoints (require X-API-Key header)
// pg_cron uses the SQL functions directly, so these HTTP routes
// are only for manual testing or external schedulers.
// ────────────────────────────────────────────────────────────

router.post("/run-due", requireExternalApiKey, async (req, res) => {
  const { runDueNotifications } =
    await import("../services/notificationsService.js");
  const result = await runDueNotifications();
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ dispatched: result.dispatched });
});

router.post("/run-monthly-reports", requireExternalApiKey, async (req, res) => {
  const { runMonthlyReportReminders } =
    await import("../services/notificationsService.js");
  const result = await runMonthlyReportReminders();
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

export default router;
