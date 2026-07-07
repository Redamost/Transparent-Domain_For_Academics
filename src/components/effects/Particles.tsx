'use client';

import { useEffect, useRef } from 'react';

interface ParticlesProps {
  count?: number;
  color?: string;
  direction?: 'up' | 'down';
}

export function Particles({ count = 60, color = 'rgba(255,255,255,0.35)', direction = 'up' }: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const isDown = direction === 'down';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.scale(dpr, dpr);
    }

    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      opacity: number;
      life: number;
      maxLife: number;
    }

    const particles: Particle[] = [];

    function spawn() {
      particles.push({
        x: Math.random() * width,
        y: isDown ? -10 : height + Math.random() * 20,
        size: Math.random() * 1.5 + 0.5,
        speedY: isDown ? Math.random() * 0.6 + 0.2 : -(Math.random() * 0.6 + 0.2),
        speedX: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.2,
        life: 0,
        maxLife: Math.random() * 300 + 200,
      });
    }

    // Initial batch
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: isDown ? Math.random() * height * 0.5 : Math.random() * height,
        size: Math.random() * 1.5 + 0.5,
        speedY: isDown ? Math.random() * 0.6 + 0.2 : -(Math.random() * 0.6 + 0.2),
        speedX: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.2,
        life: Math.random() * 200,
        maxLife: Math.random() * 300 + 200,
      });
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.speedX;
        p.y += p.speedY;

        const lifeRatio = p.life / p.maxLife;
        const fadeIn = Math.min(lifeRatio * 10, 1);
        const fadeOut = lifeRatio > 0.8 ? 1 - (lifeRatio - 0.8) * 5 : 1;
        const alpha = p.opacity * fadeIn * fadeOut;

        if (p.life >= p.maxLife || (isDown ? p.y > height + 10 : p.y < -10)) {
          particles.splice(i, 1);
          continue;
        }

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = color.replace(/[\d.]+\)$/, `${alpha})`);
        ctx!.fill();
      }

      // Spawn new particles to maintain count
      if (particles.length < count && Math.random() < 0.3) {
        spawn();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [count, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        ...(isDown ? { top: 0 } : { bottom: 0 }),
        left: 0,
        width: '100%',
        height: '40%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}
