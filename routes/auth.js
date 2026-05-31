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

router.post("/register", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    await registerUser(first_name, last_name, email, password);

    
    res.status(201).json({
      message: "تم إنشاء الحساب بنجاح، أرسلنا رمز التحقق إلى بريدك الإلكتروني",
    });
  } catch (error) {
   
    let errMsg = "عذراً، فشل إنشاء الحساب. تأكد من البيانات المدخلة";

    if (error.message.includes("Email already exists")) {
      errMsg = "هذا البريد الإلكتروني مسجل بالفعل";
    } else if (
      error.message.includes("Password must be at least 8 characters")
    ) {
      errMsg =
        "يجب أن تكون كلمة السر من 8 خانات وتحتوي على حرف كبير، رقم، ورمز خاص";
    }

    res.status(400).json({
      message: errMsg,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser(email, password);

    res.status(200).json({
      message: "تم تسجيل الدخول بنجاح",
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    let errMsg = "عذراً، تعذر تسجيل الدخول حالياً";

    if (
      error.message.includes("Invalid email or password") ||
      error.message.includes("Invalid login credentials")
    ) {
      errMsg = "البريد الإلكتروني أو كلمة المرور غير صحيحة";
    } else if (error.message.includes("Please verify your email first")) {
      errMsg = "يرجى التحقق من بريدك الإلكتروني أولاً لتفعيل الحساب";
    } else if (error.message.includes("Email and password are required")) {
      errMsg = "البريد الإلكتروني وكلمة المرور حقول مطلوبة";
    }

    res.status(400).json({
      message: errMsg,
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
      message: "عذراً، فشل جلب بيانات الحساب",
    });
  }
});

router.patch("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await updateProfile(req.user.users_id, req.body);

    res.status(200).json({
      message: "تم تحديث البيانات بنجاح",
      user,
    });
  } catch (error) {
    res.status(400).json({
      message: "عذراً، فشل تحديث بيانات الملف الشخصي",
    });
  }
});

router.post("/logout", authMiddleware, async (req, res) => {
  try {
    await logoutUser(req.user.token);

    res.status(200).json({
      message: "تم تسجيل الخروج بنجاح",
    });
  } catch (error) {
    res.status(400).json({
      message: "حدث خطأ أثناء تسجيل الخروج",
    });
  }
});

router.delete("/account", authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;

    await deleteAccount(req.user.users_id, password);

    res.status(200).json({
      message: "تم حذف الحساب بنجاح",
    });
  } catch (error) {
    let errMsg = "عذراً، فشل إجراء حذف الحساب حالياً";
    if (
      error.message.includes("Invalid password") ||
      error.message.includes("Password is required")
    ) {
      errMsg = "كلمة المرور المدخلة غير صحيحة";
    }

    res.status(400).json({
      message: errMsg,
    });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    await forgotPassword(email);

    res.status(200).json({
      message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني بنجاح",
    });
  } catch (error) {
    let errMsg = "تأكد من صحة البريد الإلكتروني المدخل";
    if (error.message.includes("User not found")) {
      errMsg = "هذا البريد الإلكتروني غير مسجل لدينا";
    }
    res.status(400).json({ message: errMsg });
  }
});

router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    await verifyCode(email, code);

    res.status(200).json({
      message: "تم التحقق من الرمز بنجاح، يمكنك الآن تعيين كلمة السر",
    });
  } catch (error) {
    let errMsg = "الرمز المدخل غير صحيح، يرجى إعادة المحاولة";
    if (error.message.includes("Code expired")) {
      errMsg = "رمز التحقق منتهي الصلاحية، يرجى طلب رمز جديد";
    }
    res.status(400).json({ message: errMsg });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    await resetPassword(email, code, newPassword);

    res.status(200).json({
      message: "تم إعادة تعيين كلمة السر بنجاح، يمكنك تسجيل الدخول الآن",
    });
  } catch (error) {
    let errMsg = "فشلت عملية تعيين كلمة السر، يرجى المحاولة مجدداً";
    if (error.message.includes("Password must be at least 8 characters")) {
      errMsg =
        "يجب أن تكون كلمة السر من 8 خانات وتحتوي على حرف كبير، رقم، ورمز خاص";
    } else if (
      error.message.includes("Invalid code") ||
      error.message.includes("Code expired")
    ) {
      errMsg = "رمز التحقق غير صحيح أو منتهي الصلاحية";
    }
    res.status(400).json({ message: errMsg });
  }
});

router.post("/resend-code", async (req, res) => {
  try {
    const { email, purpose } = req.body;

    await resendCode(email, purpose);

    res.status(200).json({
      message: "تم إعادة إرسال رمز التحقق بنجاح إلى بريدك",
    });
  } catch (error) {
    let errMsg = "فشل إعادة إرسال الرمز، يرجى المحاولة بعد قليل";
    if (error.message.includes("User not found")) {
      errMsg = "هذا البريد الإلكتروني غير مسجل لدينا";
    }
    res.status(400).json({
      message: errMsg,
    });
  }
});

router.post("/verify-signup", async (req, res) => {
  try {
    const { email, code } = req.body;

    const result = await verifySignupCode(email, code);

    res.status(200).json({
      message: "تم تفعيل حسابك بنجاح، أهلاً بك في فوترها 🎉",
      token: result.token,
    });
  } catch (error) {
    let errMsg = "رمز تفعيل الحساب غير صحيح، يرجى إعادة المحاولة";
    if (error.message.includes("Code expired")) {
      errMsg = "رمز التفعيل منتهي الصلاحية، يرجى إعادة إرسال رمز جديد";
    } else if (error.message.includes("Invalid code")) {
      errMsg = "الرمز الذي أدخلته غير صحيح";
    }
    res.status(400).json({
      message: errMsg,
    });
  }
});

router.patch("/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    await changePassword(req.user.users_id, currentPassword, newPassword);

    res.status(200).json({
      message: "تم تحديث كلمة السر بنجاح، يرجى تسجيل الدخول مجدداً",
    });
  } catch (error) {
    let errMsg = "عذراً، فشل تغيير كلمة السر، يرجى المحاولة مجدداً";
    if (error.message.includes("Current password is incorrect")) {
      errMsg = "كلمة السر الحالية غير صحيحة";
    } else if (
      error.message.includes("Password must be at least 8 characters")
    ) {
      errMsg =
        "يجب أن تكون كلمة السر الجديدة من 8 خانات وتحتوي على حرف كبير ورقم ورمز";
    }

    res.status(400).json({
      message: errMsg,
    });
  }
});

export default router;
