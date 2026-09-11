import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function AvatarScene({ speaking, mouthShape }) {
  const mount = useRef(null);
  const speakingRef = useRef(speaking);
  const mouthRef = useRef(mouthShape);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => { mouthRef.current = mouthShape; }, [mouthShape]);

  useEffect(() => {
    const node = mount.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, node.clientWidth / node.clientHeight, .1, 100);
    camera.position.set(0, .65, 14.8);
    camera.lookAt(0, .65, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(node.clientWidth, node.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    node.appendChild(renderer.domElement);

    const avatar = new THREE.Group(); avatar.position.y = -.62; scene.add(avatar);
    const material = (color, roughness = .7) => new THREE.MeshStandardMaterial({ color, roughness, metalness: .02 });
    const skin = material('#c68b76'); const skinShadow = material('#a96e63'); const shirt = material('#2e3a52', .58); const trouser = material('#202938', .65); const hair = material('#2d2726', .85); const shoe = material('#15191f', .55); const lip = material('#8a4750'); const iris = material('#282d38', .35); const eyeWhite = material('#f4f1ed', .45);
    const add = (geometry, surface, position, scale) => { const mesh = new THREE.Mesh(geometry, surface); mesh.position.set(...position); if (scale) mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; avatar.add(mesh); return mesh; };

    add(new THREE.CapsuleGeometry(.9, 1.55, 8, 18), shirt, [0, 1.25, 0], [1.16, 1, .62]);
    add(new THREE.BoxGeometry(1.42, .34, .72), trouser, [0, -.66, 0]);
    add(new THREE.CylinderGeometry(.37, .44, .65, 24), skinShadow, [0, 2.56, 0]);
    add(new THREE.SphereGeometry(1, 40, 32), skin, [0, 3.75, 0], [.9, 1.13, .83]);
    add(new THREE.SphereGeometry(1.01, 36, 22, 0, Math.PI * 2, 0, 1.52), hair, [0, 4.07, .02], [.91, 1.13, .85]);
    add(new THREE.SphereGeometry(.5, 24, 16), hair, [-.1, 4.45, .67], [1.55, .4, .45]).rotation.z = -.08;
    [[-.36, 3.87], [.36, 3.87]].forEach(([x, y]) => { add(new THREE.SphereGeometry(.15, 16, 12), eyeWhite, [x, y, .71], [1, .72, 1]); add(new THREE.SphereGeometry(.07, 16, 12), iris, [x, y, .83]); });
    add(new THREE.CapsuleGeometry(.08, .18, 6, 12), skinShadow, [0, 3.57, .79]).rotation.z = Math.PI / 2;
    const mouth = add(new THREE.SphereGeometry(.22, 18, 12), lip, [0, 3.25, .79], [1.15, .18, .22]);
    [-1, 1].forEach(side => add(new THREE.SphereGeometry(.17, 16, 12), skinShadow, [side * .87, 3.72, 0], [.62, 1, .48]));
    [-1, 1].forEach(side => { add(new THREE.CapsuleGeometry(.21, 1.18, 8, 14), shirt, [side * 1.1, 1.18, 0]); add(new THREE.SphereGeometry(.23, 16, 12), skin, [side * 1.1, .43, .02], [.75, 1.1, .65]); });
    [-1, 1].forEach(side => { add(new THREE.CapsuleGeometry(.34, 1.16, 8, 16), trouser, [side * .44, -1.56, 0]); add(new THREE.CapsuleGeometry(.29, 1.08, 8, 16), trouser, [side * .44, -2.86, .02]); add(new THREE.BoxGeometry(.58, .25, .98), shoe, [side * .44, -3.58, .28]); });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.7, 64), new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: .92 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -4.08; floor.receiveShadow = true; scene.add(floor);
    const key = new THREE.DirectionalLight('#fff4ea', 3.2); key.position.set(4, 7, 5); key.castShadow = true; scene.add(key);
    const fill = new THREE.DirectionalLight('#c6d3e7', 1.7); fill.position.set(-5, 3, 3); scene.add(fill);
    scene.add(new THREE.AmbientLight('#eef1f7', 1.9));

    const resize = () => { camera.aspect = node.clientWidth / node.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(node.clientWidth, node.clientHeight); };
    window.addEventListener('resize', resize);
    const clock = new THREE.Clock(); let frame;
    const animate = () => { const t = clock.getElapsedTime(); const active = speakingRef.current; mouth.scale.y = active ? .22 + mouthRef.current * .85 + Math.abs(Math.sin(t * 14)) * .08 : .18; mouth.scale.x = 1.15 + (active ? mouthRef.current * .1 : 0); avatar.rotation.y = Math.sin(t * .35) * .025; avatar.position.y = -.62 + Math.sin(t * .9) * .018; renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
    animate();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); renderer.dispose(); node.removeChild(renderer.domElement); };
  }, []);
  return <div ref={mount} className="avatar-canvas" aria-label="Standing 3D avatar of Aiden" />;
}
