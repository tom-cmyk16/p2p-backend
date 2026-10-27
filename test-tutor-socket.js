import "dotenv/config";
import { io } from "socket.io-client";

const TUTOR_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtdWNnM2gwNDAwMDB6Nmptb2lkeGxrdnMiLCJyb2xlIjoiVFVUT1IiLCJpYXQiOjE3OTA1OTY2MTAsImV4cCI6MTc5MTIwMTQxMH0.UqvkyI8ARr_bvtAtlcrmD7Jv3nl9izUFvLTUgYKxodg";

const conversationId = "cmuk22k340000qmjm0rxj0l8f";

const socket = io("http://localhost:3000", {
  auth: {
    token: TUTOR_TOKEN,
  },
});

socket.on("connect", () => {
  console.log("✅ Tutor socket connected");
  console.log("Tutor socket ID:", socket.id);

  console.log("➡️ Joining conversation:", conversationId);

  socket.emit("conversation:join", conversationId);

  console.log("✅ conversation:join emitted");
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error.message);
});

socket.on("error", (error) => {
  console.error("❌ Socket error:", error);
});

socket.on("message:new", (message) => {
  console.log("📩 TUTOR received message:new:", message);
});

socket.on("message:statusUpdate", (data) => {
  console.log("📩 TUTOR received message:statusUpdate:", data);
});

socket.on("disconnect", (reason) => {
  console.log("🔌 Tutor disconnected:", reason);
});