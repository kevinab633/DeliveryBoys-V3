import { useMemo } from 'react';
import MicroSlats from './MicroSlats';

/** Brand treatment used behind hero/auth content. The mask softens the lower
 * edge so the effect fades into the next section rather than stopping sharply. */
export default function MicroSlatsBackdrop() {
  // Keep the brand treatment rich on capable devices, but avoid continuous
  // WebGL work and pointer-fluid simulation on small or low-power phones.
  const lowPowerDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 640px) and (pointer: coarse)').matches
      || (navigator.hardwareConcurrency || 8) <= 4;
  }, []);

  return (
    <div className="micro-slats-backdrop absolute inset-0 pointer-events-none" aria-hidden="true">
      <MicroSlats
        preset="swell"
        color="#C41E1E"
        glintColor="#FFF1F1"
        backgroundColor="transparent"
        slatWidth={10}
        slatHeight={25}
        gap={3}
        roundness={0.75}
        interactive={!lowPowerDevice}
        cursorStrength={lowPowerDevice ? 0 : 1}
        cursorSize={40}
        swirl={0}
        trail={1.4}
        lean={0}
        intro={!lowPowerDevice}
        scale={lowPowerDevice ? 1.25 : 1.5}
        speed={lowPowerDevice ? 0 : 0.6}
        direction={250}
        chop={0.55}
        stretch={0}
        glint={0.7}
        contrast={1.25}
        perspective={0.55}
        fog={0.55}
        introDuration={1.5}
        paused={false}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
