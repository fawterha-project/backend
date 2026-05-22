import cors from 'cors';
import express from "express";
import dotenv from "dotenv";
import cors from "cors";//
import authRouter from "./routes/auth.js";
import receiptsRouter from "./routes/receipts.js";
import notificationsRouter from "./routes/notifications.js";
import expenseLimitsRouter from "./routes/expenseLimits.js";
import reportsRouter from "./routes/reports.js";
import externalRouter from "./routes/external.js";
import morgan from "morgan";
import process from "node:process";

dotenv.config();
const app = express();
const cors = require('cors');

app.use(cors()); //

app.use(morgan("dev"));

app.use(express.json());
app.use("/auth", authRouter);
app.use("/receipts", receiptsRouter);
app.use("/notifications", notificationsRouter);
app.use("/expense-limits", expenseLimitsRouter);
app.use("/reports", reportsRouter);
app.use("/external", externalRouter);

app.get("/test", (req, response) => {
  response.json({ message: "Server is working!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

