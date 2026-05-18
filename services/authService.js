import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "../supabaseClient.js";
import { sendVerificationCode } from "./emailService.js";
//import { sendSMSOTP } from "./smsService.js";
import process from "node:process";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

function createToken(user) {
  return jwt.sign(
    {
      users_id: user.users_id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}
function validatePassword(password) {
  const passwordRegex =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

  if (!passwordRegex.test(password)) {
    throw new Error(
      "Password must be at least 8 characters and include one uppercase letter, one number, and one special character",
    );
  }
}

export async function registerUser(first_name, last_name, email, password) {
  validatePassword(password);
  const { data: existingUser } = await supabase
    .from("users")
    .select("users_id")
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    throw new Error("Email already exists");
  }
  const password_hash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from("users")
    .insert([
      {
        first_name,
        last_name,
        email,
        password_hash,
        is_verified: false,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);

  //  كود التحقق
  const code = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  await supabase.from("verification_code").insert([
    {
      user_id: user.users_id,
      code,
      code_type: "email",
      target: user.email,
      purpose: "signup",
      expires_at: expiresAt.toISOString(),
    },
  ]);

  await sendVerificationCode(user.email, code);

  return {
    message: "Account created. Verification code sent to email",
  };
}

export async function verifySignupCode(email, code) {
  const { data, error } = await supabase
    .from("verification_code")
    .select("*")
    .eq("target", email)
    .eq("code", code)
    .eq("purpose", "signup")
    .eq("is_used", false)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid code");

  if (new Date(data.expires_at) < new Date()) {
    throw new Error("Code expired");
  }

  const { data: user, error: updateError } = await supabase
    .from("users")
    .update({
      is_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq("email", email)
    .select()
    .single();

  if (updateError) throw new Error(updateError.message);

  await supabase
    .from("verification_code")
    .update({ is_used: true })
    .eq("verification_code_id", data.verification_code_id);

  //  هنا نعطي التوكن
  const token = createToken(user);
  await saveAuthToken(user.users_id, token);

  return {
    message: "Account verified successfully",
    token,
  };
}

export async function loginUser(email, password) {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordCorrect) {
    throw new Error("Invalid email or password");
  }

  if (!user.is_verified) {
    throw new Error("Please verify your email first");
  }
  const token = createToken(user);
  await saveAuthToken(user.users_id, token);
  delete user.password_hash;

  return {
    user,
    token,
  };
}

export async function getProfile(users_id) {
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "users_id, first_name, last_name, email, phone, date_of_birth, gender, created_at, updated_at",
    )
    .eq("users_id", users_id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return user;
}

export async function updateProfile(users_id, updates) {
  const allowedUpdates = {
    first_name: updates.first_name,
    last_name: updates.last_name,
    phone: updates.phone,
    date_of_birth: updates.date_of_birth,
    gender: updates.gender,
    updated_at: new Date().toISOString(),
  };

  Object.keys(allowedUpdates).forEach((key) => {
    if (allowedUpdates[key] === undefined) {
      delete allowedUpdates[key];
    }
  });

  const { data: user, error } = await supabase
    .from("users")
    .update(allowedUpdates)
    .eq("users_id", users_id)
    .select(
      "users_id, first_name, last_name, email, phone, date_of_birth, gender, updated_at",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return user;
}

export async function saveAuthToken(users_id, token) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { error } = await supabase.from("auth_tokens").insert([
    {
      user_id: users_id,
      token,
      type: "access",
      expires_at: expiresAt.toISOString(),
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function logoutUser(token) {
  const { error } = await supabase
    .from("auth_tokens")
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
    })
    .eq("token", token);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAccount(users_id, password) {
  if (!password) {
    throw new Error("Password is required to delete account");
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("users_id, password_hash")
    .eq("users_id", users_id)
    .single();

  if (error) throw new Error(error.message);

  const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordCorrect) {
    throw new Error("Invalid password");
  }
  const { error: revokeError } = await supabase
    .from("auth_tokens")
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
    })
    .eq("user_id", users_id);

  if (revokeError) {
    throw new Error(revokeError.message);
  }
  const { error: deleteError } = await supabase
    .from("users")
    .delete()
    .eq("users_id", users_id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  return true;
}

export async function forgotPassword(email) {
  if (!email) {
    throw new Error("Email is required");
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("users_id, email")
    .eq("email", email)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!user) throw new Error("User not found");

  // generate 4-digit code
  const code = Math.floor(1000 + Math.random() * 9000).toString();

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  const { error: insertError } = await supabase
    .from("verification_code")
    .insert([
      {
        user_id: user.users_id,
        code,
        code_type: "email",
        target: email,
        purpose: "reset_password",
        expires_at: expiresAt.toISOString(),
      },
    ]);

  if (insertError) throw new Error(insertError.message);

  await sendVerificationCode(email, code);

  return { message: "Verification code sent to email" };
}

export async function verifyCode(email, code) {
  const { data, error } = await supabase
    .from("verification_code")
    .select("*")
    .eq("target", email)
    .eq("code", code)
    .eq("purpose", "reset_password")
    .eq("is_used", false)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    throw new Error("Invalid code");
  }

  if (new Date(data.expires_at) < new Date()) {
    throw new Error("Code expired");
  }

  return { message: "Code is valid" };
}

export async function resetPassword(email, code, newPassword) {
  const { data, error } = await supabase
    .from("verification_code")
    .select("*")
    .eq("target", email)
    .eq("code", code)
    .eq("purpose", "reset_password")
    .eq("is_used", false)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid code");

  if (new Date(data.expires_at) < new Date()) {
    throw new Error("Code expired");
  }
  validatePassword(newPassword);
  const password_hash = await bcrypt.hash(newPassword, 10);

  await supabase
    .from("users")
    .update({
      password_hash,
      updated_at: new Date().toISOString(),
    })
    .eq("email", email);

  //  هنا المهم
  await supabase
    .from("verification_code")
    .update({ is_used: true })
    .eq("verification_code_id", data.verification_code_id);

  return { message: "Password reset successful" };
}

export async function resendCode(email, purpose) {
  if (!email || !purpose) {
    throw new Error("Email and purpose are required");
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("users_id, email")
    .eq("email", email)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!user) throw new Error("User not found");

  // generate new code (4 digits)
  const code = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  const { error: insertError } = await supabase
    .from("verification_code")
    .insert([
      {
        user_id: user.users_id,
        code,
        code_type: "email",
        target: email,
        purpose, // signup or reset_password
        expires_at: expiresAt.toISOString(),
      },
    ]);

  if (insertError) throw new Error(insertError.message);

  await sendVerificationCode(email, code);

  return { message: "Code resent successfully" };
}
//AKA RESET PASS
export async function changePassword(users_id, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw new Error("Current password and new password are required");
  }

  validatePassword(newPassword);

  const { data: user, error } = await supabase
    .from("users")
    .select("users_id, password_hash")
    .eq("users_id", users_id)
    .single();

  if (error) throw new Error(error.message);

  const isPasswordCorrect = await bcrypt.compare(
    currentPassword,
    user.password_hash,
  );

  if (!isPasswordCorrect) {
    throw new Error("Current password is incorrect");
  }

  const password_hash = await bcrypt.hash(newPassword, 10);

  const { error: updateError } = await supabase
    .from("users")
    .update({
      password_hash,
      updated_at: new Date().toISOString(),
    })
    .eq("users_id", users_id);

  if (updateError) throw new Error(updateError.message);

  await supabase
    .from("auth_tokens")
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
    })
    .eq("user_id", users_id);

  return {
    message: "Password changed successfully. Please login again",
  };
}
