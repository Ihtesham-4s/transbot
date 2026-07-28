import { useState, useRef } from "react";
import { Bot, Send, Sparkles, User, Copy, Check, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";

const QUICK_PROMPTS = [
  { label: "Warehouse Status", prompt: "Give me a complete summary of current robot status, zone location, and pending queue tasks." },
  { label: "Low Stock Alerts", prompt: "Are any inventory products currently low on stock or requiring reorder?" },
  { label: "3 kg Order Rule", prompt: "How are orders over 2.0 kg handled versus items under 2.0 kg?" },
  { label: "Zone Layout & Paths", prompt: "Explain the physical track layout between Zone A, Zone B, and Zone C." }
];

function parseInlineFormatting(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="mx-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-xs text-cyan-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function FormattedMarkdown({ content }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let inCodeBlock = false;
  let codeBlockBuffer = [];

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${index}`}
            className="my-2 overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-xs text-cyan-300"
          >
            <code>{codeBlockBuffer.join("\n")}</code>
          </pre>
        );
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      return;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={index} className="mt-3 mb-1 font-semibold text-cyan-300 text-sm flex items-center gap-1">
          {line.replace("### ", "").trim()}
        </h4>
      );
      return;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={index} className="mt-4 mb-2 font-bold text-white text-base border-b border-white/10 pb-1">
          {line.replace("## ", "").trim()}
        </h3>
      );
      return;
    }

    if (line.startsWith("# ")) {
      elements.push(
        <h2 key={index} className="mt-4 mb-2 font-bold text-cyan-400 text-lg">
          {line.replace("# ", "").trim()}
        </h2>
      );
      return;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      const cleanLine = trimmed.replace(/^[-*•]\s+/, "");
      elements.push(
        <div key={index} className="my-1.5 flex items-start gap-2 text-slate-200">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
          <span className="leading-relaxed">{parseInlineFormatting(cleanLine)}</span>
        </div>
      );
      return;
    }

    if (!trimmed) {
      elements.push(<div key={index} className="h-1.5" />);
      return;
    }

    elements.push(
      <p key={index} className="my-1 leading-relaxed text-slate-200">
        {parseInlineFormatting(line)}
      </p>
    );
  });

  return <div className="space-y-0.5">{elements}</div>;
}

export default function Copilot() {
  const { token, user } = useAuth();
  const toast = useToast();

  const [messages, setMessages] = useState([
    {
      id: "init-1",
      role: "assistant",
      content: `Hello **${user?.name || "Operator"}**! I am **TransBot AI Copilot** (powered by Mistral AI \`mistral-small-2506\`).\n\n### System Overview\n- **Warehouse**: 3 Physical Zones (\`Zone A\`, \`Zone B\`, \`Zone C\`).\n- **Robot**: \`Robot-01\` (Max capacity: \`2.0 kg\` payload).\n- **Human Courier**: Tasks \`> 2.0 kg\` are assigned to Human Workers.\n\nHow can I help you manage inventory, dispatch tasks, or inspect warehouse status today?`,
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextInfo, setContextInfo] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const chatContainerRef = useRef(null);

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: "smooth"
        });
      }
    }, 50);
  }

  async function handleSend(textToSend) {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading || !token) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: queryText,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const history = messages
        .filter((m) => m.id !== "init-1")
        .map((m) => ({ role: m.role, content: m.content }));

      const data = await apiFetch("/api/copilot/chat", {
        method: "POST",
        token,
        body: JSON.stringify({ message: queryText, history })
      });

      const aiMsg = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply || "No reply generated.",
        timestamp: new Date().toISOString(),
        model: data.model
      };

      if (data.context) setContextInfo(data.context);
      setMessages((prev) => [...prev, aiMsg]);
      scrollToBottom();
    } catch (err) {
      toast.error(err?.data?.message || err?.message || "Failed to reach AI Copilot.");
      const errorMsg = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "⚠️ *Sorry, I encountered an error connecting to Mistral AI API. Please verify your backend connection.*",
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMsg]);
      scrollToBottom();
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(id, text) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Response copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="TransBot AI Copilot"
        description="Real-time intelligent warehouse assistant powered by Mistral AI (mistral-small-2506)."
        actions={
          <Badge tone="primary" className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            Mistral Small 2506
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main Chat Interface — Direct Flex Box Layout */}
        <div className="flex flex-col h-[650px] max-h-[calc(100vh-12rem)] min-h-[480px] rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-4 shrink-0 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-semibold text-base">
              <Bot className="h-5 w-5 text-cyan-300" />
              Live AI Assistant
            </div>
            <span className="text-xs text-slate-400">Context: Live Warehouse DB</span>
          </div>

          {/* Messages Scroll Area — Direct Flex-1 Scroll Container */}
          <div
            ref={chatContainerRef}
            className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 thin-scrollbar"
            style={{ overflowY: "auto", scrollbarGutter: "stable" }}
          >
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-sm leading-6 ${
                      isUser
                        ? "bg-cyan-600/90 text-white rounded-br-none shadow-lg shadow-cyan-950/50"
                        : "bg-white/5 border border-white/10 text-slate-200 rounded-bl-none backdrop-blur-xl"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2 text-[11px] text-slate-400 border-b border-white/5 pb-1">
                      <span className="font-semibold">{isUser ? "You" : "TransBot Copilot"}</span>
                      <div className="flex items-center gap-2">
                        {!isUser && (
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="hover:text-cyan-300 transition-colors p-1"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {isUser ? (
                      <div className="whitespace-pre-wrap font-sans text-sm">{msg.content}</div>
                    ) : (
                      <FormattedMarkdown content={msg.content} />
                    )}
                  </div>

                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-slate-300 border border-white/10">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  <Bot className="h-4 w-4 animate-spin" />
                </div>
                <div className="rounded-2xl rounded-bl-none bg-white/5 border border-white/10 p-4 text-xs text-cyan-300 animate-pulse">
                  Copilot is analyzing warehouse DB context...
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts Bar */}
          <div className="border-t border-white/10 p-3 bg-white/5 backdrop-blur-md shrink-0">
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(qp.prompt)}
                  disabled={loading}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300 transition-all disabled:opacity-50"
                >
                  <Zap className="inline-block h-3 w-3 mr-1 text-cyan-400" />
                  {qp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-4 border-t border-white/10 bg-slate-950/60 shrink-0"
          >
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask TransBot Copilot anything about inventory, tasks, or robot status..."
                disabled={loading}
                className="flex-1 bg-white/5 border-white/10 text-white placeholder-slate-500 focus:border-cyan-500"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !input.trim()}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
                Ask AI
              </Button>
            </div>
          </form>
        </div>

        {/* Real-time Context Side Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                Live Assistant Memory
              </CardTitle>
              <CardDescription className="text-xs">Context fed automatically into Mistral AI prompt.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="font-semibold text-cyan-300 uppercase tracking-wider text-[10px]">Robot Status</div>
                <div className="flex justify-between text-slate-300">
                  <span>Unit:</span>
                  <span className="font-medium text-white">Robot-01</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Current Zone:</span>
                  <Badge tone="info">{contextInfo?.robotZone || "Zone A"}</Badge>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Robot State:</span>
                  <Badge tone="success">{contextInfo?.robotState || "IDLE"}</Badge>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Capacity Cap:</span>
                  <span className="text-cyan-300 font-medium">2.0 kg max</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="font-semibold text-amber-300 uppercase tracking-wider text-[10px]">Dispatch Rules</div>
                <p className="text-slate-400 leading-5">
                  • Tasks <strong className="text-white">&le; 2.0 kg</strong>: Dispatched to Robot-01.
                  <br />
                  • Tasks <strong className="text-white">&gt; 2.0 kg</strong>: Assigned to Human Worker.
                  <br />
                  • Track Layout: <strong className="text-white">Zone C &larr; Zone B &larr; Zone A</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-slate-300 leading-5">
                <span className="font-semibold text-cyan-300 block mb-1">Tip for Operators:</span>
                You can ask Copilot to summarize pending orders, identify low stock items, or verify if the robot is stationed at the right zone before starting a task!
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
