'use client';

import { useEffect } from 'react';

// "Download PDF": the browser's print dialog, with print styles in globals.css.
export function PrintButton() {
  return (
    <button type="button" className="export-btn no-export" onClick={() => window.print()}>
      Download PDF
    </button>
  );
}

// Adds a "Save image" button to every section heading (h2) on the page. Clicking it
// saves that heading and everything under it, up to the next h2, as a PNG, with
// the page's caption (teams, game, date) on top.
export function SectionImages() {
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return undefined;
    const added = [];
    for (const h of main.querySelectorAll('h2')) {
      if (h.closest('.log-details') || h.querySelector('.img-btn')) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'img-btn no-export';
      btn.textContent = 'Save image';
      btn.addEventListener('click', () => save(h, btn));
      h.appendChild(btn);
      added.push(btn);
    }
    return () => added.forEach((b) => b.remove());
  }, []);
  return null;
}

async function save(h2, btn) {
  const label = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;
  const main = document.querySelector('main');
  const frame = document.createElement('div');
  frame.className = 'export-frame';
  frame.style.width = `${main.clientWidth}px`;
  try {
    const caption = document.querySelector('[data-export-title]')?.getAttribute('data-export-title') || document.title;
    const head = document.createElement('div');
    head.className = 'export-caption';
    head.innerHTML = `<img src="/crest.png" alt="" /><span></span>`;
    head.querySelector('span').textContent = caption;
    frame.appendChild(head);
    // The heading and the blocks that follow it, up to the next heading.
    let n = h2;
    do {
      frame.appendChild(n.cloneNode(true));
      n = n.nextElementSibling;
    } while (n && n.tagName !== 'H2' && !n.classList.contains('log-details'));
    // Expanded tables in the copy, without the buttons.
    frame.querySelectorAll('.no-export').forEach((x) => x.remove());
    frame.querySelectorAll('.more-toggle').forEach((x) => { x.checked = true; });
    main.appendChild(frame);
    await Promise.all([...frame.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    const { toPng } = await import('html-to-image');
    // The copy sits off-screen on the page; draw it at the origin in the image.
    const url = await toPng(frame, {
      pixelRatio: 2, backgroundColor: '#f5f7fb', cacheBust: true,
      style: { position: 'static', left: '0', top: '0', margin: '0' },
      width: frame.offsetWidth, height: frame.offsetHeight,
    });
    const a = document.createElement('a');
    const section = h2.childNodes[0]?.textContent?.trim() || 'section';
    a.download = `${caption} - ${section}`.replace(/[^\w\- ·]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) + '.png';
    a.href = url;
    a.click();
  } catch (e) {
    alert(`Couldn’t save the image: ${e.message || e}`); // eslint-disable-line no-alert
  } finally {
    frame.remove();
    btn.textContent = label;
    btn.disabled = false;
  }
}
