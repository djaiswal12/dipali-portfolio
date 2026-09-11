// <video-slot> — silent auto-looping video tile (no controls, no play button).
//
//   <video-slot id="noris-creator-0"
//               src="videos/noris-creator-0.mp4"
//               poster="images/noris-creator-0.webp"
//               label="Reel recap"></video-slot>
//
// Why video and not GIF: a 6-second 1080x1350 GIF runs 8-15 MB and is capped at
// 256 colours with visible dither; the same clip as muted H.264 MP4 is roughly
// 300-800 KB at full colour and 30fps. Autoplay is allowed by every browser as
// long as the video is `muted` + `playsinline`, so it behaves exactly like a GIF
// while looking far better and loading much faster.
//
// Behaviour:
//   • Plays automatically, muted, looping, inline, with no controls.
//   • Pauses when scrolled out of view (IntersectionObserver) to save battery,
//     resumes on the way back.
//   • Missing file -> placeholder that accepts a drag-drop for an immediate
//     SESSION preview (blob URL, gone on reload). Commit the file to videos/
//     to make it permanent.
//   • Respects prefers-reduced-motion: shows the poster frame instead of playing.
(() => {
  if (customElements.get('video-slot')) return;

  const C = { bg: '#F1EEE9', line: '#dedad2', text: '#1F211C', dim: '#8A8C7E', accent: '#B5BE4A' };

  class VideoSlot extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this._blobUrl = null;
      this.attachShadow({ mode: 'open' });
      this._render();
      this._probe();
    }

    disconnectedCallback() {
      if (this._io) { this._io.disconnect(); this._io = null; }
      if (this._blobUrl) { URL.revokeObjectURL(this._blobUrl); this._blobUrl = null; }
    }

    get _label() { return this.getAttribute('label') || 'Video'; }

    _render() {
      const poster = this.getAttribute('poster');
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; position: relative; width: 100%; height: 100%; }
          .frame {
            position: relative; width: 100%; height: 100%;
            background: ${C.bg}; overflow: hidden;
          }
          video {
            width: 100%; height: 100%; object-fit: cover; display: block;
            background: ${C.bg};
          }
          video[hidden] { display: none; }
          .empty {
            position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 9px; padding: 20px;
            font-family: 'Work Sans', system-ui, sans-serif; text-align: center;
          }
          .empty[hidden] { display: none; }
          .glyph {
            width: 34px; height: 24px; border: 1.5px solid ${C.dim}; border-radius: 3px;
            position: relative;
          }
          .glyph:after {
            content: ''; position: absolute; top: 50%; left: 50%;
            transform: translate(-40%, -50%);
            border-left: 8px solid ${C.dim};
            border-top: 5px solid transparent; border-bottom: 5px solid transparent;
          }
          .t { font-size: 12.5px; color: ${C.text}; }
          .s { font-size: 11px; color: ${C.dim}; line-height: 1.5; max-width: 220px; }
          button {
            font-family: inherit; font-size: 11px; letter-spacing: 0.06em;
            text-transform: uppercase; color: ${C.text}; background: none;
            border: none; border-bottom: 1px solid ${C.accent};
            padding: 0 0 3px; cursor: pointer;
          }
          .frame[data-over] { outline: 2px solid ${C.accent}; outline-offset: -2px; }
          .note {
            position: absolute; left: 0; right: 0; bottom: 0;
            font-family: 'Work Sans', system-ui, sans-serif; font-size: 10.5px;
            color: ${C.dim}; background: rgba(251,250,247,0.94);
            padding: 6px 10px; line-height: 1.4;
          }
          .note[hidden] { display: none; }
          input { display: none; }
        </style>
        <div class="frame">
          <video hidden muted loop playsinline autoplay preload="metadata"
                 ${poster ? `poster="${poster}"` : ''}></video>
          <div class="empty">
            <div class="glyph"></div>
            <div class="t">${this._label}</div>
            <div class="s">Drop a short MP4 &mdash; it loops silently, no play button.</div>
            <button type="button">Browse files</button>
          </div>
          <div class="note" hidden></div>
          <input type="file" accept="video/mp4,video/webm,image/gif">
        </div>`;

      const r = this.shadowRoot;
      this._frame = r.querySelector('.frame');
      this._video = r.querySelector('video');
      this._empty = r.querySelector('.empty');
      this._note = r.querySelector('.note');
      this._input = r.querySelector('input');

      r.querySelector('button').addEventListener('click', () => this._input.click());
      this._input.addEventListener('change', () => {
        if (this._input.files && this._input.files[0]) this._accept(this._input.files[0]);
      });
      ['dragenter', 'dragover'].forEach(t => this._frame.addEventListener(t, (e) => {
        e.preventDefault(); this._frame.setAttribute('data-over', '');
      }));
      ['dragleave', 'drop'].forEach(t => this._frame.addEventListener(t, (e) => {
        e.preventDefault(); this._frame.removeAttribute('data-over');
      }));
      this._frame.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._accept(f);
      });
    }

    // Point the <video> straight at the src and let the element itself tell us
    // whether the file exists. Probing with fetch() would transfer the whole
    // file a second time just to answer a yes/no question.
    _probe() {
      const src = this.getAttribute('src');
      if (!src || src.includes('{{')) return; // unresolved template string
      const onError = () => {
        this._video.hidden = true;
        this._video.removeAttribute('src');
        this._empty.hidden = false;
        if (this._io) { this._io.disconnect(); this._io = null; }
      };
      this._video.addEventListener('error', onError, { once: true });
      this._show(src, null);
    }

    _accept(file) {
      if (!file || !/^(video\/|image\/gif)/i.test(file.type)) return;
      if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = URL.createObjectURL(file);
      this._show(this._blobUrl, file.name + ' — preview only. Add it to videos/ to keep it after reload.');
    }

    _show(url, note) {
      this._video.src = url;
      this._video.hidden = false;
      this._empty.hidden = true;
      if (note) { this._note.textContent = note; this._note.hidden = false; }

      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { this._video.removeAttribute('autoplay'); this._video.pause(); return; }

      const play = () => { const p = this._video.play(); if (p && p.catch) p.catch(() => {}); };
      play();

      // Only run while on screen.
      if (this._io) this._io.disconnect();
      this._io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) play(); else this._video.pause(); });
      }, { threshold: 0.15 });
      this._io.observe(this);
    }
  }

  customElements.define('video-slot', VideoSlot);
})();
