import express from "express";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import receiptsRouter from "./routes/receipts.js";

const env = dotenv.config().parsed;
const app = express();

app.use(express.json());
app.use("/auth", authRouter);
app.use("/receipts", receiptsRouter);
app.get("/test", (req, response) => {
  response.json({ message: "Server is working!" });
});

const PORT = env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
