import express from "express";
import {
  getSummary,
  getWeekly,
  getMonthly,
  getYearly,
} from "../services/reportsService.js";

const router = express.Router();

router.get("/summary", async (req, res) => {
  const { users_id } = req.query;
  if (!users_id) return res.status(400).json({ error: "users_id is required" });
  const result = await getSummary(users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

router.get("/weekly", async (req, res) => {
  const { users_id } = req.query;
  if (!users_id) return res.status(400).json({ error: "users_id is required" });
  const result = await getWeekly(users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

router.get("/monthly", async (req, res) => {
  const { users_id } = req.query;
  if (!users_id) return res.status(400).json({ error: "users_id is required" });
  const result = await getMonthly(users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

router.get("/yearly", async (req, res) => {
  const { users_id, year } = req.query;
  if (!users_id) return res.status(400).json({ error: "users_id is required" });
  const result = await getYearly(users_id, year);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json(result);
});

export default router;
