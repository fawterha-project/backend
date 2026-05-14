import express from "express";
import {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  logoutUser,
  deleteAccount,
  forgotPassword,
  verifyCode,
  resetPassword,
  resendCode,
  verifySignupCode,
  changePassword,
} from "../services/authService.js";

import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/*router.post("/register", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    const result = await registerUser(first_name, last_name, email, password);

    res.status(201).json({
      message: "User registered successfully",
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});*/

router.post("/register", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    const result = await registerUser(first_name, last_name, email, password);

    res.status(201).json({
      message: result.message,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser(email, password);

    res.status(200).json({
      message: "Login successful",
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await getProfile(req.user.users_id);

    res.status(200).json({
      user,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.patch("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await updateProfile(req.user.users_id, req.body);

    res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.post("/logout", authMiddleware, async (req, res) => {
  try {
    await logoutUser(req.user.token);

    res.status(200).json({
      message: "Logout successful",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.delete("/account", authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;

    await deleteAccount(req.user.users_id, password);

    res.status(200).json({
      message: "Account deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const result = await forgotPassword(email);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    const result = await verifyCode(email, code);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const result = await resetPassword(email, code, newPassword);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/resend-code", async (req, res) => {
  try {
    const { email, purpose } = req.body;

    const result = await resendCode(email, purpose);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.post("/verify-signup", async (req, res) => {
  try {
    const { email, code } = req.body;

    const result = await verifySignupCode(email, code);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

router.patch("/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await changePassword(
      req.user.users_id,
      currentPassword,
      newPassword
    );

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

export default router;