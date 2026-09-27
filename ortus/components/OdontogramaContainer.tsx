'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import Odontogram3D from './Odontogram3D';

export default function OdontogramaContainer() {
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    const updateDpr = () => setDpr(Math.min(window.devicePixelRatio || 1, 1.5));
    updateDpr();
    window.addEventListener('resize', updateDpr);
    return () => window.removeEventListener('resize', updateDpr);
  }, []);

  return (
    <div className="h-[min(68vh,560px)] min-h-[320px] w-full overflow-hidden rounded-xl bg-[#f4f6f8] sm:min-h-[420px]">
      <Canvas
        // demand: só renderiza quando algo muda — sem loop de 60fps travando a CPU
        frameloop="demand"
        shadows={false}
        dpr={dpr}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#f1f5f9', 1);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
        }}
        camera={{ position: [0, 0.2, 12], fov: 35 }}
      >
        {/* Luzes locais no lugar de <Environment> — evita baixar HDR e processar PMREM */}
        <ambientLight intensity={1.35} />
        <directionalLight position={[10, 10, 10]} intensity={1.3} castShadow={false} />
        <directionalLight position={[-6, 4, -4]} intensity={0.45} castShadow={false} />
        <directionalLight position={[0, -6, 6]} intensity={0.25} castShadow={false} />
        <Bounds fit clip observe margin={1.45}>
          <Odontogram3D />
        </Bounds>
        <OrbitControls makeDefault enablePan={false} minDistance={2} maxDistance={24} />
      </Canvas>
    </div>
  );
}
