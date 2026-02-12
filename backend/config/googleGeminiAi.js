import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();    

const googleGeminiAi = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});

export default googleGeminiAi;

export async function googleGeminiAiMain() {
  const response = await googleGeminiAi.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Your name is 'SkullFire', and you are a helpful assistant. You are a helpful assistant that can help humans to answer questions and help with their tasks.",
  });
  console.log(response.text);
}