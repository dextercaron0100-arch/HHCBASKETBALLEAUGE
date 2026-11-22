"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import type { BufferGeometry, MeshStandardMaterial } from "three";

export default function RotatingTrophy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const updateRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let started = false;
    let visible = false;
    let cleanup: (() => void) | undefined;

    async function initialize() {
      try {
        const [THREE, { RoomEnvironment }] = await Promise.all([
          import("three"),
          import("three/addons/environments/RoomEnvironment.js"),
        ]);
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({ canvas: canvas!, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(180, 166, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.5;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 180 / 166, 0.1, 30);
        camera.position.set(0, 0.45, 6.5);
        camera.lookAt(0, 0.16, 0);
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const environment = pmrem.fromScene(room, 0.04);
        scene.environment = environment.texture;
        room.dispose();
        pmrem.dispose();

        const gold = new THREE.MeshStandardMaterial({ color: 0xe6b54f, metalness: 1, roughness: 0.2 });
        const darkGold = new THREE.MeshStandardMaterial({ color: 0x704712, metalness: 0.9, roughness: 0.28 });
        const black = new THREE.MeshStandardMaterial({ color: 0x121315, metalness: 0.6, roughness: 0.25 });
        const trophy = new THREE.Group();
        scene.add(trophy);
        function add(geometry: BufferGeometry, material: MeshStandardMaterial, y: number) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.y = y;
          trophy.add(mesh);
          return mesh;
        }
        // A sculpted gold basketball above a tapered pedestal, modeled in 3D.
        add(new THREE.CylinderGeometry(0.65, 0.72, 0.14, 64), black, -1.05);
        add(new THREE.CylinderGeometry(0.64, 0.64, 0.07, 64), gold, -0.95);
        add(new THREE.CylinderGeometry(0.54, 0.61, 0.2, 64), darkGold, -0.82);
        const stem = add(new THREE.CylinderGeometry(0.16, 0.42, 1.12, 4), gold, -0.18);
        stem.rotation.y = Math.PI / 4;
        stem.rotation.z = -0.14;
        add(new THREE.CylinderGeometry(0.27, 0.15, 0.12, 48), gold, 0.4);
        const ball = new THREE.Group();
        ball.position.set(0.05, 0.9, 0);
        ball.rotation.set(0.28, 0.1, -0.28);
        trophy.add(ball);
        ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.58, 48, 32), gold));
        for (const rotation of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
          const seam = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.012, 8, 80), darkGold);
          seam.rotation.set(...rotation as [number, number, number]);
          ball.add(seam);
        }
        const key = new THREE.DirectionalLight(0xfff3d4, 4);
        key.position.set(-3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 3);
        rim.position.set(3, 2, -2);
        scene.add(rim, new THREE.HemisphereLight(0xffe4ac, 0x302515, 1.5));
        trophy.rotation.y = -0.45;
        renderer.render(scene, camera);

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        let lastTime = 0;
        const animate = (time: number) => {
          const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
          lastTime = time;
          trophy.rotation.y += delta * 0.48;
          renderer.render(scene, camera);
        };
        const update = () => {
          lastTime = 0;
          renderer.setAnimationLoop(visible && !document.hidden && !reduced.matches ? animate : null);
        };
        updateRef.current = update;
        reduced.addEventListener("change", update);
        document.addEventListener("visibilitychange", update);
        cleanup = () => {
          renderer.setAnimationLoop(null);
          reduced.removeEventListener("change", update);
          document.removeEventListener("visibilitychange", update);
          scene.traverse(object => {
            if (object instanceof THREE.Mesh) object.geometry.dispose();
          });
          gold.dispose(); darkGold.dispose(); black.dispose();
          environment.dispose();
          renderer.dispose();
          updateRef.current = null;
        };
        setReady(true);
        update();
      } catch {
        // Keep the gold fallback visible on devices without WebGL support.
        cleanup?.();
      }
    }
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible && !started) { started = true; void initialize(); }
      updateRef.current?.();
    });
    observer.observe(canvas);
    return () => { disposed = true; observer.disconnect(); cleanup?.(); };
  }, []);

  return <div className={`trophy-turntable ${ready ? "is-ready" : ""}`}>
    <canvas ref={canvasRef} role="img" aria-label="Rotating three-dimensional gold basketball championship trophy" />
    {!ready && <Trophy className="trophy-fallback" size={68} strokeWidth={1} aria-hidden="true" />}
  </div>;
}
