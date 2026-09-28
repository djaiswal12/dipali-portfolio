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

  /* Spotlight + tilt for [data-spotcard] case-study cards. The glow position
     is fed through --mx/--my; the tilt is a small perspective rotation plus a
     3px lift, transform-only, eased by the CSS transition on .spotcard.
     Skipped entirely on touch devices and under prefers-reduced-motion (the
     CSS gates the visuals the same way). The tilt targets the inner card so it
     never fights the GSAP reveal running on the outer [data-reveal] wrapper. */
  var fineHover = window.matchMedia &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function wireCards() {
    if (reducedMotion || !fineHover) return;
    document.querySelectorAll('[data-spotcard]:not([data-card-done])').forEach(function (card) {
      card.setAttribute('data-card-done', 'true');
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        card.style.transform =
          'perspective(1000px) rotateX(' + ((0.5 - y) * 5).toFixed(2) + 'deg)' +
          ' rotateY(' + ((x - 0.5) * 5).toFixed(2) + 'deg) translateY(-3px)';
      });
      card.addEventListener('pointerleave', function () {
        card.style.transform = '';
      });
    });
  }

  /* Showreel: the 2.5MB video never loads until the section is near the
     viewport (preload="none" + data-src). One observer pre-loads it 600px
     early; a second starts playback when visible and pauses it off-screen so
     it costs nothing while unread. Under prefers-reduced-motion there is no
     autoplay — the visitor gets native controls and the poster frame. */
  function wireShowreel() {
    document.querySelectorAll('#showreel-video:not([data-reel-done])').forEach(function (video) {
      video.setAttribute('data-reel-done', 'true');
      var src = video.getAttribute('data-src');
      function load() {
        if (src && !video.getAttribute('src')) video.setAttribute('src', src);
      }
      if (reducedMotion) {
        video.setAttribute('controls', '');
        load();
        return;
      }
      var playing = false;
      function play() {
        load();
        if (playing) return;
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
        playing = true;
        /* First playback only. play() fires on visibility-autoplay, so this
           measures reel reach: how many visitors scrolled it into view. */
        if (!video.hasAttribute('data-reel-tracked')) {
          video.setAttribute('data-reel-tracked', 'true');
          try { window.va('event', { name: 'showreel_play' }); } catch (e) {}
        }
      }
      function pause() {
        if (!playing) return;
        video.pause();
        playing = false;
      }
      if (!('IntersectionObserver' in window)) { play(); return; }
      var loadIO = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { load(); loadIO.disconnect(); }
        });
      }, { rootMargin: '600px 0px' });
      var playIO = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) play(); else pause();
        });
      });
      loadIO.observe(video);
      playIO.observe(video);
    });
  }

  /* Contact link clicks (email / phone / LinkedIn). Delegated on document so
     it survives the router's re-renders without touching builder templates.
     Pure observation — never prevents the default navigation. */
  function wireContactLinkTracking() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest
        ? e.target.closest('a[href^="mailto:"], a[href^="tel:"], a[href*="linkedin.com"]')
        : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var type = href.indexOf('mailto:') === 0 ? 'email'
        : href.indexOf('tel:') === 0 ? 'phone' : 'linkedin';
      try { window.va('event', { name: 'contact_link_click', data: { type: type } }); }
      catch (err) {}
    });
  }

  function init() {
    // No dependencies — runs on every boot even if the animation libs fail.
    wireShowreel();
    wireContactLinkTracking();

    // Defined unconditionally so the showreel re-wires after route changes
    // even when the animation libs failed to load; the gsap-dependent parts
    // of refresh no-op in that case.
    window.Motion = {
      refresh: function () {
        if (window.gsap && window.ScrollTrigger) {
          window.ScrollTrigger.getAll().forEach(function (t) {
            if (t.trigger && !document.contains(t.trigger)) t.kill();
          });
          scan();
          window.ScrollTrigger.refresh();
        } else {
          showAll();
        }
        wireCards();
        wireShowreel();
      }
    };

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

    // componentDidUpdate (the router's single sync point) calls
    // window.Motion.refresh() after every render — see the definition above.
    scan();
    wireCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
