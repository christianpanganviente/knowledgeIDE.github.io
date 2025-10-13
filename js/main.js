tailwind.config = {
    theme: {
        extend: {
            colors: {
                'blackish': '#0a0a0a', // Deep charcoal background
                'primary': '#FFC700', // NEW Primary CTA Yellow (vibrant)
                'primary-hover': '#FDB813', // Darker yellow for hover state
                'secondary': '#61dafb', // Code highlight/Secondary Cyan (retained for contrast)
                'code-bg': '#1e1e1e', // IDE background
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        }
    }
}

gsap.registerPlugin(ScrollTrigger);

function initHeroAnimations() {
    gsap.from('header', { opacity: 0, y: -50, duration: 0.8, ease: 'power2.out' });
    gsap.to('.ide-mockup', {
        y: 50,
        ease: 'none',
        scrollTrigger: {
            trigger: '.hero-section',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.5,
        }
    });
    gsap.from('.hero-headline .word', {
        y: 50,
        opacity: 0,
        stagger: 0.1,
        delay: 1, 
        ease: 'power3.out',
    });
    gsap.from('.hero-cta', { opacity: 0, scale: 0.8, duration: 0.6, delay: 0, ease: 'back.out(1.7)' });
}

function initHeroFloatAndTilt() {
    const heroMockup = document.querySelector('.ide-mockup');
    gsap.set(heroMockup, {
        rotationX: 10,
        rotationY: -10,
        z: 100,
        transformOrigin: 'center center',
    });

    gsap.to(heroMockup, {
        y: '+=15',
        duration: 3.5,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
    });
}

function initFeatureStagger() {
    gsap.utils.toArray('.feature-card').forEach((card, i) => {
        gsap.set(card, { opacity: 0, y: 30 }); 

        gsap.to(card, {
            y: 0,
            opacity: 1,
            duration: 1,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: card,
                start: 'top 80%', 
                toggleActions: 'play none none reverse',
            }
        });
    });
}

function initTiltAndHoverAndFloat() {
    const card = document.querySelector('.code-panel');
    const parent = document.querySelector('.pin-container');
    const tiltLimit = 20; 
    const scaleFactor = 1.03;

    const initialBackground = 'linear-gradient(135deg, #1e1e1e 0%, #302d1d 100%)';
    const hoverBackground = 'linear-gradient(135deg, #1e1e1e 0%, #1e282d 100%)';
    const initialBorderColor = '#FFC700';
    const hoverBorderColor = '#61dafb';

    gsap.set(card, { transformOrigin: 'center center' });

    parent.addEventListener('mousemove', (e) => {
        const rect = parent.getBoundingClientRect();
        const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);

        const xRot = y * -tiltLimit; 
        const yRot = x * tiltLimit;

        gsap.to(card, {
            rotationX: xRot,
            rotationY: yRot,
            duration: 0.05, 
            ease: 'linear' 
        });
    });

    gsap.to(card, {
        y: '+=10',
        duration: 3,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
    });

    card.addEventListener('mouseenter', () => {
        gsap.getTweensOf(card).forEach(tween => {
            if (tween.vars.yoyo) tween.pause();
        });

        gsap.to(card, {
            scale: scaleFactor,
            duration: 0.3,
            ease: 'power2.out',
            boxShadow: '0 30px 60px -15px rgba(97, 218, 251, 0.5)', 
            borderColor: hoverBorderColor,
            background: hoverBackground,
        });
    });

    card.addEventListener('mouseleave', () => {
        gsap.getTweensOf(card).forEach(tween => {
            if (tween.vars.yoyo) tween.play();
        });
        gsap.to(card, {
            rotationX: 0,
            rotationY: 0,
            scale: 1, 
            duration: 0.8,
            ease: 'elastic.out(1, 0.5)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
            borderColor: initialBorderColor,
            background: initialBackground,
        });
    });
}

function initFinalCTA() {
    gsap.set('.cta-headline, .cta-subhead', { opacity: 0, y: 30 });
    gsap.set('.final-cta-btn', { opacity: 0, scale: 0.7 });

    gsap.timeline({
        scrollTrigger: {
            trigger: '.final-cta',
            start: 'top 80%',
            toggleActions: 'play none none reverse'
        }
    })
    .to('.cta-headline', { y: 0, opacity: 1, duration: 1, ease: 'power3.out' })
    .to('.cta-subhead', { y: 0, opacity: 1, duration: 0.8, ease: 'power2.out' }, '<0.2')
    .to('.final-cta-btn', { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(1.7)' }, '<0.4');
}

window.addEventListener('load', () => {
    initHeroAnimations();
    initHeroFloatAndTilt();
    initFeatureStagger();
    initTiltAndHoverAndFloat();
    initFinalCTA();
});