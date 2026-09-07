import { useCallback } from 'react';
import confetti from 'canvas-confetti';

export function useConfetti() {
  // Standard celebration — all habits done for the day
  const firePerfectDay = useCallback(() => {
    const duration = 2500;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#2563eb', '#22c55e', '#f59e0b', '#ec4899'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#2563eb', '#22c55e', '#f59e0b', '#ec4899'],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  // Milestone celebration (streak 7 / 30 / 100)
  const fireMilestone = useCallback(() => {
    const count = 200;
    const defaults = { origin: { y: 0.7 } };

    const fire = (particleRatio, opts) =>
      confetti({ ...defaults, ...opts, particleCount: Math.floor(count * particleRatio) });

    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2,  { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1,  { spread: 120, startVelocity: 45 });
  }, []);

  // Quick single habit completion pop
  const fireSmall = useCallback(() => {
    confetti({
      particleCount: 30,
      spread: 50,
      origin: { y: 0.8 },
      scalar: 0.6,
      colors: ['#2563eb', '#22c55e', '#93c5fd'],
    });
  }, []);

  return { firePerfectDay, fireMilestone, fireSmall };
}
