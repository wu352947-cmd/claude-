// PLACEHOLDER — to be implemented (see SCRIPT.md).
export default {
  async init({ THREE, aspect }) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
    return { scene, camera, clearColor: 0x050506 };
  },
  update() {},
};
