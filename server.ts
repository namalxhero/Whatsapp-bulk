import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { Server as SocketServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import pkg from "@whiskeysockets/baileys";
const makeWASocket = (pkg as any).default || pkg;
import { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";

interface QueueItem {
  id: number;
  phone: string;
  message: string;
  status: "pending" | "sending" | "sent" | "failed";
  timestamp?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
}

// In-memory persistent state (refresh-safe)
let sessionLinked = false;
let sessionStatus: "idle" | "linking" | "linked" = "idle";
let campaignStatus: "idle" | "sending" | "cooldown" | "stopped" | "completed" = "idle";
let queue: QueueItem[] = [];
let logs: LogEntry[] = [];
let sentCount = 0;
let failedCount = 0;
let totalCount = 0;

let activeTimeout: NodeJS.Timeout | null = null;
let activeInterval: NodeJS.Timeout | null = null;
let delayCountdownInterval: NodeJS.Timeout | null = null;

let campaignConfig = {
  delayType: "human",
  customDelayValue: 3,
  enableCooldown: true,
  cooldownLimit: 50,
  cooldownDuration: 60
};

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // Function to push a real-time log
  function addLog(type: LogEntry["type"], msg: string) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message: msg,
    };
    logs.push(entry);
    if (logs.length > 300) {
      logs.shift();
    }
    io.emit("log_added", entry);
  }

  // Get sliced queue for extremely fast payload delivery over websockets (avoids tab crashes)
  function getSlicedQueue() {
    const activeIndex = queue.findIndex(item => item.status === "sending" || item.status === "pending");
    if (queue.length > 200) {
      const start = Math.max(0, (activeIndex !== -1 ? activeIndex : 0) - 50);
      const end = Math.min(queue.length, start + 200);
      return queue.slice(start, end);
    }
    return queue;
  }

  // Helper to broadcast current full state to clients (capped to prevent bandwidth/tab freezes)
  function broadcastState() {
    io.emit("state_changed", {
      sessionLinked,
      sessionStatus,
      campaignStatus,
      queue: getSlicedQueue(),
      sentCount,
      failedCount,
      totalCount,
    });
  }

  let sock: any = null;

  async function initWhatsApp(phoneNumberForPairing?: string) {
    if (sock) {
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.ws.close();
      } catch (e) {}
      sock = null;
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
      
      sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
          io.emit("qr_code", qrUrl);
          addLog("warning", "Scan the QR code displayed on the screen to connect WhatsApp.");
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          sessionLinked = false;
          sessionStatus = "idle";
          broadcastState();

          addLog("error", `WhatsApp connection closed (Status: ${statusCode || "unknown"}). Reconnecting: ${shouldReconnect}`);
          
          if (shouldReconnect) {
            initWhatsApp();
          } else {
            try {
              fs.rmSync("baileys_auth_info", { recursive: true, force: true });
            } catch (err) {}
            addLog("warning", "Logged out. Session credentials cleared. Please pair your device again.");
          }
        } else if (connection === "open") {
          sessionLinked = true;
          sessionStatus = "linked";
          addLog("success", `WhatsApp successfully connected! Account: ${sock.user?.id.split(":")[0] || sock.user?.id}`);
          broadcastState();
        }
      });

      // If phone pairing code is requested
      if (phoneNumberForPairing && !sock.authState.creds.registered) {
        setTimeout(async () => {
          try {
            // Clean phone number (digits only)
            const cleanNumber = phoneNumberForPairing.replace(/\D/g, "");
            addLog("info", `Requesting real WhatsApp pairing code for: ${cleanNumber}...`);
            const code = await sock.requestPairingCode(cleanNumber);
            io.emit("pairing_code", code);
            addLog("success", `WhatsApp pairing code generated! CODE: ${code}`);
          } catch (err: any) {
            addLog("error", `Could not generate real pairing code: ${err.message || err}`);
            sessionStatus = "idle";
            broadcastState();
          }
        }, 3000);
      }
    } catch (err: any) {
      addLog("error", `Failed initializing WhatsApp client: ${err.message || err}`);
      sessionStatus = "idle";
      broadcastState();
    }
  }

  // Clear all running timeouts and intervals
  function clearCampaignTimers() {
    if (activeTimeout) {
      clearTimeout(activeTimeout);
      activeTimeout = null;
    }
    if (activeInterval) {
      clearInterval(activeInterval);
      activeInterval = null;
    }
    if (delayCountdownInterval) {
      clearInterval(delayCountdownInterval);
      delayCountdownInterval = null;
    }
  }

  // Socket.io connection logic
  io.on("connection", (socket) => {
    // Send initial state
    socket.emit("init_state", {
      sessionLinked,
      sessionStatus,
      campaignStatus,
      queue: getSlicedQueue(),
      logs,
      sentCount,
      failedCount,
      totalCount,
    });

    // Handle session link request
    socket.on("link_device", () => {
      if (sessionLinked) {
        addLog("info", "Session is already active and linked.");
        return;
      }

      sessionStatus = "linking";
      addLog("info", "Initializing WhatsApp connection (QR Code method)...");
      broadcastState();
      initWhatsApp();
    });

    // Handle session link via pairing phone number code
    socket.on("link_with_phone", (phoneNumber: string) => {
      if (sessionLinked) {
        addLog("info", "Session is already active and linked.");
        return;
      }
      if (!phoneNumber || phoneNumber.length < 7) {
        addLog("error", "Failed to generate pairing code: Invalid phone number.");
        return;
      }

      sessionStatus = "linking";
      addLog("info", `Initializing WhatsApp connection for: ${phoneNumber} (Pairing Code method)...`);
      broadcastState();
      initWhatsApp(phoneNumber);
    });

    // Handle logout/reset session
    socket.on("logout_device", async () => {
      clearCampaignTimers();
      sessionLinked = false;
      sessionStatus = "idle";
      campaignStatus = "idle";
      queue = [];
      sentCount = 0;
      totalCount = 0;
      
      if (sock) {
        try {
          await sock.logout();
        } catch (e) {}
        try {
          sock.ev.removeAllListeners("connection.update");
          sock.ev.removeAllListeners("creds.update");
          sock.ws.close();
        } catch (e) {}
        sock = null;
      }

      try {
        fs.rmSync("baileys_auth_info", { recursive: true, force: true });
      } catch (err) {}

      addLog("warning", "WhatsApp session cleared. Device unlinked.");
      broadcastState();
    });

    // Handle campaign starting
    socket.on("start_campaign", (data: { 
      numbers: string[]; 
      message: string;
      delayType?: "instant" | "fast" | "normal" | "human" | "custom";
      customDelayValue?: number;
      enableCooldown?: boolean;
      cooldownLimit?: number;
      cooldownDuration?: number;
    }) => {
      if (!sessionLinked) {
        addLog("error", "Cannot start campaign: No authenticated WhatsApp session.");
        return;
      }
      if (campaignStatus === "sending" || campaignStatus === "cooldown") {
        addLog("warning", "A campaign is already running.");
        return;
      }

      const { 
        numbers, 
        message,
        delayType = "human",
        customDelayValue = 3,
        enableCooldown = true,
        cooldownLimit = 50,
        cooldownDuration = 60
      } = data;

      if (!numbers || numbers.length === 0 || !message) {
        addLog("error", "Validation failed: Phone numbers and message template are required.");
        return;
      }

      // Update active configs
      campaignConfig = {
        delayType,
        customDelayValue,
        enableCooldown,
        cooldownLimit,
        cooldownDuration
      };

      // Initialize Campaign Queue
      campaignStatus = "sending";
      sentCount = 0;
      failedCount = 0;
      totalCount = numbers.length;
      queue = numbers.map((num, idx) => ({
        id: idx + 1,
        phone: num,
        message: message.replace(/{phone}/g, num).replace(/{index}/g, String(idx + 1)),
        status: "pending" as const,
      }));

      addLog("info", `Starting campaign for ${totalCount} targets (Delay: ${delayType}, Cooldown: ${enableCooldown ? 'On' : 'Off'})...`);
      broadcastState();

      // Begin sending loop
      processNextQueueItem();
    });

    // Handle manual campaign stopping
    socket.on("stop_campaign", () => {
      if (campaignStatus !== "sending" && campaignStatus !== "cooldown") {
        addLog("info", "No active campaign is currently running.");
        return;
      }

      clearCampaignTimers();
      campaignStatus = "stopped";
      addLog("error", "Campaign manually halted by administrator. Message sending terminated.");
      broadcastState();
    });

    // Reset statistics
    socket.on("clear_campaign", () => {
      if (campaignStatus === "sending" || campaignStatus === "cooldown") {
        addLog("warning", "Cannot reset statistics while campaign is active.");
        return;
      }
      queue = [];
      sentCount = 0;
      failedCount = 0;
      totalCount = 0;
      campaignStatus = "idle";
      addLog("info", "Campaign queue and stats cleared.");
      broadcastState();
    });
  });

  // Main campaign queue processing function
  function processNextQueueItem() {
    // Find next pending item
    const nextItem = queue.find((item) => item.status === "pending");

    if (!nextItem) {
      campaignStatus = "completed";
      addLog("success", `Campaign completed successfully! Total messages sent: ${sentCount}/${totalCount}`);
      broadcastState();
      return;
    }

    // Safety cool-down check
    if (campaignConfig.enableCooldown && sentCount > 0 && sentCount % campaignConfig.cooldownLimit === 0 && campaignStatus !== "cooldown") {
      campaignStatus = "cooldown";
      const duration = campaignConfig.cooldownDuration;
      addLog("warning", `⚠️ Anti-Ban Safety Triggered: Cool-down active for ${duration} seconds after sending ${sentCount} messages.`);
      broadcastState();

      let secondsLeft = duration;
      io.emit("cooldown_tick", secondsLeft);

      activeInterval = setInterval(() => {
        secondsLeft--;
        io.emit("cooldown_tick", secondsLeft);

        if (secondsLeft <= 0) {
          clearInterval(activeInterval as NodeJS.Timeout);
          campaignStatus = "sending";
          addLog("info", "Safety cool-down period ended. Resuming campaign queue.");
          broadcastState();
          processNextQueueItem();
        }
      }, 1000);
      return;
    }

    // Update item status to sending
    nextItem.status = "sending";
    broadcastState();

    // Determine randomized 'human-like' or custom delay
    let delay = 3000;
    if (campaignConfig.delayType === "instant") {
      delay = 80; // minimal non-zero delay to avoid process blockage and keep socket events fluid
    } else if (campaignConfig.delayType === "fast") {
      delay = 500;
    } else if (campaignConfig.delayType === "normal") {
      delay = 2000;
    } else if (campaignConfig.delayType === "custom") {
      delay = (campaignConfig.customDelayValue || 3) * 1000;
    } else { // human (random 3-8s)
      delay = Math.floor(Math.random() * (8000 - 3000 + 1)) + 3000;
    }

    addLog("info", `Preparing to transmit next message to ${nextItem.phone}...`);
    
    // Notify clients of the active delay countdown
    let delayRemaining = Math.round(delay / 1000);
    if (delayRemaining > 0) {
      io.emit("delay_tick", { phone: nextItem.phone, seconds: delayRemaining });

      delayCountdownInterval = setInterval(() => {
        delayRemaining--;
        if (delayRemaining >= 0) {
          io.emit("delay_tick", { phone: nextItem.phone, seconds: delayRemaining });
        }
      }, 1000);
    } else {
      io.emit("delay_tick", { phone: nextItem.phone, seconds: 0 });
    }

    activeTimeout = setTimeout(async () => {
      if (delayCountdownInterval) clearInterval(delayCountdownInterval);

      if (!sessionLinked || !sock) {
        nextItem.status = "failed";
        failedCount++;
        addLog("error", `[Failed] WhatsApp session lost. Cannot send message to ${nextItem.phone}.`);
        broadcastState();
        return;
      }

      try {
        // Clean and format phone number for Baileys JID (e.g. 94771234567@s.whatsapp.net)
        let cleanPhone = nextItem.phone.replace(/\D/g, "");
        if (cleanPhone.startsWith("0")) {
          cleanPhone = "94" + cleanPhone.substring(1);
        }
        
        const jid = `${cleanPhone}@s.whatsapp.net`;
        
        // Send the real WhatsApp message!
        await sock.sendMessage(jid, { text: nextItem.message });

        nextItem.status = "sent";
        sentCount++;
        addLog("success", `[Sent] Message #${nextItem.id} delivered successfully to ${nextItem.phone}.`);
      } catch (err: any) {
        nextItem.status = "failed";
        failedCount++;
        addLog("error", `[Failed] Error sending to ${nextItem.phone}: ${err.message || err}`);
      }

      broadcastState();

      // Recurse to send next message
      processNextQueueItem();
    }, delay);
  }

  // REST API Routes
  app.get("/api/status", (req, res) => {
    res.json({
      sessionLinked,
      sessionStatus,
      campaignStatus,
      queueSize: queue.length,
      sentCount,
      totalCount,
    });
  });

  // Integrate Vite for single-page client loading in React
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Auto-connect on startup if session credentials exist
  if (fs.existsSync(path.join(process.cwd(), "baileys_auth_info", "creds.json"))) {
    addLog("info", "Previous WhatsApp session credentials found. Initializing auto-connection...");
    initWhatsApp();
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`WhatsApp Automation server active on port ${PORT}`);
  });
}

startServer();
