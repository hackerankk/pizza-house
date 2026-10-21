import { API_BASE } from './lib';

let context;
let audio;

export async function playStaffOrderAlert(settings, unlock = false) {
  if (settings.admin_new_order_sound_enabled === '0' && !unlock) return;
  if (settings.admin_new_order_sound_source === 'custom' && settings.admin_new_order_custom_sound_url) {
    const path = settings.admin_new_order_custom_sound_url;
    const url = /^https?:\/\//.test(path) ? path : `${API_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    audio ||= new Audio();
    audio.src = url;
    audio.currentTime = 0;
    await audio.play();
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('Audio is unavailable in this browser');
  context ||= new AudioContext();
  if (unlock) await context.resume();
  if (context.state !== 'running') throw new Error('Enable browser audio to hear order alerts');
  const tones = {
    soft_chime: [[660, 0, .22, 'sine'], [990, .18, .32, 'sine']],
    double_beep: [[760, 0, .16, 'square'], [760, .26, .16, 'square']],
    urgent_ping: [[1040, 0, .18, 'triangle'], [880, .16, .2, 'triangle'], [1040, .36, .18, 'triangle']],
    classic_bell: [[880, 0, .24, 'square'], [660, .24, .32, 'square']]
  };
  (tones[settings.admin_new_order_sound_tone] || tones.classic_bell).forEach(([frequency, delay, duration, type]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.001, start);
    gain.gain.exponentialRampToValueAtTime(.2, start + .02);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  });
}
