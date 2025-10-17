// --- TAILWIND CONFIG ---
tailwind.config = {
    theme: {
        extend: {
            colors: {
                'black': '#000000',
                'accent': '#FFC700',
                'accent-hover': '#FDB813',
                'gray-dark': '#1d1d1f', // Apple dark grey
                'gray-light': '#86868b', // Apple light grey
                'off-white': '#f5f5f7', // Apple off-white
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
        }
    }
}

// --- GSAP ---
gsap.registerPlugin(ScrollTrigger);

// --- UTILITY FUNCTIONS ---
function animateOnScroll(selector, trigger, options = {}) {
    const elems = gsap.utils.toArray(selector);
    elems.forEach(elem => {
        gsap.from(elem, {
            opacity: 0,
            y: 50,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: trigger || elem,
                start: 'top 85%',
                toggleActions: 'play none none reverse',
                ...options.scrollTrigger,
            },
            ...options
        });
    });
}

function animateSectionZoom(selector, trigger) {
    gsap.from(selector, {
        scale: 0.92,
        opacity: 0,
        y: 60,
        duration: 1.2,
        ease: 'power4.out',
        scrollTrigger: {
            trigger: trigger || selector,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
        }
    });
}

// --- ANIMATION MODULES ---

function initHeroAnimations() {
    gsap.from('header', { y: -20, opacity: 0, duration: 1, ease: 'power3.out', delay: 0.5 });
    gsap.from('.hero-headline span', { y: 100, opacity: 0, stagger: 0.1, duration: 1, ease: 'power3.out', delay: 0.8 });
    gsap.from(['.hero-subheadline', '.hero-cta'], { y: 50, opacity: 0, duration: 1, ease: 'power3.out', delay: 1.2 });
}

function initShowcaseAnimation() {
    const showcase = document.querySelector('.code-showcase');
    const panel = document.querySelector('.ide-mockup');
    const container = document.querySelector('.pin-container');

    gsap.fromTo(panel, {
        scale: 0.85, opacity: 0, filter: 'blur(12px)', rotateY: -10, rotateX: 8
    }, {
        scale: 1, opacity: 1, filter: 'blur(0px)',
        rotateY: 0, rotateX: 0, duration: 1.6, ease: 'power4.out',
        scrollTrigger: {
            trigger: showcase,
            start: 'top 80%',
            end: 'top 40%',
            scrub: 1,
        }
    });

    gsap.to(panel, {
        boxShadow: '0 0 80px 0 rgba(97,218,251,0.25), 0 40px 80px -25px rgba(0,0,0,0.7)',
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
    });

    // --- 3D TILT INTERACTION ---
    const ROTATION_STRENGTH = 15;

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const { width, height, left, top } = rect;
        
        const mouseX = (e.clientX - left) / width - 0.5;
        const mouseY = (e.clientY - top) / height - 0.5;

        const rotateX = -mouseY * ROTATION_STRENGTH; 
        const rotateY = mouseX * ROTATION_STRENGTH;

        gsap.to(panel, {
            duration: 0.5,
            rotationX: rotateX,
            rotationY: rotateY,
            ease: 'power1.out',
            '--x': `${(mouseX + 0.5) * 100}%`,
            '--y': `${(mouseY + 0.5) * 100}%`
        });
    });

    container.addEventListener('mouseleave', () => {
        gsap.to(panel, {
            duration: 1,
            rotationY: 0,
            rotationX: 0,
            ease: 'elastic.out(1, 0.5)',
        });
    });
}


// --- Three.js for Feature Cards ---
function initMiniThreeCanvas(canvasId, geometryType) {
    const canvas = document.querySelector(canvasId);
    if (!canvas) return;

    const scene = new THREE.Scene();
    const container = canvas.parentElement;
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    let geometry;
    switch(geometryType) {
        case 'cube':
            geometry = new THREE.BoxGeometry(3, 3, 3);
            break;
        case 'knot':
            geometry = new THREE.TorusKnotGeometry(2, 0.5, 100, 16);
            break;
        case 'sphere':
            geometry = new THREE.SphereGeometry(2.5, 32, 32);
            break;
    }

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 0.5, roughness: 0.5, wireframe: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    camera.position.z = 5;

    let animationRequestId;
    const animate = () => {
        mesh.rotation.x += 0.002;
        mesh.rotation.y += 0.003;
        renderer.render(scene, camera);
        animationRequestId = requestAnimationFrame(animate);
    };

    ScrollTrigger.create({
        trigger: container,
        start: "top bottom",
        end: "bottom top",
        onEnter: () => { if (!animationRequestId) animate(); },
        onLeave: () => { cancelAnimationFrame(animationRequestId); animationRequestId = null; },
        onEnterBack: () => { if (!animationRequestId) animate(); },
        onLeaveBack: () => { cancelAnimationFrame(animationRequestId); animationRequestId = null; },
    });
}

function initFeatureAnimations() {
    const section = document.querySelector('#features');
    animateOnScroll('.section-title', section);
    animateOnScroll('.section-subtitle', section, { delay: 0.2 });

    gsap.utils.toArray('.feature-card').forEach((card, i) => {
        gsap.from(card, {
            opacity: 0, y: 50, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: card, start: 'top 85%', toggleActions: 'play none none reverse' },
            delay: i * 0.15 + 0.4
        });
    });
    
    initMiniThreeCanvas('#feature-canvas-1', 'cube');
    initMiniThreeCanvas('#feature-canvas-2', 'knot');
    initMiniThreeCanvas('#feature-canvas-3', 'sphere');
}


function initCTAAnimations() {
    const section = document.querySelector('.final-cta');
    animateOnScroll('.cta-headline', section);
    animateOnScroll('.final-cta-btn', section, { delay: 0.2 });
}

// --- Three.js for Final CTA ---
function initFinalCTAThreeJS() {
    const canvas = document.querySelector('#cta-canvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new THREE.TorusGeometry(5, 1.5, 20, 120);
    const material = new THREE.PointsMaterial({
        color: 0xffc700, size: 0.03, transparent: true, opacity: 0.6
    });

    const points = new THREE.Points(geometry, material);
    points.rotation.x = Math.PI / 4;
    scene.add(points);
    camera.position.z = 10;
    
    const mouse = new THREE.Vector2();
    document.querySelector('.final-cta').addEventListener('mousemove', (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ( (event.clientX - rect.left) / rect.width ) * 2 - 1;
        mouse.y = - ( (event.clientY - rect.top) / rect.height ) * 2 + 1;
    });

    const clock = new THREE.Clock();
    const animate = () => {
        const elapsedTime = clock.getElapsedTime();
        points.rotation.y = elapsedTime * 0.1;

        gsap.to(camera.position, {
            x: mouse.x * 2,
            y: mouse.y * 2,
            duration: 2,
            ease: "power2.out"
        });
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
}


// --- 3D Shape Overlay (Hero) ---
let threeCamera;
function initThreeJSOverlay() {
    const canvas = document.querySelector('#three-canvas');
    if (!canvas || !window.THREE) return;

    const scene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const shapes = [];
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.6,
        roughness: 0.4,
        wireframe: true,
        transparent: true,
        opacity: 0.1
    });

    for (let i = 0; i < 70; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        const scale = Math.random() * 0.5 + 0.2;
        mesh.scale.set(scale, scale, scale);
        scene.add(mesh);
        shapes.push(mesh);
    }
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffc700, 0.8);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    threeCamera.position.z = 5;

    const clock = new THREE.Clock();
    const animate = () => {
        const elapsedTime = clock.getElapsedTime();
        shapes.forEach(shape => {
            shape.rotation.y += 0.001;
            shape.rotation.x += 0.002;
        });
        renderer.render(scene, threeCamera);
        window.requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', () => {
        threeCamera.aspect = window.innerWidth / window.innerHeight;
        threeCamera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    gsap.to(threeCamera.position, {
        z: 15,
        scrollTrigger: {
            trigger: ".hero-section",
            start: "top top",
            end: "bottom top",
            scrub: 1.5
        }
    });
}


// --- Parallax Animation ---
function initParallax() {
    const heroSection = document.querySelector('.hero-section');
    if (!heroSection) return;

    const layers = [
        { el: document.querySelector('#parallax-container .layer-1'), strength: 0.4 },
        { el: document.querySelector('#parallax-container .layer-2'), strength: 0.25 },
        { el: document.querySelector('#parallax-container .layer-3'), strength: 0.15 },
        { el: document.querySelector('.hero-section .container'), strength: 0.05 }
    ];

    heroSection.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e;
        const { offsetWidth, offsetHeight } = heroSection;
        const x = (clientX / offsetWidth - 0.5) * 2;
        const y = (clientY / offsetHeight - 0.5) * 2;

        layers.forEach(layer => {
            if (layer.el) {
                gsap.to(layer.el, { x: -x * 50 * layer.strength, y: -y * 25 * layer.strength, duration: 1.2, ease: 'power3.out' });
            }
        });
        
        if (threeCamera) {
            gsap.to(threeCamera.position, { x: -x * 2, y: y * 2, duration: 1.5, ease: 'power3.out' });
        }
    });

    heroSection.addEventListener('mouseleave', () => {
        layers.forEach(layer => {
            if (layer.el) {
                gsap.to(layer.el, { x: 0, y: 0, duration: 1.5, ease: 'elastic.out(1, 0.3)' });
            }
        });
        if (threeCamera) {
            gsap.to(threeCamera.position, { x: 0, y: 0, duration: 1.5, ease: 'elastic.out(1, 0.3)' });
        }
    });
}

// --- MAIN FUNCTION TO START ALL ANIMATIONS ---
function startPageAnimations() {
    initHeroAnimations();
    initShowcaseAnimation();
    initFeatureAnimations();
    initCTAAnimations();
    initFinalCTAThreeJS();
    initThreeJSOverlay();
    initParallax();

    animateSectionZoom('.code-showcase', '.code-showcase');

const isMouseOnlyDevice = () => {
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

    const hasNoTouch = navigator.maxTouchPoints === 0;

    return hasFinePointer;
};

if (isMouseOnlyDevice()) {
    const cursor = document.createElement('div');
    cursor.className = 'cursor-gradient';
    document.body.appendChild(cursor);

    cursor.style.opacity = '0.7';

    document.addEventListener('mousemove', (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
    });

    document.addEventListener('mouseleave', () => {
        cursor.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
        cursor.style.opacity = '0.7';
    });
}
}

// --- PAGE LOAD HANDLER ---
window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        const tl = gsap.timeline();
        tl.to(preloader, { opacity: 0, duration: 0.8, ease: 'power2.out' })
        .set(preloader, { display: 'none' })
        .to('body', { opacity: 1, duration: 0.5, ease: 'power1.inOut', onComplete: startPageAnimations });
    } else {
        gsap.to('body', { opacity: 1, duration: 0.5, onComplete: startPageAnimations });
    }
});
