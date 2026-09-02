'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import Odontogram3D from './Odontogram3D';

export default function OdontogramaContainer() {
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    const updateDpr = () => setDpr(Math.min(window.devicePixelRatio || 1, 2));
    updateDpr();
    window.addEventListener('resize', updateDpr);
    return () => window.removeEventListener('resize', updateDpr);
  }, []);

  return (
    <div className="w-full h-[600px] bg-slate-100 rounded-xl shadow-inner overflow-hidden">
      <Canvas
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
        camera={{ position: [0, 0, 10], fov: 45 }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow={false} />
        <directionalLight position={[-6, 4, -4]} intensity={0.35} castShadow={false} />
        <Odontogram3D />
        <OrbitControls enablePan={false} minDistance={3} maxDistance={15} />
        <Environment preset="studio" environmentIntensity={0.45} />
      </Canvas>
    </div>
  );
}