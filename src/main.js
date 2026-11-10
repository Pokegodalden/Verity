import './style.css';

const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const status = document.querySelector('#status');
const statusMessage = document.querySelector('#status-message');
const micStateLabel = document.querySelector('#mic-state-label');
const micBar = document.querySelector('#mic-bar');
const inputMeter = document.querySelector('#input-meter');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const count = document.querySelector('#count');
const feedOrder = document.querySelector('#feed-order');
const newChecksButton = document.querySelector('#new-checks');
const claimScroll = document.querySelector('#claim-scroll');
const empty = document.querySelector('#empty');
const emptyMessage = document.querySelector('#empty-message');
const claims = document.querySelector('#claims');
const welcomeGuide = document.querySelector('#welcome-guide');
const guideButton = document.querySelector('#open-guide');
const demoButton = document.querySelector('#open-demo');
const demoDialog = document.querySelector('#demo-dialog');
const demoVideo = document.querySelector('#demo-video');
const demoMessage = document.querySelector('#demo-message');
const demoFallback = document.querySelector('#demo-fallback');
const guideKey = 'verity-welcome-guide-seen';
const requiredFields = [
  'claim_id', 'speaker', 'timestamp', 'claim', 'verdict',
  'confidence', 'explanation', 'sources',
];

let activeSession;
let newChecks = 0;
let inputTimer;
let demoMedia;

demoButton.addEventListener('click', async () => {
  if (activeSession) return;
  demoDialog.showModal();
  if (!demoVideo.src) {
    demoMessage.textContent = 'Loading the demo…';
    demoMessage.hidden = false;
    demoFallback.hidden = true;
    try {
      // The static host serves the MP4 as a whole file. A local blob makes
      // native seeking work even when the host ignores video range requests.
      demoMedia ??= fetch(demoFallback.href).then(async response => {
        if (!response.ok) throw new Error('Demo video unavailable');
        return URL.createObjectURL(await response.blob());
      });
      const media = await demoMedia;
      if (!demoVideo.src) demoVideo.src = media;
      demoMessage.hidden = true;
    } catch {
      demoMedia = undefined;
      demoMessage.textContent = 'Couldn’t load the demo. Try reopening it or use the link below.';
      demoFallback.hidden = false;
      return;
    }
  }
  if (demoDialog.open) void demoVideo.play().catch(() => {});
});
demoDialog.addEventListener('close', () => {
  demoVideo.pause();
});

guideButton.addEventListener('click', () => welcomeGuide.showModal());
welcomeGuide.addEventListener('close', () => {
  try {
    localStorage.setItem(guideKey, 'true');
  } catch {
    // Storage can be disabled by the browser.
  }
  if (document.activeElement === document.body) guideButton.focus();
});

let guideSeen = false;
try {
  guideSeen = localStorage.getItem(guideKey) === 'true';
} catch {
  // The guide remains available when storage is disabled.
}
if (!guideSeen) welcomeGuide.showModal();

function setNewChecks(total) {
  if (newChecks === total) return;
  newChecks = total;
  if (total > 0) {
    newChecksButton.textContent = `New checks (${total}) ↑`;
  } else if (document.activeElement === newChecksButton) {
    claimScroll.focus({ preventScroll: true });
  }
  newChecksButton.hidden = total === 0;
}

claimScroll.addEventListener('scroll', () => {
  if (claimScroll.scrollTop <= 1) setNewChecks(0);
}, { passive: true });

newChecksButton.addEventListener('click', () => {
  claimScroll.scrollTop = 0;
  setNewChecks(0);
});

function updateStatus(state, message) {
  const focusedControl = document.activeElement;
  const live = state === 'live';
  const canStop = state === 'connecting' || live;
  const sessionActive = canStop || state === 'stopping';
  status.dataset.state = state;
  micBar.classList.toggle('is-live', live);
  micStateLabel.textContent = live ? 'Mic on' : state === 'connecting' ? 'Connecting' : state === 'stopping' ? 'Stopping' : 'Mic off';
  statusMessage.textContent = message;
  startButton.hidden = startButton.disabled = sessionActive;
  demoButton.disabled = sessionActive;
  demoButton.title = sessionActive ? 'Turn off the mic to watch the demo.' : '';
  stopButton.hidden = !sessionActive;
  stopButton.disabled = !canStop;
  if (focusedControl === startButton && canStop) stopButton.focus({ preventScroll: true });
  if (focusedControl === stopButton && !sessionActive) startButton.focus({ preventScroll: true });
  inputMeter.hidden = !live;
  clearInterval(inputTimer);
  inputMeter.style.setProperty('--level', '0');
  if (live) {
    const conversation = activeSession.conversation;
    inputTimer = setInterval(() => {
      if (reducedMotion.matches) return;
      const volume = conversation.getInputVolume();
      const level = Math.min(1, Math.max(0, (volume - 0.015) * 4));
      inputMeter.style.setProperty('--level', level.toFixed(2));
    }, 50);
  }
  if (!claims.childElementCount) {
    emptyMessage.textContent = live
      ? 'Listening for checkable claims.'
      : 'Turn on the mic to start a room session.';
  }
}

function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function sourceLabel(url) {
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'science.nasa.gov') return url.pathname.includes('/mars/moons') ? 'NASA · Mars moons' : 'NASA Science';
  if (host.endsWith('.wikipedia.org') && url.pathname.startsWith('/wiki/')) {
    try {
      return 'Wikipedia · ' + decodeURIComponent(url.pathname.slice(6)).replaceAll('_', ' ');
    } catch {
      return 'Wikipedia';
    }
  }
  return host;
}

function renderSources(value) {
  const list = document.createElement('ul');
  list.className = 'sources';
  for (const source of value.split('|').map(part => part.trim()).filter(Boolean)) {
    const item = document.createElement('li');
    const url = URL.parse(source);
    if (url && ['https:', 'http:'].includes(url.protocol)) {
      const link = element('a', sourceLabel(url));
      link.href = url.href;
      link.title = source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const arrow = document.createElement('img');
      arrow.src = '/room-notes/source-arrow.svg';
      arrow.alt = '';
      arrow.width = arrow.height = 12;
      link.append(arrow);
      item.append(link);
    } else {
      item.textContent = source;
    }
    list.append(item);
  }
  return list;
}

function addClaim(session, check) {
  if (activeSession !== session || session.stopping) return;
  if (!requiredFields.every(field => typeof check?.[field] === 'string' && check[field].trim())) {
    console.warn('Verity sent an incomplete fact-check.');
    return;
  }
  if (session.claimIds.has(check.claim_id)) return;
  session.claimIds.add(check.claim_id);

  const card = document.createElement('article');
  card.className = 'claim';
  card.dataset.verdict = check.verdict.trim().toLowerCase();
  const meta = document.createElement('div');
  meta.className = 'claim-meta';
  const initial = element('span', [...check.speaker.trim()][0].toLocaleUpperCase(), 'speaker-initial');
  initial.setAttribute('aria-hidden', 'true');
  const divider = element('span', '·');
  divider.setAttribute('aria-hidden', 'true');
  meta.append(initial, element('span', check.speaker, 'speaker'), divider, element('span', check.timestamp, 'claim-time'));
  const evidence = document.createElement('div');
  evidence.className = 'claim-evidence';
  const confidence = check.confidence.trim();
  evidence.append(renderSources(check.sources), element('p', `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`, 'confidence'));
  card.append(
    meta,
    element('h3', `Claim: ${check.claim}`),
    element('p', `Verdict: ${check.verdict}`, 'verdict'),
    element('p', check.explanation, 'explanation'),
    evidence,
  );
  const scrollTop = claimScroll.scrollTop;
  const readingEarlier = scrollTop > 1;
  const previousHeight = readingEarlier ? claimScroll.scrollHeight : 0;
  if (!readingEarlier) card.classList.add('arriving');
  claims.prepend(card);
  empty.hidden = true;
  if (readingEarlier) {
    // Offset the added height so the card the viewer is reading stays in place.
    claimScroll.scrollTop = scrollTop + claimScroll.scrollHeight - previousHeight;
    setNewChecks(newChecks + 1);
  } else {
    setNewChecks(0);
  }

  const total = session.claimIds.size;
  count.textContent = `${total} ${total === 1 ? 'check' : 'checks'}`;
  feedOrder.hidden = false;
}

function finishSession(session, state, message) {
  if (activeSession !== session) return;
  activeSession = undefined;
  session.frame.remove();
  updateStatus(state, message);
}

async function closeSession(session) {
  try {
    await session.conversation.endSession();
  } catch (error) {
    console.error('Verity session could not close.', error);
  } finally {
    finishSession(session, 'stopped', 'Session stopped');
  }
}

async function connectSession(session) {
  if (activeSession !== session) return;
  try {
    const conversation = await session.frame.contentWindow.startVerityConversation({
      clientTools: { push_fact_check: check => addClaim(session, check) },
      onDisconnect: details => {
        if (session.stopping) return;
        finishSession(session, 'disconnected', 'Session disconnected. Start again to reconnect.');
        console.info('Verity session disconnected.', details?.reason);
      },
      onError: message => {
        console.error('Verity session error.', message);
      },
    });

    if (activeSession !== session) return;
    session.conversation = conversation;
    status.dataset.conversationId = conversation.getId();
    updateStatus('live', 'Verity is listening');
  } catch (error) {
    if (activeSession !== session) return;
    console.error('Verity could not start.', error);
    const message = error?.name === 'NotAllowedError'
      ? 'Microphone permission denied. Allow access and try again.'
      : 'Could not start Verity. Check your microphone and connection, then retry.';
    finishSession(session, 'disconnected', message);
  }
}

startButton.addEventListener('click', () => {
  if (activeSession) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    updateStatus('disconnected', 'Microphone access requires HTTPS or localhost.');
    return;
  }

  // The SDK owns startup resources and provides no cancellation handle until
  // connected. Removing its frame cancels pending microphone and socket work.
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = 'Verity voice session';
  frame.allow = 'microphone; autoplay';
  frame.src = '/session.html';

  const session = { frame, claimIds: new Set(), stopping: false };
  activeSession = session;
  claims.replaceChildren();
  claimScroll.scrollTop = 0;
  setNewChecks(0);
  count.textContent = '0 checks';
  feedOrder.hidden = true;
  empty.hidden = false;
  delete status.dataset.conversationId;
  updateStatus('connecting', 'Starting the room session…');

  frame.addEventListener('load', () => void connectSession(session), { once: true });
  document.body.append(frame);
});

stopButton.addEventListener('click', () => {
  const session = activeSession;
  if (!session || session.stopping) return;
  if (!session.conversation) {
    finishSession(session, 'stopped', 'Session stopped');
    return;
  }
  session.stopping = true;
  updateStatus('stopping', 'Stopping…');
  void closeSession(session);
});
