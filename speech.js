// Keep the utterance alive and start directly within the user's tap handler.
(() => {
  const synth = window.speechSynthesis;
  let voices = [], current = null, timer;
  function status(message) {
    const node = document.getElementById('speechStatus');
    if (node) { node.textContent = message; node.hidden = !message; }
  }
  function refreshVoices() { voices = synth.getVoices(); }
  if (synth) { refreshVoices(); synth.addEventListener('voiceschanged', refreshVoices); }
  window.speak = function (text) {
    if (!synth || !window.SpeechSynthesisUtterance) { status('このブラウザでは音声を再生できません。Safariなどのブラウザで開いてください。'); return; }
    // Request media playback routing on browsers that expose Audio Session API.
    // Unsupported browsers retain their existing speech behavior.
    try { if (window.navigator?.audioSession) window.navigator.audioSession.type = 'playback'; } catch {}
    clearTimeout(timer);
    current = null;
    if (synth.speaking || synth.pending) synth.cancel();
    refreshVoices();
    const u = new SpeechSynthesisUtterance(String(text));
    const english = voices.filter(v => /^en[-_]/i.test(v.lang));
    const voice = english.find(v => v.localService && /^en[-_]US$/i.test(v.lang)) || english.find(v => v.localService) || english[0];
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en-US'; u.rate = 0.82; u.volume = 1;
    current = u;
    u.onstart = () => { if (current === u) { clearTimeout(timer); status('再生中です。聞こえない場合はメディア音量・音声の出力先をご確認ください。'); } };
    u.onend = () => { if (current === u) { clearTimeout(timer); current = null; status(''); } };
    u.onerror = () => { if (current === u) { clearTimeout(timer); current = null; status('音声を再生できませんでした。Safariで開き直し、発音ボタンをもう一度押してください。'); } };
    status('音声を準備しています…');
    timer = setTimeout(() => { if (current === u) status('再生が始まりません。Safariで開き直して再度お試しください。iPhoneの英語音声の設定もご確認ください。'); }, 6000);
    try { synth.speak(u); if (synth.paused) synth.resume(); }
    catch { u.onerror(); }
  };
})();
