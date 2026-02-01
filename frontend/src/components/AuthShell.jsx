import { Bot, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

export function AuthShell({
  children,
  productName = "TransBot",
  productTagline = "Warehouse Automation System"
}) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      {/* Animated mesh gradient background */}
      <div className="pointer-events-none absolute inset-0">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950/90 to-slate-900" />
        
        {/* Multiple animated gradient orbs */}
        <div 
          className="absolute h-[800px] w-[800px] rounded-full bg-gradient-to-r from-blue-500/30 via-purple-500/20 to-cyan-500/30 blur-3xl animate-float-slow"
          style={{
            left: `${mousePosition.x / 20}px`,
            top: `${mousePosition.y / 20}px`,
            transform: 'translate(-50%, -50%)'
          }}
        />
        <div className="absolute -top-60 -right-60 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-indigo-500/25 to-purple-600/25 blur-3xl animate-float" />
        <div className="absolute -bottom-60 -left-60 h-[700px] w-[700px] rounded-full bg-gradient-to-br from-cyan-500/25 to-blue-600/25 blur-3xl animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 blur-3xl animate-pulse-slow" />
        
        {/* Animated grid overlay */}
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:80px_80px] animate-grid-move" />
        
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.3)_100%)]" />
        
        {/* Shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white/20 animate-float-particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 10}s`
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Premium logo and branding */}
          <div className="mb-6 text-center animate-fade-in">
            {/* Glowing logo container */}
            <div className="relative mx-auto mb-4 inline-block">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-xl opacity-60 animate-pulse-glow" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/50 transition-all duration-500 hover:scale-110 hover:rotate-3">
                <Bot className="h-10 w-10 text-white drop-shadow-lg" />
                <div className="absolute -right-1 -top-1">
                  <Sparkles className="h-5 w-5 text-yellow-400 animate-sparkle" />
                </div>
              </div>
            </div>
            
            <h1 className="text-5xl font-extrabold tracking-tight mb-2">
              <span className="bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent drop-shadow-lg">
                {productName}
              </span>
            </h1>
            <p className="text-lg font-medium text-slate-300">{productTagline}</p>
          </div>

          {/* Card with premium animation */}
          <div className="relative animate-fade-in-up">
            {children}
          </div>

          {/* Footer with gradient text */}
          <div className="mt-4 text-center animate-fade-in">
            <p className="text-sm font-medium bg-gradient-to-r from-slate-400 to-slate-300 bg-clip-text text-transparent">
              Protected by advanced role-based access control
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

