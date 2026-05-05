import express from "express";
import {
  setMonthlyLimit,
  getLimit,
  removeLimit,
} from "../services/expenseLimitsService.js";
import { checkAndNotifySpendingLimits } from "../services/notificationsService.js";

const router = express.Router();

// PUT /expense-limits   body: { users_id, monthly_limit }
router.put("/", async (req, res) => {
  const { users_id, monthly_limit } = req.body;
  if (!users_id || monthly_limit == null) {
    return res
      .status(400)
      .json({ error: "users_id and monthly_limit are required" });
  }
  if (Number(monthly_limit) < 0) {
    return res.status(400).json({ error: "monthly_limit must be >= 0" });
  }

  const result = await setMonthlyLimit(users_id, Number(monthly_limit));
  if (result.error) return res.status(400).json({ error: result.error });

  // Re-check spending against the new limit — if user is already over, fire a warning right away.
  await checkAndNotifySpendingLimits(users_id);

  res.status(200).json({
    message: "Monthly limit saved",
    expense_limit: result.expense_limit,
  });
});

// GET /expense-limits?users_id=...
router.get("/", async (req, res) => {
  const { users_id } = req.query;
  if (!users_id) {
    return res.status(400).json({ error: "users_id is required" });
  }
  const result = await getLimit(users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ expense_limit: result.expense_limit });
});

// DELETE /expense-limits   body: { users_id }
router.delete("/", async (req, res) => {
  const { users_id } = req.body;
  if (!users_id) {
    return res.status(400).json({ error: "users_id is required" });
  }
  const result = await removeLimit(users_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(200).json({ message: "Monthly limit removed" });
});

export default router;
