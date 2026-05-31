// services/geminiClient.js
import { GoogleGenAI } from "@google/genai";

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY1,
  process.env.GEMINI_API_KEY2
];
let currentIndex = 0;

export const getModel = () => {
  const genAI = new GoogleGenAI({ apiKey: API_KEYS[currentIndex] });
  return genAI.models.generateContent({ model: "gemini-1.5-flash" });
};

export const rotateKey = () => {
  currentIndex = (currentIndex + 1) % API_KEYS.length;
  console.log(`تم التبديل للمفتاح رقم: ${currentIndex}`);
};