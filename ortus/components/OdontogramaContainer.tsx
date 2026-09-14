'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center, OrbitControls } from '@react-three/drei';
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
    <div className="h-[380px] w-full overflow-hidden rounded-xl bg-slate-100 shadow-inner sm:h-[480px] md:h-[600px]">
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
        camera={{ position: [0, 0, 8], fov: 42 }}
      >
        {/* Luzes locais no lugar de <Environment> — evita baixar HDR e processar PMREM */}
        <ambientLight intensity={1.35} />
        <directionalLight position={[10, 10, 10]} intensity={1.3} castShadow={false} />
        <directionalLight position={[-6, 4, -4]} intensity={0.45} castShadow={false} />
        <directionalLight position={[0, -6, 6]} intensity={0.25} castShadow={false} />
        <Center disableZ>
          <Odontogram3D />
        </Center>
        <OrbitControls enablePan={false} minDistance={4} maxDistance={14} target={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
