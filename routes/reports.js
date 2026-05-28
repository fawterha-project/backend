import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getSummary,
  getWeekly,
  getMonthly,
  getYearly,
} from "../services/reportsService.js";

const router = express.Router();

// All report routes require a valid JWT.
// users_id comes from the token via authMiddleware (sets req.user.users_id).
router.use(authMiddleware);

// GET /reports/weekly
router.get("/weekly", async (req, res) => {
  const result = await getWeekly(req.user.users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

// GET /reports/monthly
router.get("/monthly", async (req, res) => {
  const result = await getMonthly(req.user.users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

// GET /reports/yearly?year=2026   (year is an optional filter, not auth identity)
router.get("/yearly", async (req, res) => {
  const { year } = req.query;
  const result = await getYearly(req.user.users_id, year);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

export default router;
