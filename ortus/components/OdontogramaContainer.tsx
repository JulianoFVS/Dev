'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center, OrbitControls, Environment } from '@react-three/drei';
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
          logarithmicDepthBuffer: true,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#f1f5f9', 1);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
        }}
        camera={{ position: [0, 0, 7], fov: 42 }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 8, 6]} intensity={1.1} castShadow={false} />
        <directionalLight position={[-4, 3, -3]} intensity={0.4} castShadow={false} />
        <Center disableZ>
          <Odontogram3D />
        </Center>
        <OrbitControls
          enablePan={false}
          minDistance={4}
          maxDistance={12}
          target={[0, 0, 0]}
        />
        <Environment preset="studio" environmentIntensity={0.35} />
      </Canvas>
    </div>
  );
}