import express from "express";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import receiptsRouter from "./routes/receipts.js";
import notificationsRouter from "./routes/notifications.js";
import expenseLimitsRouter from "./routes/expenseLimits.js";
import reportsRouter from "./routes/reports.js";

const env = dotenv.config().parsed;
const app = express();

app.use(express.json());
app.use("/auth", authRouter);
app.use("/receipts", receiptsRouter);
app.use("/notifications", notificationsRouter);
app.get("/test", (req, response) => {
  response.json({ message: "Server is working!" });
  app.use("/expense-limits", expenseLimitsRouter);
});
app.use("/expense-limits", expenseLimitsRouter);
app.use("/reports", reportsRouter);

const PORT = env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
