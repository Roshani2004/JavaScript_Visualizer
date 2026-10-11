(function() {
  'use strict';

  // ============ DOM ============
  const $ = id => document.getElementById(id);
  const callStackEl = $('callStack');
  const webApiContainer = $('webApiContainer');
  const macroQueueEl = $('macroQueue');
  const microQueueEl = $('microQueue');
  const stackBadge = $('stackBadge');
  const webapiBadge = $('webapiBadge');
  const macroBadge = $('macroBadge');
  const microBadge = $('microBadge');
  const eventloopStatus = $('eventloopStatus');
  const consoleOutput = $('consoleOutput');
  const loopPulse = $('loopPulse');
  const runBtn = $('runBtn');
  const nextBtn = $('nextBtn');
  const resetBtn = $('resetBtn');
  const autoBtn = $('autoBtn');
  const editBtn = $('editBtn');
  const codeInput = $('codeInput');
  const codeContainer = $('codeContainer');
  const exampleSelect = $('exampleSelect');
  const explanation = $('explanation');
  const progressInfo = $('progressInfo');

  const stackCard = $('stackCard');
  const webapiCard = $('webapiCard');
  const macroCard = $('macroCard');
  const microCard = $('microCard');
  const eventLoopBar = $('eventLoopBar');

  // ============ Examples ============
  const examples = {
    ig: `function loginInstagram() {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            let loginSuccess = true;

            if (loginSuccess) {
                resolve("Instagram login successful!");
            } else {
                reject("Login failed!");
            }
        }, 2000);
    });
}

console.log("Opening Instagram...");

loginInstagram()
    .then((message) => {
        console.log(message);
        console.log("Loading Instagram feed...");
    })
    .catch((error) => {
        console.log(error);
    });

console.log("Please wait...");`,
    ex1: `function logA() { console.log('A') }
function logB() { console.log('B') }
function logC() { console.log('C') }
function logD() { console.log('D') }

logA();
setTimeout(logB, 0);
Promise.resolve().then(logC);
logD();`,
    ex2: `console.log('start');
Promise.resolve()
  .then(() => console.log('micro 1'))
  .then(() => console.log('micro 2'));
console.log('end');`,
    ex3: `console.log('start');
setTimeout(() => console.log('timeout 1'), 0);
setTimeout(() => console.log('timeout 2'), 0);
console.log('end');`,
    ex4: `console.log('start');
setTimeout(() => console.log('macro 1'), 0);
Promise.resolve().then(() => console.log('micro 1'));
console.log('end');`,
    ex5: `Promise.resolve()
  .then(() => console.log('A'))
  .then(() => console.log('B'));
console.log('sync end');`
  };

  let currentCode = examples.ig;
  let isEditMode = false;

  // ============ State ============
  let state = {
    callStack: [],
    webAPIs: [],
    macroQueue: [],
    microQueue: [],
    nextId: 1,
    consoleLines: []
  };
  let steps = [];
  let stepIndex = 0;
  let autoTimer = null;
  let currentLineNum = -1;

  // ============ Helpers ============
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function newId() { return state.nextId++; }

  // ============ Syntax Highlighting ============
  function highlightCode(code) {
    let html = esc(code);
    html = html.replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>');
    html = html.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, '<span class="str">$1</span>');
    html = html.replace(/\b(function|return|new|if|else|let|const|var|true|false|Promise|resolve|reject|async|await)\b/g,
      '<span class="kw">$1</span>');
    html = html.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
    html = html.replace(/([a-zA-Z_$][\w$]*)\s*(?=\()/g, '<span class="fn">$1</span>');
    return html;
  }

  function renderCodeDisplay() {
    const lines = currentCode.split('\n');
    codeContainer.innerHTML = lines.map((line, i) => {
      const lineNum = i + 1;
      const isActive = currentLineNum === lineNum;
      const activeClass = isActive ? ('active ' + (window.__activeLineType || 'stack-line')) : '';
      return `<div class="code-line ${activeClass}" data-line="${lineNum}">
        <span class="line-num">${lineNum}</span>
        <span class="line-content">${highlightCode(line) || '&nbsp;'}</span>
      </div>`;
    }).join('');
  }

  // ============ Console ============
  function addConsole(text, type) {
    state.consoleLines.push({ text, type: type || '' });
    renderConsole();
  }
  function renderConsole() {
    if (state.consoleLines.length === 0) {
      consoleOutput.innerHTML = '<div class="line sys">// console output will appear here</div>';
      return;
    }
    consoleOutput.innerHTML = state.consoleLines.map(l =>
      `<div class="line ${l.type}">${esc(l.text)}</div>`
    ).join('');
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  // ============ Render Visualizer ============
  function render() {
    if (state.callStack.length === 0) {
      callStackEl.innerHTML = '<div class="empty">empty</div>';
    } else {
      callStackEl.innerHTML = state.callStack.map(s => {
        const cls = s.active ? ' active-item' : '';
        return `<div class="item item-stack${cls}">${esc(s.name)}</div>`;
      }).join('');
    }
    stackBadge.textContent = state.callStack.length;

    if (state.webAPIs.length === 0) {
      webApiContainer.innerHTML = '<div class="empty">no active APIs</div>';
    } else {
      webApiContainer.innerHTML = state.webAPIs.map(a => {
        const cls = a.active ? ' active-item' : '';
        return `<div class="item item-webapi${cls}"><span>⏳ ${esc(a.name)}</span><span style="opacity:0.6">id:${a.id}</span></div>`;
      }).join('');
    }
    webapiBadge.textContent = state.webAPIs.length;

    if (state.macroQueue.length === 0) {
      macroQueueEl.innerHTML = '<div class="empty">empty</div>';
    } else {
      macroQueueEl.innerHTML = state.macroQueue.map(t => {
        const cls = t.active ? ' active-item' : '';
        return `<div class="item item-macro${cls}"><span>${esc(t.name)}</span><span style="opacity:0.6">#${t.id}</span></div>`;
      }).join('');
    }
    macroBadge.textContent = state.macroQueue.length;

    if (state.microQueue.length === 0) {
      microQueueEl.innerHTML = '<div class="empty">empty</div>';
    } else {
      microQueueEl.innerHTML = state.microQueue.map(t => {
        const cls = t.active ? ' active-item' : '';
        return `<div class="item item-micro${cls}"><span>${esc(t.name)}</span><span style="opacity:0.6">#${t.id}</span></div>`;
      }).join('');
    }
    microBadge.textContent = state.microQueue.length;

    if (steps.length > 0) {
      progressInfo.textContent = `Step ${stepIndex} / ${steps.length}`;
    } else {
      progressInfo.textContent = '';
    }
    renderCodeDisplay();
  }

  // ============ Active Card ============
  function setCardActive(component) {
    stackCard.classList.remove('active', 'stack-active');
    webapiCard.classList.remove('active', 'webapi-active');
    macroCard.classList.remove('active', 'macro-active');
    microCard.classList.remove('active', 'micro-active');
    eventLoopBar.classList.remove('active', 'micro-mode', 'macro-mode');
    loopPulse.classList.remove('micro', 'macro', 'stack-pulse');
    eventloopStatus.classList.remove('micro-status', 'macro-status');

    if (component === 'stack') {
      stackCard.classList.add('active', 'stack-active');
      loopPulse.classList.add('stack-pulse');
    } else if (component === 'webapi') {
      webapiCard.classList.add('active', 'webapi-active');
    } else if (component === 'macro') {
      macroCard.classList.add('active', 'macro-active');
      eventLoopBar.classList.add('active', 'macro-mode');
      loopPulse.classList.add('macro');
      eventloopStatus.classList.add('macro-status');
    } else if (component === 'micro') {
      microCard.classList.add('active', 'micro-active');
      eventLoopBar.classList.add('active', 'micro-mode');
      loopPulse.classList.add('micro');
      eventloopStatus.classList.add('micro-status');
    }
  }

  function clearActives() {
    state.callStack.forEach(s => s.active = false);
    state.webAPIs.forEach(a => a.active = false);
    state.macroQueue.forEach(t => t.active = false);
    state.microQueue.forEach(t => t.active = false);
  }

  // =========================================================================
  // REAL EXECUTION TRACER
  // =========================================================================
  function traceExecution(code) {
    // Track line numbers statically
    const lines = code.split('\n');
    const lineMap = {
      logs: {},
      setTimeoutCalls: [],
      fnDefs: {}
    };

    // Find function declarations
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*function\s+(\w+)\s*\(/);
      if (m) {
        let depth = 0, started = false;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') { depth++; started = true; }
            else if (ch === '}') { depth--; }
          }
          if (started && depth === 0) {
            lineMap.fnDefs[m[1]] = { startLine: i + 1, endLine: j + 1 };
            break;
          }
        }
      }
    }

    // Find console.log calls
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/console\.log\s*\(\s*["'`](.*?)["'`]\s*\)/);
      if (m) lineMap.logs[m[1]] = i + 1;
    }

    // Find setTimeout calls
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/setTimeout\s*\(/)) {
        let delay = 0;
        let j = i, depth = 0, started = false;
        for (; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '(') { depth++; started = true; }
            else if (ch === ')') { depth--; }
          }
          const dm = lines[j].match(/,\s*(\d+)\s*\)/);
          if (dm) delay = parseInt(dm[1]);
          if (started && depth <= 0) break;
        }
        lineMap.setTimeoutCalls.push({
          line: i + 1, delay,
          bodyStart: i + 2, bodyEnd: j
        });
      }
    }

    // ============ EXECUTION with instrumentation ============
    const capturedLogs = [];
    const macroTimers = [];
    const microtasks = [];
    const promiseMap = new Map();
    let promiseIdCounter = 0;

    function MyPromise(executor) {
      const self = this;
      this._id = ++promiseIdCounter;
      this._state = 'pending';
      this._value = undefined;
      this._thenCallbacks = [];
      this._catchCallbacks = [];
      this._resolved = false;
      promiseMap.set(this, true);

      const resolve = (value) => {
        if (self._resolved) return;
        self._resolved = true;
        self._state = 'fulfilled';
        self._value = value;
        self._thenCallbacks.forEach(cb => {
          microtasks.push({ callback: cb, value });
        });
      };
      const reject = (err) => {
        if (self._resolved) return;
        self._resolved = true;
        self._state = 'rejected';
        self._value = err;
        self._catchCallbacks.forEach(cb => {
          microtasks.push({ callback: cb, value: err, isCatch: true });
        });
      };

      try { executor(resolve, reject); }
      catch (e) { reject(e); }
    }

    MyPromise.prototype.then = function(onF, onR) {
      const next = new MyPromise(() => {});
      if (typeof onF === 'function') this._thenCallbacks.push(onF);
      if (typeof onR === 'function') this._catchCallbacks.push(onR);
      // If already resolved, queue immediately
      if (this._state === 'fulfilled') {
        microtasks.push({ callback: onF, value: this._value });
      } else if (this._state === 'rejected' && typeof onR === 'function') {
        microtasks.push({ callback: onR, value: this._value, isCatch: true });
      }
      return next;
    };
    MyPromise.prototype.catch = function(onR) {
      return this.then(null, onR);
    };

    const capturedLogsInner = [];
    const sandboxConsole = {
      log: (...args) => capturedLogsInner.push(args.join(' '))
    };

    function MySetTimeout(cb, delay) {
      const d = delay || 0;
      const order = macroTimers.length;
      macroTimers.push({ callback: cb, delay: d, order });
      return order;
    }

    // Transform Promise.resolve() to use MyPromise
    let transformed = code;
    transformed = transformed.replace(/Promise\.resolve\s*\(\s*\)/g, 'new Promise(r => r())');
    transformed = transformed.replace(/Promise\.resolve\s*\(\s*([^)]+)\)/g, 'new Promise(r => r($1))');
    transformed = transformed.replace(/Promise\.reject\s*\(\s*([^)]+)\)/g, 'new Promise((r, j) => j($1))');

    let execError = null;
    try {
      const fn = new Function(
        'console', 'setTimeout', 'Promise', 'clearTimeout',
        '"use strict";\n' + transformed
      );
      fn(sandboxConsole, MySetTimeout, MyPromise, function(){});
    } catch (e) { execError = e; }

    // Copy captured logs into our final list
    capturedLogsInner.forEach(t => capturedLogs.push(t));

    // ============ Build the events list ============
    const finalEvents = [];
    let fid = 0;

    // 1. (global) push
    finalEvents.push({ type: 'pushStack', name: '(global)', line: -1, frameId: ++fid,
      desc: 'The <code>(global)</code> execution context is pushed onto the <b>Call Stack</b>. Top-level synchronous code starts executing here.' });

    // 2. Sync logs
    capturedLogs.forEach(text => {
      const ln = lineMap.logs[text] || -1;
      finalEvents.push({
        type: 'log', text, line: ln,
        desc: `<code>console.log("${text}")</code> runs synchronously on the Call Stack. Output is printed immediately.`
      });
    });

    // 3. Web API registrations for setTimeout
    macroTimers.forEach((t, i) => {
      const sc = lineMap.setTimeoutCalls[i];
      const line = sc ? sc.line : -1;
      finalEvents.push({
        type: 'webapiCreate', apiId: t.order,
        name: `setTimeout(cb, ${t.delay}ms)`, line,
        desc: `The browser's <code>setTimeout</code> API is called with delay <b>${t.delay}ms</b>. The callback is handed to the <b>Web APIs</b> environment. Timer runs in the background.`
      });
    });

    // 4. Pop global
    finalEvents.push({ type: 'popStack', name: '(global)', line: -1, frameId: fid,
      desc: 'The synchronous part of the script finishes. The <code>(global)</code> frame is popped. The <b>Call Stack</b> is now empty — the <b>Event Loop</b> takes over.' });

    // 5. First drain: microtasks that exist after sync (from Promise.resolve().then chain)
    if (microtasks.length > 0) {
      finalEvents.push({
        type: 'eventLoopIdle', mode: 'micro', line: -1,
        desc: 'The <b>Microtask Queue</b> has pending <code>.then()</code> callbacks. The Event Loop drains ALL microtasks before handling any macrotask.'
      });

      // Process all currently queued microtasks (they may queue more)
      let safety = 0;
      while (microtasks.length > 0 && safety < 100) {
        safety++;
        const mt = microtasks.shift();
        const stackId = ++fid;
        finalEvents.push({
          type: 'eventLoopMicro', taskId: ++fid, stackFrameId: stackId,
          name: '.then callback', line: -1,
          desc: 'The Event Loop dequeues a <code>.then()</code> callback from the <b>Microtask Queue</b> and pushes it onto the <b>Call Stack</b>.'
        });

        // Capture logs from the callback
        const beforeLen = capturedLogsInner.length;
        try {
          if (typeof mt.callback === 'function') mt.callback(mt.value);
        } catch (e) {}

        // Emit logs
        for (let k = beforeLen; k < capturedLogsInner.length; k++) {
          const text = capturedLogsInner[k];
          const ln = lineMap.logs[text] || -1;
          finalEvents.push({
            type: 'log', text, line: ln,
            desc: `<code>console.log("${text}")</code> runs inside the microtask. Output appears now.`
          });
        }

        finalEvents.push({
          type: 'eventLoopMicroDone', taskId: 0, stackFrameId: stackId,
          name: '.then callback', line: -1,
          desc: 'The microtask finishes and is popped off the Call Stack. The Event Loop checks for more microtasks.'
        });
      }
    }

    // 6. Macrotasks: process one at a time, then drain microtasks after each
    const sortedTimers = macroTimers.slice().sort((a, b) => a.delay - b.delay);

    sortedTimers.forEach((timer, idx) => {
      const stackId = ++fid;
      const sc = lineMap.setTimeoutCalls[idx] || {};

      finalEvents.push({
        type: 'webapiComplete', apiId: timer.order, taskId: ++fid,
        name: `setTimeout callback (${timer.delay}ms)`, line: sc.line || -1,
        desc: `The <b>${timer.delay}ms</b> timer finishes. The callback moves from <b>Web APIs</b> to the <b>Task Queue</b> as a macrotask.`
      });

      finalEvents.push({
        type: 'eventLoopIdle', mode: 'macro', line: -1,
        desc: 'The <b>Microtask Queue</b> is empty. The Event Loop picks up the macrotask from the <b>Task Queue</b>.'
      });

      finalEvents.push({
        type: 'eventLoopMacro', taskId: timer.order, stackFrameId: stackId,
        name: 'setTimeout callback', line: sc.bodyStart || -1,
        desc: 'The Event Loop dequeues the setTimeout callback from the <b>Task Queue</b> and pushes a new frame onto the <b>Call Stack</b>.'
      });

      // Clear microtasks before running this timer (they're already drained)
      microtasks.length = 0;
      const beforeLen = capturedLogsInner.length;

      try {
        if (typeof timer.callback === 'function') timer.callback();
      } catch (e) {}

      for (let k = beforeLen; k < capturedLogsInner.length; k++) {
        const text = capturedLogsInner[k];
        const ln = lineMap.logs[text] || -1;
        finalEvents.push({
          type: 'log', text, line: ln,
          desc: `<code>console.log("${text}")</code> runs synchronously inside the macrotask.`
        });
      }

      finalEvents.push({
        type: 'eventLoopMacroDone', taskId: timer.order, stackFrameId: stackId,
        name: 'setTimeout callback', line: sc.bodyEnd || -1,
        desc: 'The macrotask frame is popped off the Call Stack. Now the Event Loop checks the Microtask Queue.'
      });

      // After the macrotask, drain any microtasks scheduled by resolve()
      if (microtasks.length > 0) {
        finalEvents.push({
          type: 'eventLoopIdle', mode: 'micro', line: -1,
          desc: 'The macrotask called <code>resolve()</code>, scheduling <code>.then()</code> callbacks as microtasks. Event Loop drains them now.'
        });

        let safety = 0;
        while (microtasks.length > 0 && safety < 100) {
          safety++;
          const mt = microtasks.shift();
          const sId = ++fid;
          finalEvents.push({
            type: 'eventLoopMicro', taskId: ++fid, stackFrameId: sId,
            name: '.then callback', line: -1,
            desc: 'The Event Loop dequeues a microtask from the Microtask Queue.'
          });

          const bLen = capturedLogsInner.length;
          try {
            if (typeof mt.callback === 'function') mt.callback(mt.value);
          } catch (e) {}

          for (let k = bLen; k < capturedLogsInner.length; k++) {
            const text = capturedLogsInner[k];
            const ln = lineMap.logs[text] || -1;
            finalEvents.push({
              type: 'log', text, line: ln,
              desc: `<code>console.log("${text}")</code> runs inside the microtask.`
            });
          }

          finalEvents.push({
            type: 'eventLoopMicroDone', taskId: 0, stackFrameId: sId,
            name: '.then callback', line: -1,
            desc: 'The microtask finishes. Popped off the Call Stack.'
          });
        }
      }
    });

    finalEvents.push({
      type: 'allDone', line: -1,
      desc: 'All tasks are complete. The Call Stack, Web APIs, Microtask Queue, and Task Queue are empty. The Event Loop is idle.'
    });

    return finalEvents;
  }

  // ============ APPLY STEP ============
  function applyStep(step) {
    clearActives();

    if (step.line && step.line > 0) {
      currentLineNum = step.line;
      let lineType = 'stack-line';
      if (step.type && (step.type.indexOf('Micro') !== -1 || step.type.indexOf('micro') !== -1)) {
        lineType = 'micro-line';
      } else if (step.type && (step.type.indexOf('Macro') !== -1 || step.type.indexOf('macro') !== -1)) {
        lineType = 'macro-line';
      } else if (step.type === 'webapiCreate' || step.type === 'webapiComplete') {
        lineType = 'webapi-line';
      }
      window.__activeLineType = lineType;
    } else {
      currentLineNum = -1;
    }

    switch (step.type) {
      case 'pushStack':
        state.callStack.push({ id: step.frameId || newId(), name: step.name, active: true });
        setCardActive('stack');
        eventloopStatus.textContent = `stack: ${step.name}`;
        break;

      case 'popStack':
        state.callStack = state.callStack.filter(f => f.name !== step.name);
        break;

      case 'log':
        if (step.text) addConsole(step.text);
        break;

      case 'webapiCreate': {
        const id = step.apiId !== undefined ? step.apiId : newId();
        state.webAPIs.push({ id, name: step.name, active: true });
        setCardActive('webapi');
        eventloopStatus.textContent = `web api: ${step.name}`;
        break;
      }

      case 'webapiComplete': {
        state.webAPIs = state.webAPIs.filter(a => a.id !== step.apiId);
        state.macroQueue.push({ id: step.taskId || newId(), name: step.name, active: true });
        setCardActive('macro');
        eventloopStatus.textContent = 'timer fired → task queue';
        break;
      }

      case 'eventLoopIdle':
        if (step.mode === 'micro') {
          setCardActive('micro');
          eventloopStatus.textContent = 'event loop → microtasks';
        } else {
          setCardActive('macro');
          eventloopStatus.textContent = 'event loop → macrotasks';
        }
        break;

      case 'eventLoopMicro':
        state.microQueue = state.microQueue.filter(t => t.id !== step.taskId);
        state.callStack.push({ id: step.stackFrameId, name: `⏳ ${step.name}`, active: true });
        setCardActive('stack');
        eventloopStatus.textContent = 'micro on stack';
        break;

      case 'eventLoopMicroDone':
        state.callStack = state.callStack.filter(f => f.id !== step.stackFrameId);
        setCardActive('micro');
        break;

      case 'eventLoopMacro':
        state.macroQueue = state.macroQueue.filter(t => t.id !== step.taskId);
        state.callStack.push({ id: step.stackFrameId, name: `⏳ ${step.name}`, active: true });
        setCardActive('stack');
        eventloopStatus.textContent = 'macro on stack';
        break;

      case 'eventLoopMacroDone':
        state.callStack = state.callStack.filter(f => f.id !== step.stackFrameId);
        setCardActive('macro');
        break;

      case 'allDone':
        setCardActive(null);
        eventloopStatus.textContent = 'idle';
        currentLineNum = -1;
        break;
    }

    explanation.innerHTML = `<div class="step-label">Step ${stepIndex} of ${steps.length}</div><div>${step.desc || step.type}</div>`;
    render();
  }

  // ============ RUN ============
  function run() {
    stopAuto();
    resetState(true);

    currentCode = codeInput.value || currentCode;
    try {
      steps = traceExecution(currentCode);
    } catch (e) {
      steps = [{ type: 'allDone', line: -1, desc: 'Error during trace: ' + e.message }];
    }
    stepIndex = 0;

    nextBtn.disabled = steps.length === 0;
    autoBtn.disabled = steps.length === 0;
    runBtn.disabled = true;

    progressInfo.textContent = `Ready · ${steps.length} steps`;
    eventloopStatus.textContent = 'idle';
    render();

    explanation.innerHTML = `<div class="step-label">Ready</div><div>Code loaded (${steps.length} steps). Click <code>Next Step</code> to walk through execution line-by-line.</div>`;
  }

  // ============ NEXT STEP ============
  function nextStep() {
    if (stepIndex >= steps.length) return;
    stepIndex++;
    applyStep(steps[stepIndex - 1]);
    progressInfo.textContent = `Step ${stepIndex} / ${steps.length}`;
    if (stepIndex >= steps.length) {
      nextBtn.disabled = true;
      autoBtn.disabled = true;
      stopAuto();
    }
  }

  // ============ AUTO ============
  function startAuto() {
    if (autoTimer) return;
    autoBtn.textContent = '⏸ Pause';
    autoTimer = setInterval(() => {
      if (stepIndex >= steps.length) { stopAuto(); return; }
      nextStep();
    }, 900);
  }
  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
      autoBtn.textContent = '⏯ Auto';
    }
  }
  function toggleAuto() {
    if (autoTimer) stopAuto();
    else if (stepIndex < steps.length) startAuto();
  }

  // ============ RESET ============
  function resetState(keepCode) {
    stopAuto();
    state = { callStack: [], webAPIs: [], macroQueue: [], microQueue: [], nextId: 1, consoleLines: [] };
    steps = [];
    stepIndex = 0;
    currentLineNum = -1;
    clearActives();
    setCardActive(null);
    eventloopStatus.textContent = 'idle';
    render();
    renderConsole();
    nextBtn.disabled = true;
    autoBtn.disabled = true;
    runBtn.disabled = false;
    progressInfo.textContent = '';
    explanation.innerHTML = `<div class="step-label">Ready</div><div>Click <code>Run</code> to load your code, then use <code>Next Step</code>.</div>`;
    if (!keepCode) {
      currentCode = codeInput.value;
      renderCodeDisplay();
    }
  }

  // ============ EDIT MODE ============
  function toggleEdit() {
    isEditMode = !isEditMode;
    if (isEditMode) {
      codeInput.value = currentCode;
      codeInput.style.display = 'block';
      codeContainer.style.display = 'none';
      editBtn.textContent = '✓ Done';
    } else {
      currentCode = codeInput.value;
      codeInput.style.display = 'none';
      codeContainer.style.display = 'block';
      editBtn.textContent = '✎ Edit';
      renderCodeDisplay();
      resetState(true);
    }
  }

  // ============ WIRE UP ============
  runBtn.addEventListener('click', run);
  nextBtn.addEventListener('click', nextStep);
  resetBtn.addEventListener('click', () => resetState(false));
  autoBtn.addEventListener('click', toggleAuto);
  editBtn.addEventListener('click', toggleEdit);

  exampleSelect.addEventListener('change', (e) => {
    const key = e.target.value;
    if (examples[key]) {
      currentCode = examples[key];
      codeInput.value = currentCode;
      if (isEditMode) toggleEdit();
      renderCodeDisplay();
      resetState(true);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.matches('textarea, select, input, button')) {
      e.preventDefault();
      if (!nextBtn.disabled) nextStep();
    }
  });

  // ============ INIT ============
  codeInput.value = currentCode;
  renderCodeDisplay();
  render();
  renderConsole();
})();