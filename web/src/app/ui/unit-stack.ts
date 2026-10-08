import { Component, ElementRef, OnDestroy, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Theme } from '../core/theme';
import { blockLine, blockedBy, houseUnits } from '../core/nesting';
import { prefersReducedMotion } from '../core/motion';
import { InView } from './in-view';

type Palette = { paper: string; ink: string; terracotta: string; raised: string; line: string };

@Component({
  selector: 'app-unit-stack',
  imports: [InView],
  template: `
    <div class="stack" appInView>
      <div class="stage" #stage [attr.data-mode]="mode()">
        <svg class="plan" viewBox="0 0 640 420" role="img" [attr.aria-label]="line()">
          <rect class="vol shell" [class.hot]="hot('four')" x="24" y="28" width="592" height="364" pathLength="1" />
          <text class="plan-label" x="40" y="58">4-bed</text>
          <rect class="vol" [class.hot]="hot('three')" x="44" y="84" width="348" height="284" pathLength="1" />
          <text class="plan-label" x="60" y="114">3-bed</text>
          <rect class="vol solid" [class.hot]="hot('two')" x="68" y="176" width="196" height="164" pathLength="1" />
          <text class="plan-label" x="84" y="206">2-bed</text>
          <rect class="vol solid" [class.hot]="hot('studio')" x="424" y="84" width="168" height="164" pathLength="1" />
          <text class="plan-label" x="440" y="114">Studio</text>
        </svg>
        <canvas #gl aria-hidden="true"></canvas>
      </div>
      <div class="toggle" role="group" aria-label="Preview a booking">
        @for (unit of units; track unit.id) {
          <button type="button" [class.active]="picked() === unit.id" (click)="pick(unit.id)">{{ unit.name }}</button>
        }
        <button type="button" class="text-btn" (click)="pick(null)">Clear</button>
      </div>
      <p class="quiet" aria-live="polite">{{ line() }}</p>
    </div>
  `,
})
export class UnitStack implements OnDestroy {
  private readonly theme = inject(Theme);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('gl');
  private release: () => void = () => {};
  private dead = false;
  private readonly colors: Palette = {
    paper: '#faf9f5',
    ink: '#1f1e1d',
    terracotta: '#d97757',
    raised: '#fffdf8',
    line: '#e4e0d6',
  };

  readonly units = houseUnits;
  readonly mode = signal<'svg' | 'webgl'>('svg');
  readonly picked = signal<string | null>(null);
  readonly blocked = computed(() => {
    const id = this.picked();
    return id ? blockedBy(id) : [];
  });
  readonly line = computed(() => blockLine(this.picked()));

  constructor() {
    effect(() => {
      this.theme.theme();
      untracked(() => this.readColors());
    });
    afterNextRender(() => {
      void this.mount();
    });
  }

  ngOnDestroy(): void {
    this.dead = true;
    this.release();
  }

  pick(id: string | null): void {
    this.picked.set(this.picked() === id ? null : id);
  }

  hot(id: string): boolean {
    return this.blocked().includes(id);
  }

  private readColors(): void {
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;
    this.colors.paper = read('--paper', this.colors.paper);
    this.colors.ink = read('--ink', this.colors.ink);
    this.colors.terracotta = read('--terracotta', this.colors.terracotta);
    this.colors.raised = read('--raised', this.colors.raised);
    this.colors.line = read('--line', this.colors.line);
  }

  private async mount(): Promise<void> {
    if (prefersReducedMotion()) {
      return;
    }
    const canvas = this.canvas()?.nativeElement;
    const stage = this.stage()?.nativeElement;
    if (!canvas || !stage) {
      return;
    }
    let started = false;
    const gate = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || started) {
        return;
      }
      started = true;
      gate.disconnect();
      void this.startWebgl(canvas, stage);
    });
    gate.observe(stage);
    this.release = () => gate.disconnect();
  }

  private async startWebgl(canvas: HTMLCanvasElement, stage: HTMLElement): Promise<void> {
    try {
      const THREE = await import('three');
      if (this.dead) {
        return;
      }
      this.readColors();
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
      camera.position.set(5.6, 3.8, 6.8);
      camera.lookAt(0, -0.25, 0);

      scene.add(new THREE.HemisphereLight(0xfff6ea, 0x2a2622, 0.9));
      const key = new THREE.DirectionalLight(0xfff1e4, 2.5);
      key.position.set(4.5, 8, 4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 24;
      key.shadow.camera.left = -6;
      key.shadow.camera.right = 6;
      key.shadow.camera.top = 6;
      key.shadow.camera.bottom = -6;
      scene.add(key);
      const rim = new THREE.DirectionalLight(this.colors.terracotta, 0.45);
      rim.position.set(-5, 2.5, -3);
      scene.add(rim);

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(6.5, 48),
        new THREE.MeshStandardMaterial({ color: this.colors.paper, roughness: 1 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1.32;
      ground.receiveShadow = true;
      scene.add(ground);

      const group = new THREE.Group();
      scene.add(group);

      const black = new THREE.Color('#000000');
      const volumes = [
        this.volume(THREE, 'four', 4.6, 2.15, 3.3, 0, -0.225, 0, true),
        this.volume(THREE, 'three', 2.7, 1.7, 2.5, -0.75, -0.45, 0, true),
        this.volume(THREE, 'two', 1.45, 0.9, 1.4, -1.05, -0.85, 0.08, false),
        this.volume(THREE, 'studio', 1.2, 1.05, 1.25, 1.35, -0.775, 0.12, false),
      ];
      for (const volume of volumes) {
        group.add(volume.mesh);
      }

      const resize = (): void => {
        const width = stage.clientWidth || 1;
        const height = stage.clientHeight || 1;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      };
      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);

      let visible = false;
      let onStage = false;
      let raf = 0;
      let alive = true;
      let dragging = false;
      let lastX = 0;
      const clock = new THREE.Clock();
      const paint = (): void => {
        const dt = Math.min(clock.getDelta(), 0.05);
        if (!dragging) {
          group.rotation.y += dt * 0.22;
        }
        ground.material.color.set(this.colors.paper);
        rim.color.set(this.colors.terracotta);
        for (const volume of volumes) {
          const hot = this.hot(volume.id);
          const color = hot ? this.colors.terracotta : volume.shell ? this.colors.raised : this.colors.line;
          volume.material.color.lerp(new THREE.Color(color), 0.16);
          volume.material.emissive.lerp(hot ? new THREE.Color(this.colors.terracotta) : black, 0.16);
          const opacity = volume.shell ? (hot ? 0.42 : 0.16) : 1;
          volume.material.opacity += (opacity - volume.material.opacity) * 0.16;
          volume.edges.color.lerp(new THREE.Color(hot ? this.colors.terracotta : this.colors.ink), 0.16);
        }
        renderer.render(scene, camera);
      };
      const loop = (): void => {
        if (!alive || !visible) {
          return;
        }
        raf = requestAnimationFrame(loop);
        paint();
      };
      const sync = (): void => {
        const next = onStage && document.visibilityState !== 'hidden';
        if (next && !visible) {
          visible = true;
          clock.getDelta();
          loop();
          return;
        }
        if (!next && visible) {
          visible = false;
          cancelAnimationFrame(raf);
        }
      };
      const onScreen = new IntersectionObserver((entries) => {
        onStage = entries.some((entry) => entry.isIntersecting);
        sync();
      });
      onScreen.observe(stage);
      const onHide = (): void => sync();
      document.addEventListener('visibilitychange', onHide);

      const down = (event: PointerEvent): void => {
        dragging = true;
        lastX = event.clientX;
        canvas.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent): void => {
        if (!dragging) {
          return;
        }
        group.rotation.y += (event.clientX - lastX) * 0.008;
        lastX = event.clientX;
      };
      const up = (): void => {
        dragging = false;
      };
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);

      this.release = () => {
        alive = false;
        cancelAnimationFrame(raf);
        onScreen.disconnect();
        resizeObserver.disconnect();
        document.removeEventListener('visibilitychange', onHide);
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        for (const volume of volumes) {
          volume.mesh.geometry.dispose();
          volume.material.dispose();
          volume.edgeGeometry.dispose();
        }
        ground.geometry.dispose();
        ground.material.dispose();
        renderer.dispose();
      };
      this.mode.set('webgl');
    } catch {
      this.mode.set('svg');
    }
  }

  private volume(
    THREE: typeof import('three'),
    id: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    shell: boolean,
  ): {
    id: string;
    shell: boolean;
    mesh: import('three').Mesh;
    material: import('three').MeshPhysicalMaterial;
    edges: import('three').LineBasicMaterial;
    edgeGeometry: import('three').EdgesGeometry;
  } {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshPhysicalMaterial({
      color: shell ? this.colors.ink : this.colors.raised,
      roughness: shell ? 0.28 : 0.62,
      metalness: 0,
      clearcoat: shell ? 0.35 : 0.12,
      clearcoatRoughness: 0.45,
      transparent: true,
      opacity: shell ? 0.16 : 1,
      depthWrite: !shell,
      emissive: '#000000',
      emissiveIntensity: 0.35,
      side: shell ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = !shell;
    mesh.receiveShadow = true;
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edges = new THREE.LineBasicMaterial({ color: this.colors.ink });
    mesh.add(new THREE.LineSegments(edgeGeometry, edges));
    return { id, shell, mesh, material, edges, edgeGeometry };
  }
}
