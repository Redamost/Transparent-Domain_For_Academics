'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number counting up from 0 to the target value.
 * Uses an IntersectionObserver to trigger when the element becomes visible.
 */
export function useCountUp(target: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Observe visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Count-up animation
  useEffect(() => {
    if (!isVisible) return;

    let startTime: number | null = null;
    let animationId = 0;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    // Small initial delay so the scroll-reveal transition can start first
    const delayId = setTimeout(() => {
      animationId = requestAnimationFrame(animate);
    }, 300);

    return () => {
      clearTimeout(delayId);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [target, duration, isVisible]);

  return { count, ref };
}
