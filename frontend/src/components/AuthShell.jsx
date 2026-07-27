import { useEffect, useState } from "react";

const particles = Array.from({ length: 18 }, (_, index) => {
  const seed = index + 1;
  return {
    left: `${(seed * 37) % 100}%`,
    top: `${(seed * 53) % 100}%`,
    delay: `${(seed % 5) * 0.8}s`,
    duration: `${8 + (seed % 7)}s`
  };
});

export function AuthShell({ children }) {
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({
        x: (event.clientX / window.innerWidth) * 100,
        y: (event.clientY / window.innerHeight) * 100
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl animate-float" />
        <div className="absolute right-[-7rem] top-[18%] h-80 w-80 rounded-full bg-purple-500/20 blur-3xl animate-float-slow" />
        <div className="absolute bottom-[-8rem] left-[30%] h-96 w-96 rounded-full bg-cyan-500/25 blur-3xl animate-float-delayed" />
        <div
          className="absolute h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 blur-3xl transition-all duration-300 ease-out animate-pulse-glow"
          style={{ left: `${mousePosition.x}%`, top: `${mousePosition.y}%` }}
        />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:64px_64px] animate-grid-move" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_28%)]" />
      </div>

      <div className="pointer-events-none absolute inset-0">
        {particles.map((particle, index) => (
          <div
            key={index}
            className="absolute h-1 w-1 rounded-full bg-white/25 animate-float-particle"
            style={{
              left: particle.left,
              top: particle.top,
              animationDelay: particle.delay,
              animationDuration: particle.duration
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-[430px]">{children}</div>
      </div>
    </div>
  );
}
