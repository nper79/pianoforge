/* Optional, session-only voice control. Enable with a click; never request the microphone on load. */
'use strict';
function createVoiceRestart({ button, status, onRestart, isSongOpen,
  Recognition = window.SpeechRecognition || window.webkitSpeechRecognition }) {
  let enabled = false, recognition = null, timer = null, lastRestart = -Infinity, failures = 0;
  const say = text => { status.textContent = text; status.classList.toggle('hidden', !text); };
  const show = (label, message) => {
    button.textContent = label;
    button.classList.toggle('on', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    say(message);
  };
  function stop(message = '') {
    enabled = false;
    clearTimeout(timer); timer = null;
    const previous = recognition; recognition = null;
    if (previous) { try { previous.abort(); } catch {} }
    show('Voice restart', message);
  }
  function listen() {
    if (!enabled || !isSongOpen() || document.hidden) { stop(); return; }
    let session;
    try { session = new Recognition(); }
    catch { stop('Voice recognition is unavailable. Try opening this site in Chrome or Edge.'); return; }
    recognition = session;
    session.lang = 'en-US';
    session.continuous = true;
    session.interimResults = false;
    session.maxAlternatives = 1;
    session.onstart = () => {
      if (recognition !== session || !enabled) return;
      show('Voice: on', 'Listening — say “restart”.');
    };
    session.onresult = event => {
      if (recognition !== session || !enabled || !isSongOpen() || document.hidden) return;
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        failures = 0;
        const command = (result[0]?.transcript || '').toLowerCase().replace(/[^a-z\s-]/g, '').trim().replace(/\s+/g, ' ');
        if (!/^(?:please )?re[ -]?start(?: (?:the )?song)?(?: please)?$/.test(command)) continue;
        const now = performance.now();
        if (now - lastRestart < 2000) continue;
        lastRestart = now;
        onRestart();
        say('Restarting — still listening for “restart”.');
        break;
      }
    };
    session.onerror = event => {
      if (recognition !== session || !enabled) return;
      if (event.error === 'no-speech') return; // Silence is normal while practising.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stop('Voice access was blocked. Allow the microphone, or open the site in Chrome or Edge.');
      } else if (event.error === 'audio-capture') {
        stop('No microphone is available. Connect one and enable Voice restart again.');
      } else if (event.error !== 'aborted') {
        failures++;
        if (failures >= 3) stop('Voice recognition could not connect. Check your connection and try again.');
        else say('Reconnecting voice recognition…');
      }
    };
    session.onend = () => {
      if (recognition !== session || !enabled) return;
      recognition = null;
      show('Voice: reconnecting', 'Reconnecting — say “restart” once listening resumes.');
      timer = setTimeout(listen, failures ? 1500 : 300);
    };
    try { session.start(); }
    catch { stop('Could not start voice recognition. Click Voice restart to try again.'); }
  }
  function start() {
    if (enabled || !isSongOpen()) return;
    if (!Recognition) { stop('Voice recognition is unavailable in this browser. Try Chrome or Edge.'); return; }
    enabled = true; failures = 0; lastRestart = -Infinity;
    show('Voice: starting…', 'Allow the microphone, then say “restart”.');
    listen();
  }
  button.onclick = () => enabled ? stop() : start();
  button.title = 'Enable voice control, then say “restart” to start this song again. Click again to stop listening.';
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', () => stop());
  show('Voice restart', '');
  return { start, stop };
}
