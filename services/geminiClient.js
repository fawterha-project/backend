// services/geminiClient.js
import { GoogleGenAI } from "@google/genai";

const API_KEYS = [process.env.GEMINI_API_KEY].filter(Boolean);

let currentIndex = 0;

// Return the AI CLIENT (not a model) — caller uses client.models.generateContent(...)
export const getClient = () => {
  if (API_KEYS.length === 0) {
    throw new Error("No Gemini API keys configured in environment variables");
  }
  return new GoogleGenAI({ apiKey: API_KEYS[currentIndex] });
};

export const rotateKey = () => {
  currentIndex = (currentIndex + 1) % API_KEYS.length;
  console.log(`Switched to Gemini API key index: ${currentIndex}`);
};
