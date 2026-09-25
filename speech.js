// Play pre-generated English audio directly from a tap, using the media channel.
(() => {
  let current = null, timer;
  function status(message) {
    const node = document.getElementById('speechStatus');
    if (node) { node.textContent = message; node.hidden = !message; }
  }
  window.speak = function (text) {
    clearTimeout(timer);
    if (current) { current.pause(); current.removeAttribute('src'); current.load(); current = null; }
    const source = Object.prototype.hasOwnProperty.call(window.TERM_AUDIO || {}, String(text)) ? window.TERM_AUDIO[String(text)] : null;
    if (!source) { status('この発音の音声はまだ用意されていません。ページを再読み込みしてお試しください。'); return; }
    // HTMLAudioElement chooses the media playback session; no speech synthesis or Web Audio.
    const player = new Audio(source);
    current = player;
    player.volume = 1;
    player.onplaying = () => { if (current === player) { clearTimeout(timer); status(''); } };
    player.onended = () => { if (current === player) { clearTimeout(timer); status(''); current = null; } };
    const failed = () => { if (current === player) { clearTimeout(timer); status('音声を再生できませんでした。通信状態を確認し、発音ボタンをもう一度押してください。'); } };
    player.onerror = failed;
    status('音声を読み込んでいます…');
    timer = setTimeout(() => { if (current === player) status('音声の読み込みに時間がかかっています。通信状態を確認して、もう一度お試しください。'); }, 10000);
    try { const result = player.play(); if (result) result.catch(failed); } catch { failed(); }
  };
})();
