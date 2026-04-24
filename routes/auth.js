import express from "express";
import { registerUser, loginUser } from "../services/authService.js";

const router = express.Router();

console.log("auth router loaded!");

router.post("/register", async (req, response) => {
  const { first_name, last_name, email, password } = req.body;

  if (!first_name || !last_name || !email || !password) {
    return response.status(400).json({ error: "All fields are required" });
  }

  const result = await registerUser(first_name, last_name, email, password);

  if (result.error) {
    return response.status(400).json({ error: result.error });
  }

  response
    .status(201)
    .json({ message: "User registered successfully", user: result.user });
});

router.post("/login", async (req, response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return response
      .status(400)
      .json({ error: "Email and password are required" });
  }

  const result = await loginUser(email, password);

  if (result.error) {
    return response.status(400).json({ error: result.error });
  }

  response.status(200).json({ message: "Login successful", user: result.user });
});

export default router;
