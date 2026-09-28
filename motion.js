/* motion.js — Lenis smooth scroll + GSAP scroll-triggered reveals.
 *
 * Hand-maintained file: keep the must-revalidate cache entry in vercel.json.
 * Motion principles (Emil Kowalski skill): transform and opacity only, short
 * durations, restrained, ease-out. If the libraries fail to load or the
 * visitor prefers reduced motion, every [data-reveal] element stays visible —
 * content is never hidden by CSS, only animated from JS.
 */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showAll() {
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.style.opacity = '';
      el.style.transform = '';
    });
  }

  function setupReveal(el) {
    el.setAttribute('data-reveal-done', 'true');
    var delay = parseFloat(el.getAttribute('data-reveal-delay') || '0') || 0;
    window.gsap.fromTo(el,
      { opacity: 0, y: 26 },
      {
        opacity: 1, y: 0,
        duration: 0.8, delay: delay, ease: 'expo.out', overwrite: 'auto',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
  }

  function scan() {
    document.querySelectorAll('[data-reveal]:not([data-reveal-done])').forEach(setupReveal);
  }

  function init() {
    if (reducedMotion || !window.Lenis || !window.gsap || !window.ScrollTrigger) {
      showAll();
      return;
    }
    window.gsap.registerPlugin(window.ScrollTrigger);

    var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });

    // The router drives scrolling through window.scrollTo (_syncUrl resets to
    // top on every route change; goPhase smooth-scrolls; goEnvCase re-issues
    // until its target settles). Route all of it through Lenis so nothing in
    // the component script has to change.
    var nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = function (a, b) {
      var top = 0, smooth = false;
      if (typeof a === 'object' && a !== null) {
        top = a.top || 0;
        smooth = a.behavior === 'smooth';
      } else if (typeof a === 'number') {
        top = a;
        smooth = b === 'smooth';
      }
      if (smooth) lenis.scrollTo(top);
      else lenis.scrollTo(top, { immediate: true });
    };

    lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    window.gsap.ticker.lagSmoothing(0);

    // componentDidUpdate (the router's single sync point) calls this after
    // every render. Re-scan for new [data-reveal] nodes, drop triggers whose
    // elements were unmounted by the route change, then recalc positions.
    window.Motion = {
      refresh: function () {
        window.ScrollTrigger.getAll().forEach(function (t) {
          if (t.trigger && !document.contains(t.trigger)) t.kill();
        });
        scan();
        window.ScrollTrigger.refresh();
      }
    };
    scan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
