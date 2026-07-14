import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import {
  QrCode,
  Send,
  Square,
  RefreshCw,
  LogOut,
  Smartphone,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  UserCheck,
  TrendingUp,
  Cpu,
  Clock,
  Settings,
  Flame,
  Check,
  Download,
  Trash2,
  Info,
  Layers,
  Search,
  MessageSquare
} from "lucide-react";

interface QueueItem {
  id: number;
  phone: string;
  message: string;
  status: "pending" | "sending" | "sent" | "failed";
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  // Floating notifications toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (msg: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message: msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // App States synchronized from Backend
  const [sessionLinked, setSessionLinked] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "linking" | "linked">("idle");
  const [campaignStatus, setCampaignStatus] = useState<"idle" | "sending" | "cooldown" | "stopped" | "completed">("idle");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Client UI States
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"qr" | "phone">("qr");
  const [linkPhoneNumber, setLinkPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [activeDelay, setActiveDelay] = useState<{ phone: string; seconds: number } | null>(null);
  const [numbersText, setNumbersText] = useState("94771234567\n94771234568\n94771234569\n94771234570");
  const [messageTemplate, setMessageTemplate] = useState("Hi {phone}! 👋 This is message #{index} simulated from your WhatsApp automation console with a safety delay block.");
  const [logsFilter, setLogsFilter] = useState<"all" | "info" | "success" | "warning" | "error">("all");
  const [activeTab, setActiveTab] = useState<"builder" | "queue" | "preview">("builder");

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Socket Connection setup
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setConnected(true);
      addToast("Successfully synchronized with real-time socket server!", "success");
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
      addToast("Lost connection with live socket server backend.", "error");
    });

    // Handle initial state packet
    newSocket.on("init_state", (data) => {
      setSessionLinked(data.sessionLinked);
      setSessionStatus(data.sessionStatus);
      setCampaignStatus(data.campaignStatus);
      setQueue(data.queue);
      setLogs(data.logs);
      setSentCount(data.sentCount);
      setTotalCount(data.totalCount);
    });

    // Handle live state changes
    newSocket.on("state_changed", (data) => {
      setSessionLinked((prev) => {
        if (data.sessionLinked && !prev) {
          addToast("Device paired successfully! WhatsApp session saved to LocalAuth.", "success");
        }
        return data.sessionLinked;
      });

      setCampaignStatus((prev) => {
        if (data.campaignStatus === "completed" && prev === "sending") {
          addToast("Bulk Campaign completed successfully!", "success");
        }
        if (data.campaignStatus === "stopped" && prev === "sending") {
          addToast("Campaign loops manually terminated by Administrator.", "error");
        }
        return data.campaignStatus;
      });

      setSessionStatus(data.sessionStatus);
      setQueue(data.queue);
      setSentCount(data.sentCount);
      setTotalCount(data.totalCount);
      if (data.campaignStatus !== "sending" && data.campaignStatus !== "cooldown") {
        setActiveDelay(null);
      }
    });

    // Live QR Code event
    newSocket.on("qr_code", (qrUrl: string) => {
      setQrImageUrl(qrUrl);
      addToast("QR Code successfully rendered! Scan with phone.", "info");
    });

    // Live Pairing Code event
    newSocket.on("pairing_code", (code: string) => {
      setPairingCode(code);
      addToast(`Pairing code [${code}] generated! Enter this code on your WhatsApp app.`, "warning");
    });

    // Live logs appended
    newSocket.on("log_added", (log: LogEntry) => {
      setLogs((prev) => {
        const next = [...prev, log];
        return next.length > 300 ? next.slice(1) : next;
      });
    });

    // Cool-down ticks
    newSocket.on("cooldown_tick", (seconds: number) => {
      setCooldownTime(seconds);
      setActiveDelay(null);
    });

    // Randomized delay ticks between messages
    newSocket.on("delay_tick", (data: { phone: string; seconds: number }) => {
      setActiveDelay(data);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Auto scroll logs console to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Clean and split the phone numbers
  const getParsedNumbers = (): string[] => {
    return numbersText
      .split(/[\n,;]/)
      .map((num) => num.replace(/[^0-9+]/g, "").trim())
      .filter((num) => num.length > 4);
  };

  const parsedNumbers = getParsedNumbers();

  // Handle linking simulation
  const handleLinkDevice = () => {
    if (socket) {
      setQrImageUrl(null);
      setPairingCode(null);
      socket.emit("link_device");
      addToast("Spawning headless browser for QR Code generation...", "info");
    }
  };

  // Handle linking simulation with phone number (pairing code)
  const handleLinkWithPhone = () => {
    if (!linkPhoneNumber.trim()) {
      addToast("Please enter your phone number with country code first.", "error");
      return;
    }
    if (socket) {
      setQrImageUrl(null);
      setPairingCode(null);
      socket.emit("link_with_phone", linkPhoneNumber.trim());
      addToast("Pairing your code...", "info");
    }
  };

  // Handle manual link confirmation (resolves fake auto-link issue)
  const handleConfirmLinked = () => {
    if (socket) {
      socket.emit("confirm_linked");
      addToast("Confirming login with WhatsApp server...", "info");
    }
  };

  // Copy pairing code to clipboard with success toast notification
  const handleCopyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      addToast(`Pairing code [${pairingCode}] copied to clipboard!`, "success");
    }
  };

  // Handle Logout/Device Reset
  const handleLogout = () => {
    if (window.confirm("Are you sure you want to unlink the WhatsApp session? This will reset local authentication.")) {
      if (socket) {
        setQrImageUrl(null);
        setPairingCode(null);
        socket.emit("logout_device");
        addToast("WhatsApp device unlinked successfully.", "warning");
      }
    }
  };

  // Trigger campaign queue
  const handleStartCampaign = () => {
    if (!sessionLinked) {
      alert("Please link your WhatsApp device via QR code first.");
      return;
    }
    if (parsedNumbers.length === 0) {
      alert("Please provide at least one valid phone number.");
      return;
    }
    if (!messageTemplate.trim()) {
      alert("Please write a message template to deliver.");
      return;
    }

    if (socket) {
      socket.emit("start_campaign", {
        numbers: parsedNumbers,
        message: messageTemplate,
      });
    }
  };

  // Stop campaign queue instantly
  const handleStopCampaign = () => {
    if (socket) {
      socket.emit("stop_campaign");
    }
  };

  // Reset campaign database statistics
  const handleClearCampaign = () => {
    if (socket) {
      socket.emit("clear_campaign");
    }
  };

  // Export console logs to a text file
  const handleExportLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`)
      .join("\r\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `whatsapp_automation_logs_${Date.now()}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clear local visual log screen
  const handleClearLogsScreen = () => {
    setLogs([]);
  };

  // Calculated Stats
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const sentSuccessfulCount = queue.filter((item) => item.status === "sent").length;
  const successPercentage =
    totalCount > 0 ? Math.round((sentSuccessfulCount / totalCount) * 100) : 0;

  // Filter logs list
  const filteredLogs = logs.filter((log) => {
    if (logsFilter === "all") return true;
    return log.type === logsFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative">
      {/* Dynamic Toast Notification Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col space-y-2.5 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`p-4 rounded-xl border shadow-2xl pointer-events-auto flex items-start gap-2.5 transition-all duration-300 transform translate-x-0 animate-fade-in ${
              t.type === "success"
                ? "bg-emerald-950/95 border-emerald-500/30 text-emerald-400"
                : t.type === "error"
                ? "bg-red-950/95 border-red-500/30 text-red-400"
                : t.type === "warning"
                ? "bg-amber-950/95 border-amber-500/30 text-amber-400"
                : "bg-slate-900/95 border-slate-700/50 text-slate-200"
            }`}
            style={{
              animation: "toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards"
            }}
          >
            {t.type === "success" && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />}
            {t.type === "error" && <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />}
            {t.type === "warning" && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />}
            {t.type === "info" && <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />}
            <span className="text-xs font-semibold leading-relaxed">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Dynamic Glow Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <Smartphone className="w-6 h-6 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              WhatsApp Automation{" "}
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-slate-700/50">
                PRO v2.5
              </span>
            </h1>
            <p className="text-xs text-slate-400">Anti-Ban Queue Scheduler & Real-Time Monitor</p>
          </div>
        </div>

        {/* Real-time Status badging */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-slate-950/80 px-3.5 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connected ? "bg-emerald-500 animate-ping" : "bg-red-500"
              }`}
            />
            <span className="text-slate-300">
              SOCKET: {connected ? "SYNC_ESTABLISHED" : "SYNC_DISCONNECTED"}
            </span>
          </div>

          <div
            className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border ${
              sessionLinked
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : sessionStatus === "linking"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {sessionLinked ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                <span>DEVICE_READY (LocalAuth)</span>
              </>
            ) : sessionStatus === "linking" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>LINK_PENDING</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                <span>DEVICE_OFFLINE</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: LocalAuth Session Authentication Setup */}
        <section className="lg:col-span-4 flex flex-col space-y-6">
          <div className="bg-slate-900 rounded-2xl border border-slate-800/80 p-5 shadow-xl transition-all duration-300 hover:border-slate-700/50 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                Session Auth Gateway
              </h2>
              {sessionLinked && (
                <button
                  onClick={handleLogout}
                  title="Unlink and clear device memory"
                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Session authentication states */}
            {!sessionLinked ? (
              <div className="flex-1 flex flex-col justify-between space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl text-xs space-y-2">
                  <p className="font-extrabold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400 animate-pulse" />
                    <span>Real WhatsApp Connection Active</span>
                  </p>
                  <p className="text-slate-200 leading-relaxed font-medium">
                    ඔබගේ සැබෑ <strong>WhatsApp</strong> ගිණුම සාර්ථකව සම්බන්ධ කිරීමට පහත පියවර අනුගමනය කරන්න:
                  </p>
                  <ul className="list-disc pl-4 text-slate-300 text-[11px] space-y-1">
                    <li>පළමුව, ඔබගේ <strong>Phone Number</strong> එක රටේ කේතය (Country Code) සහිතව ඇතුළත් කරන්න (උදා: 94771234567).</li>
                    <li><strong>Generate Pairing Code</strong> ක්ලික් කර ලැබෙන 8-character කෝඩ් එක කොපි කරගන්න.</li>
                    <li>ඔබේ දුරකථනයේ WhatsApp විවෘත කර <strong>Linked Devices &rarr; Link with phone number</strong> තෝරා මෙම කෝඩ් එක ඇතුළත් කරන්න.</li>
                  </ul>
                  <p className="text-slate-400 text-[11px] leading-relaxed border-t border-slate-800 pt-1.5">
                    Follow the instructions to link your actual WhatsApp device using either QR Code or Pairing Code. Once linked, the campaign queue will send real messages automatically!
                  </p>
                </div>

                {sessionStatus === "idle" ? (
                  <div className="space-y-4">
                    {/* Method Toggle Tabs */}
                    <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                      <button
                        onClick={() => setAuthMethod("qr")}
                        type="button"
                        className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                          authMethod === "qr"
                            ? "bg-slate-800 text-emerald-400 shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        QR Code Scan
                      </button>
                      <button
                        onClick={() => setAuthMethod("phone")}
                        type="button"
                        className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                          authMethod === "phone"
                            ? "bg-slate-800 text-emerald-400 shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Pairing Code
                      </button>
                    </div>

                    {authMethod === "qr" ? (
                      <div className="bg-slate-950 rounded-xl p-6 border border-slate-850 flex flex-col items-center justify-center space-y-4 text-center">
                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800">
                          <QrCode className="w-8 h-8 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-300">Option 1: Scan QR Code</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Quickly link by scanning a rendered code with your phone camera.</p>
                        </div>
                        <button
                          onClick={handleLinkDevice}
                          className="w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-medium text-xs transition-all duration-300 shadow-[0_4px_12px_rgba(16,185,129,0.15)] cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Generate QR Code</span>
                        </button>
                      </div>
                    ) : (
                      <div className="bg-slate-950 rounded-xl p-5 border border-slate-850 flex flex-col space-y-3">
                        <div className="text-center">
                          <p className="text-xs font-medium text-slate-300">Option 2: Pair with Phone Number</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Generate an 8-character numeric/alpha code to enter on your phone.</p>
                        </div>
                        
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={linkPhoneNumber}
                            onChange={(e) => setLinkPhoneNumber(e.target.value)}
                            placeholder="Enter phone with country code (e.g. 94771234567)"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 font-mono text-center"
                          />
                        </div>

                        <button
                          onClick={handleLinkWithPhone}
                          className="w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-medium text-xs transition-all duration-300 shadow-[0_4px_12px_rgba(16,185,129,0.15)] cursor-pointer"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Generate Pairing Code</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 flex flex-col items-center space-y-4 text-center">
                    {authMethod === "qr" ? (
                      qrImageUrl ? (
                        <div className="relative group">
                          <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur-sm opacity-50 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                          <div className="relative p-2.5 bg-white rounded-lg shadow-2xl">
                            <img
                              src={qrImageUrl}
                              alt="WhatsApp Authentication QR Code"
                              referrerPolicy="no-referrer"
                              className="w-40 h-40 block rounded"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="w-40 h-40 bg-slate-900 rounded-lg flex flex-col items-center justify-center space-y-2 border border-slate-800">
                          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                          <span className="text-[10px] text-slate-500 font-mono">SPAWNING_BROWSER...</span>
                        </div>
                      )
                    ) : (
                      pairingCode ? (
                        <div className="space-y-4 py-2 w-full flex flex-col items-center">
                          <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">ENTER_THIS_CODE_ON_PHONE</p>
                          <div className="inline-block bg-slate-900 px-6 py-3 border border-emerald-500/30 rounded-2xl text-2xl font-extrabold tracking-widest font-mono text-emerald-400 select-all shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                            {pairingCode}
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyPairingCode}
                            className="flex items-center space-x-1.5 py-1.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold text-xs border border-emerald-500/20 transition-all cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Copy Pairing Code</span>
                          </button>
                        </div>
                      ) : (
                        <div className="w-full py-6 bg-slate-900 rounded-lg flex flex-col items-center justify-center space-y-2 border border-slate-800">
                          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                          <span className="text-[10px] text-slate-500 font-mono">REQUESTING_PAIRING_CODE...</span>
                        </div>
                      )
                    )}

                    <div className="space-y-2.5 w-full">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-amber-400 animate-pulse">
                          Pairing Gateway Initialized
                        </p>
                        <p className="text-[10px] text-slate-400 max-w-xs leading-normal mx-auto">
                          {authMethod === "qr" ? (
                            "Open WhatsApp &rarr; Linked Devices &rarr; Scan this QR."
                          ) : (
                            "Open WhatsApp &rarr; Linked Devices &rarr; Link with Phone Number instead. Enter the 8-character code shown above."
                          )}
                        </p>
                      </div>

                      {/* Automated Handshake Status */}
                      <div className="pt-2">
                        <div className="flex items-center justify-center space-x-2 py-2 px-4 rounded-xl bg-slate-900 border border-emerald-500/10 text-[11px] text-slate-300 font-medium">
                          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                          <span className="font-mono uppercase tracking-wider text-emerald-400">AWAITING_AUTOMATED_HANDSHAKE...</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 animate-[pulse_2s_infinite] w-[80%]" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between space-y-6">
                <div className="bg-emerald-500/5 rounded-xl p-5 border border-emerald-500/10 text-center space-y-3">
                  <div className="inline-flex p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-400">
                    <UserCheck className="w-10 h-10" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-400">Connection Safe & Active</p>
                    <p className="text-xs text-slate-400 mt-1">LocalAuth session cached permanently in container.</p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Authenticated Node:</span>
                    <span className="font-mono text-slate-200 text-[11px]">WA-WEB-AUTOMATION-v1</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Local Auth Storage:</span>
                    <span className="text-emerald-400 font-medium">PERSISTED_ACTIVE</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-slate-400">Browser Environment:</span>
                    <span className="font-mono text-slate-200 text-[11px]">HeadlessChrome/Linux</span>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full py-2 px-4 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Reset Session Authentication
                </button>
              </div>
            )}
          </div>

          {/* Core App Guidelines */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800/80 p-5 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-emerald-400" />
              Safety & Evasion Protocols
            </h3>
            <ul className="space-y-2.5 text-xs text-slate-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span>
                  <strong>Anti-Ban Random Delay:</strong> Dynamically calculates sleep delays between 3,000ms and 8,000ms after every sent message to mimic normal desktop user typing behaviors.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span>
                  <strong>Safe Batching Cool-Down:</strong> Imposes a strict, non-skippable 60-second cooldown period after transmitting 50 successful messages to safeguard the account from threshold flags.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span>
                  <strong>Variables Resolver:</strong> Dynamic placeholders allow custom templates using <code>{"{phone}"}</code> or <code>{"{index}"}</code> to contextualize messages individually.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* CENTER COLUMN: Campaign Builder, Inputs, Message controls */}
        <section className="lg:col-span-5 flex flex-col space-y-6">
          <div className="bg-slate-900 rounded-2xl border border-slate-800/80 p-5 shadow-xl flex flex-col flex-1">
            {/* Tabs for Campaign View */}
            <div className="flex border-b border-slate-800 mb-5 text-sm">
              <button
                onClick={() => setActiveTab("builder")}
                className={`pb-3 px-4 font-medium border-b-2 transition-all duration-150 cursor-pointer ${
                  activeTab === "builder"
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                1. Campaign Builder
              </button>
              <button
                onClick={() => setActiveTab("queue")}
                className={`pb-3 px-4 font-medium border-b-2 transition-all duration-150 relative cursor-pointer ${
                  activeTab === "queue"
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                2. Live Queue State
                {queue.length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`pb-3 px-4 font-medium border-b-2 transition-all duration-150 cursor-pointer ${
                  activeTab === "preview"
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                3. Preview Output
              </button>
            </div>

            {/* TAB CONTENT: BUILDER */}
            {activeTab === "builder" && (
              <div className="space-y-4 flex-1 flex flex-col">
                {/* Targets input block */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      Recipient Targets
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">
                      Validated: {parsedNumbers.length} numbers parsed
                    </span>
                  </div>
                  <textarea
                    value={numbersText}
                    onChange={(e) => setNumbersText(e.target.value)}
                    placeholder="Enter phone numbers with country code (e.g., 18005550199), separated by newlines, commas, or semicolons"
                    className="w-full h-36 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-300 font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/60 transition-all duration-200 resize-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                    Format: Ignore dashes or brackets. Direct country-code formatting prevents communication failures.
                  </p>
                </div>

                {/* Template textarea */}
                <div className="flex-1 flex flex-col min-h-[220px]">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      Message Content Template
                    </label>
                  </div>
                  <textarea
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    placeholder="Write template. Insert placeholders {phone} or {index} anywhere."
                    className="w-full flex-1 min-h-[160px] bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/60 transition-all duration-200 resize-none leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-2.5 mt-2">
                    <button
                      onClick={() => setMessageTemplate((p) => p + " {phone}")}
                      type="button"
                      className="px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-mono transition-colors"
                    >
                      + {"{phone}"} Placeholder
                    </button>
                    <button
                      onClick={() => setMessageTemplate((p) => p + " {index}")}
                      type="button"
                      className="px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-mono transition-colors"
                    >
                      + {"{index}"} Placeholder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: QUEUE LIST */}
            {activeTab === "queue" && (
              <div className="space-y-3 flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Execution Schedule
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Queue: {queue.length} Total Messages
                  </span>
                </div>

                <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 overflow-y-auto max-h-[360px] p-2 divide-y divide-slate-900">
                  {queue.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-600">
                      <Layers className="w-8 h-8 mb-2" />
                      <p className="text-xs">No active campaign schedule populated</p>
                      <p className="text-[10px] text-slate-700 mt-0.5">Click 'Transmit' to initialize a campaign queue</p>
                    </div>
                  ) : (
                    queue.map((item) => (
                      <div
                        key={item.id}
                        className={`p-2.5 flex items-center justify-between text-xs transition-colors duration-200 ${
                          item.status === "sending" ? "bg-emerald-500/5" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-3 truncate">
                          <span className="w-5 text-right font-mono text-[10px] text-slate-600">
                            #{item.id}
                          </span>
                          <span className="font-mono text-slate-300 font-medium">{item.phone}</span>
                          <span className="text-slate-500 truncate max-w-[200px]">{item.message}</span>
                        </div>

                        <div>
                          {item.status === "pending" && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-slate-500 font-mono uppercase">
                              Pending
                            </span>
                          )}
                          {item.status === "sending" && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono uppercase animate-pulse">
                              Transmitting
                            </span>
                          )}
                          {item.status === "sent" && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono uppercase flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Delivered
                            </span>
                          )}
                          {item.status === "failed" && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 font-mono uppercase">
                              Failed
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: PREVIEW */}
            {activeTab === "preview" && (
              <div className="space-y-4 flex-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Template Resolver Preview
                </span>
                {parsedNumbers.length === 0 ? (
                  <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 text-center text-xs text-slate-600">
                    Provide phone numbers in Campaign Builder tab to preview individual records.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[380px] overflow-y-auto">
                    {parsedNumbers.slice(0, 5).map((num, idx) => (
                      <div key={idx} className="bg-slate-950 rounded-xl p-3 border border-slate-850 text-xs">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-mono text-emerald-400 font-medium">Phone: {num}</span>
                          <span className="text-[10px] text-slate-500 font-mono">Index: #{idx + 1}</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                          {messageTemplate
                            .replace(/{phone}/g, num)
                            .replace(/{index}/g, String(idx + 1))}
                        </p>
                      </div>
                    ))}
                    {parsedNumbers.length > 5 && (
                      <p className="text-[10px] text-slate-600 text-center italic">
                        showing first 5 of {parsedNumbers.length} recipient templates...
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Campaign control action footer bar */}
            <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap gap-3.5">
              {(campaignStatus === "sending" || campaignStatus === "cooldown") ? (
                <button
                  onClick={handleStopCampaign}
                  className="flex-1 min-w-[130px] flex items-center justify-center space-x-2 py-3 px-5 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white font-semibold text-sm transition-all duration-300 shadow-[0_4px_15px_rgba(239,68,68,0.25)] hover:shadow-[0_4px_25px_rgba(239,68,68,0.4)] cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Terminate Loop (Stop)</span>
                </button>
              ) : (
                <button
                  onClick={handleStartCampaign}
                  disabled={campaignStatus === "sending"}
                  className={`flex-1 min-w-[130px] flex items-center justify-center space-x-2 py-3 px-5 rounded-xl text-white font-semibold text-sm transition-all duration-300 cursor-pointer ${
                    sessionLinked
                      ? "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-[0_4px_15px_rgba(16,185,129,0.2)] hover:shadow-[0_4px_25px_rgba(16,185,129,0.35)]"
                      : "bg-slate-800 hover:bg-slate-750 text-slate-500 border border-slate-700/60 cursor-not-allowed"
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>Transmit Campaign (Start)</span>
                </button>
              )}

              <button
                onClick={handleClearCampaign}
                disabled={campaignStatus === "sending" || campaignStatus === "cooldown"}
                title="Reset statistics"
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Performance indicators, delay visual clocks, safety screens */}
        <section className="lg:col-span-3 flex flex-col space-y-6">
          {/* Progress gauge dial */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800/80 p-5 shadow-xl">
            <h2 className="text-xs font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-1.5 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Performance Gauges
            </h2>

            <div className="space-y-5">
              {/* Radial or thick progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-end text-xs font-mono">
                  <span className="text-slate-400">BATCH_PROGRESS</span>
                  <span className="text-emerald-400 font-bold">{successPercentage}%</span>
                </div>
                <div className="h-2.5 bg-slate-950 rounded-full border border-slate-850 overflow-hidden">
                  <div
                    style={{ width: `${successPercentage}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                  <span>SENT: {sentSuccessfulCount}</span>
                  <span>TOTAL: {totalCount}</span>
                </div>
              </div>

              {/* Status statistics grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-850">
                  <span className="text-[10px] font-mono text-slate-500 block">SUCCESSFUL</span>
                  <span className="text-base font-bold text-emerald-400 font-mono mt-0.5 block">
                    {sentSuccessfulCount}
                  </span>
                </div>
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-850">
                  <span className="text-[10px] font-mono text-slate-500 block">TRANSMIT_ERRS</span>
                  <span className="text-base font-bold text-red-400 font-mono mt-0.5 block">
                    {failedCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ACTIVE ANTI-BAN GAUGE */}
          {(campaignStatus === "sending" || campaignStatus === "cooldown") && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800/80 p-5 shadow-xl relative overflow-hidden">
              {/* COOLDOWN PANEL */}
              {campaignStatus === "cooldown" ? (
                <div className="space-y-4">
                  <div className="absolute top-0 right-0 p-3">
                    <Flame className="w-5 h-5 text-amber-400 animate-bounce" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      Safe Cool-Down Period
                    </h3>
                    <p className="text-xs text-slate-400 leading-normal">
                      Slowing down engine to avoid threshold automation flags.
                    </p>
                  </div>

                  <div className="bg-slate-950 rounded-xl p-4 border border-amber-500/20 text-center">
                    <span className="text-4xl font-extrabold text-amber-400 font-mono animate-pulse block">
                      00:{cooldownTime < 10 ? `0${cooldownTime}` : cooldownTime}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 mt-1 block">
                      ENGINE_LOCK_UNTIL_UNFREEZE
                    </span>
                  </div>
                </div>
              ) : (
                /* DELAY TICK COUNTER */
                <div className="space-y-4">
                  <div className="absolute top-0 right-0 p-3">
                    <Cpu className="w-5 h-5 text-emerald-400 animate-[spin_5s_infinite]" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Human Delay Sleep
                    </h3>
                    <p className="text-xs text-slate-400 leading-normal">
                      Simulating natural desktop typing delay behavior.
                    </p>
                  </div>

                  {activeDelay ? (
                    <div className="bg-slate-950 rounded-xl p-4 border border-emerald-500/20 text-center space-y-1">
                      <span className="text-3xl font-extrabold text-emerald-400 font-mono">
                        {activeDelay.seconds}s
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 block truncate">
                        DELAY_QUEUE_FOR: {activeDelay.phone}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 text-center">
                      <span className="text-xl font-medium text-slate-500 font-mono block">
                        CALCULATING...
                      </span>
                      <span className="text-[10px] font-mono text-slate-600 block mt-1">
                        WAITING_FOR_DELIVERY_TRIGGER
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quick Config Presets Info */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800/80 p-5 shadow-xl flex-1 flex flex-col justify-between">
            <div className="space-y-3.5">
              <h3 className="text-xs font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-400" />
                Active Configuration
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Delay Bounds:</span>
                  <span className="font-mono text-slate-300">3,000 - 8,000 ms</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Threshold limit:</span>
                  <span className="font-mono text-slate-300">50 Messages</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Cool-down Block:</span>
                  <span className="font-mono text-slate-300">60 seconds</span>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-850/80 flex items-start gap-2.5 text-[11px] text-slate-400 leading-normal">
              <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Simulated database logs are compiled directly from the express environment in real-time.
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER LOG TERMINAL: Color-coded live events console */}
      <footer className="bg-slate-950 border-t border-slate-900 p-6">
        <div className="max-w-7xl mx-auto flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                <Cpu className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-white">Device Log Console</h3>
                <p className="text-[11px] text-slate-500">Real-time Node.js event logger socket streaming</p>
              </div>
            </div>

            {/* Logs Filter tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-slate-900 p-1 rounded-lg border border-slate-800/80 flex items-center text-[11px]">
                <button
                  onClick={() => setLogsFilter("all")}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    logsFilter === "all" ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All Logs
                </button>
                <button
                  onClick={() => setLogsFilter("success")}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    logsFilter === "success" ? "bg-emerald-500/10 text-emerald-400 font-semibold" : "text-slate-400 hover:text-emerald-400"
                  }`}
                >
                  Delivered
                </button>
                <button
                  onClick={() => setLogsFilter("error")}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    logsFilter === "error" ? "bg-red-500/10 text-red-400 font-semibold" : "text-slate-400 hover:text-red-400"
                  }`}
                >
                  Failed
                </button>
                <button
                  onClick={() => setLogsFilter("warning")}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    logsFilter === "warning" ? "bg-amber-500/10 text-amber-400 font-semibold" : "text-slate-400 hover:text-amber-400"
                  }`}
                >
                  System Warns
                </button>
              </div>

              <div className="flex items-center space-x-2 text-[11px]">
                <button
                  onClick={handleExportLogs}
                  disabled={logs.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
                <button
                  onClick={handleClearLogsScreen}
                  disabled={logs.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Screen</span>
                </button>
              </div>
            </div>
          </div>

          {/* Retro live terminal window */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono text-[11px] leading-relaxed relative group shadow-[inset_0_4px_12px_rgba(0,0,0,0.5)]">
            <div className="absolute top-2 right-4 text-[9px] text-slate-600 font-semibold select-none group-hover:text-emerald-500/40 transition-colors">
              LOGS_STREAM_ACTIVE_OK
            </div>

            <div className="h-44 overflow-y-auto space-y-1.5 pr-2">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 italic">
                  &gt; Console terminal buffer empty. Scan QR or trigger message transmission to output logs.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="flex items-start space-x-2 transition-colors duration-150 hover:bg-slate-850 py-0.5 rounded px-1">
                    <span className="text-slate-600 shrink-0 font-medium select-none">
                      [{log.timestamp}]
                    </span>

                    {log.type === "info" && (
                      <span className="text-slate-400 font-light">&gt; {log.message}</span>
                    )}
                    {log.type === "success" && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        &gt; {log.message}
                      </span>
                    )}
                    {log.type === "warning" && (
                      <span className="text-amber-400 font-medium">&gt; {log.message}</span>
                    )}
                    {log.type === "error" && (
                      <span className="text-red-400 font-bold flex items-center gap-1">
                        &gt; {log.message}
                      </span>
                    )}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
