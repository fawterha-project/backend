// import nodemailer from "nodemailer";
import { Resend } from "resend";
import process from "node:process";

const resend = new Resend(process.env.RESEND_API_KEY);

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

export async function sendVerificationCode(email, code) {
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your Fawterha verification code",
    html: `
      <h2>Password Reset Code</h2>
      <p>Your verification code is:</p>
      <h1>${code}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });
  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

// export async function sendVerificationCode(email, code) {
//   await transporter.sendMail({
//     from: process.env.EMAIL_FROM,
//     to: email,
//     subject: "Your Fawterha verification code",
//     html: `
//       <h2>Password Reset Code</h2>
//       <p>Your verification code is:</p>
//       <h1>${code}</h1>
//       <p>This code will expire in 10 minutes.</p>
//       <p>If you did not request this, please ignore this email.</p>
//     `,
//   });
// }
