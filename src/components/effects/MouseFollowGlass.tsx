'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface MouseFollowGlassProps {
  children?: ReactNode;
  className?: string;
  enableCursorGlow?: boolean;
}

export function MouseFollowGlass({
  children,
  className = '',
  enableCursorGlow = true,
}: MouseFollowGlassProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const currentRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Capture narrowed reference for closures (TS loses narrowing across function boundaries)
    const el = container;

    function handleMouseMove(e: MouseEvent) {
      const rect = el.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    }

    function animate() {
      // Smooth lerp
      const lerp = 0.08;
      currentRef.current.x += (mouseRef.current.x - currentRef.current.x) * lerp;
      currentRef.current.y += (mouseRef.current.y - currentRef.current.y) * lerp;

      const xPercent = currentRef.current.x * 100;
      const yPercent = currentRef.current.y * 100;

      // Update CSS variables on the container
      el.style.setProperty('--mouse-x', `${xPercent}%`);
      el.style.setProperty('--mouse-y', `${yPercent}%`);

      // Dynamic glass opacity based on mouse proximity to center
      const distFromCenter = Math.sqrt(
        Math.pow(currentRef.current.x - 0.5, 2) +
        Math.pow(currentRef.current.y - 0.5, 2)
      );
      const opacity = 0.04 + (1 - Math.min(distFromCenter * 2, 1)) * 0.08;
      const blur = 16 + (1 - Math.min(distFromCenter * 2, 1)) * 12;

      el.style.setProperty('--glass-opacity', String(opacity));
      el.style.setProperty('--glass-blur', `${blur}px`);

      rafRef.current = requestAnimationFrame(animate);
    }

    el.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Cursor glow position
  useEffect(() => {
    if (!enableCursorGlow) return;
    const glow = glowRef.current;
    if (!glow) return;
    // Capture narrowed reference for closure
    const glowEl = glow;

    function moveGlow(e: MouseEvent) {
      glowEl.style.left = `${e.clientX}px`;
      glowEl.style.top = `${e.clientY}px`;
    }

    window.addEventListener('mousemove', moveGlow);
    return () => window.removeEventListener('mousemove', moveGlow);
  }, [enableCursorGlow]);

  return (
    <div ref={containerRef} className={className}>
      {enableCursorGlow && (
        <div ref={glowRef} className="cursor-glow hidden md:block" />
      )}
      {children}
    </div>
  );
}
