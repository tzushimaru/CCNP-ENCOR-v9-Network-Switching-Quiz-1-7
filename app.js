const STORAGE_KEY = 'network-switching-quiz-state';
const state = {
  questions: [], stages: [], stageIndex: 0, queue: [], current: 0,
  correct: 0, retry: 0, checked: false, selected: new Set(),
  status: new Map(), failedByStage: {},
  settings: { randomQuestions: true, randomAnswers: false, onlyWrong: false }
};
const el = id => document.getElementById(id);

async function start() {
  const response = await fetch('questions.json');
  state.questions = await response.json();
  state.stages = [[0, 20], [20, 40], [40, 58], [0, state.questions.length]];
  restoreState();
  buildStageTabs();
  bindControls();
  if (state.queue.length) renderQuestion(); else loadStage(0);
}

function bindControls() {
  el('restart-button').onclick = () => loadStage(state.stageIndex);
  el('check-button').onclick = checkAnswer;
  el('skip-button').onclick = () => markRetry(true);
  el('overview-button').onclick = showOverview;
  el('close-overview-button').onclick = closeOverview;
  el('next-stage-button').onclick = () => loadStage(state.stageIndex + 1);
  el('retry-errors-button').onclick = retryErrors;
  ['random-questions', 'random-answers', 'only-wrong'].forEach(id => {
    const setting = id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    el(id).checked = state.settings[setting];
    el(id).onchange = () => {
      state.settings[setting] = el(id).checked;
      saveState();
      if (setting === 'randomAnswers') renderQuestion();
      else loadStage(state.stageIndex);
    };
  });
}

function buildStageTabs() {
  el('stage-tabs').innerHTML = state.stages.map((range, index) => `<button class="stage-tab" data-stage="${index}" type="button">Blok ${index + 1}<br><small>${range[1] - range[0]} otázek</small></button>`).join('');
  document.querySelectorAll('.stage-tab').forEach(button => button.onclick = () => loadStage(Number(button.dataset.stage)));
  updateTabs();
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function loadStage(index, customQueue = null) {
  if (index >= state.stages.length) index = 0;
  state.stageIndex = index;
  const [from, to] = state.stages[index];
  let indexes = customQueue || Array.from({ length: to - from }, (_, offset) => from + offset);
  if (!customQueue && state.settings.onlyWrong) {
    const failed = state.failedByStage[index] || [];
    if (failed.length) indexes = failed;
  }
  state.queue = state.settings.randomQuestions ? shuffle([...indexes]) : [...indexes];
  state.current = 0; state.correct = 0; state.retry = 0; state.status = new Map();
  el('quiz-view').hidden = false; el('complete-view').hidden = true; el('overview-view').hidden = true;
  updateTabs(); saveState(); renderQuestion();
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.queue) || saved.queue.length === 0) return;
    Object.assign(state.settings, saved.settings || {});
    state.stageIndex = saved.stageIndex || 0;
    state.queue = saved.queue; state.current = Math.min(saved.current || 0, state.queue.length - 1);
    state.correct = saved.correct || 0; state.retry = saved.retry || 0;
    state.failedByStage = saved.failedByStage || {};
    state.status = new Map(Object.entries(saved.status || {}));
  } catch { localStorage.removeItem(STORAGE_KEY); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    stageIndex: state.stageIndex, queue: state.queue, current: state.current,
    correct: state.correct, retry: state.retry, failedByStage: state.failedByStage,
    status: Object.fromEntries(state.status), settings: state.settings
  }));
  el('save-status').textContent = 'Uloženo automaticky';
}

function updateTabs() { document.querySelectorAll('.stage-tab').forEach((tab, index) => tab.classList.toggle('active', index === state.stageIndex)); }
function currentQuestion() { return state.questions[state.queue[state.current]]; }

function renderQuestion() {
  const question = currentQuestion();
  if (!question) return finishStage();
  state.checked = false; state.selected = new Set();
  el('question-number').textContent = `Otázka ${question.number}`;
      el('question-type').textContent = question.ordering ? 'Seřaďte kroky do správného pořadí' : question.matching ? 'Přiřaďte správné dvojice' : question.multi ? 'Více správných odpovědí' : question.special ? 'Původní obrazová otázka' : 'Jedna správná odpověď';
  el('question-text').textContent = question.text;
  el('question-media').innerHTML = question.image ? `<img src="${question.image}" alt="">` : '';
  const choices = (question.options || []).map((text, originalIndex) => ({ text, originalIndex }));
  if (state.settings.randomAnswers) shuffle(choices);
  const matches = (question.matching || []).map((text, originalIndex) => ({ text, originalIndex }));
  if (state.settings.randomAnswers) shuffle(matches);
  const form = el('answer-form');
  form.innerHTML = question.ordering ? choices.map(choice => `<label class="answer-option ordering-option" data-index="${choice.originalIndex}"><span>${choice.text}</span><select name="order" aria-label="Pořadí kroku"><option value="">Pořadí</option>${choices.map((_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}</select></label>`).join('') : question.matching ? choices.map(choice => `<label class="answer-option matching-option" data-index="${choice.originalIndex}"><span>${choice.text}</span><select name="match" aria-label="Přiřazená odpověď"><option value="">Vyberte odpověď</option>${matches.map(match => `<option value="${match.originalIndex}">${match.text}</option>`).join('')}</select></label>`).join('') : choices.length ? choices.map(choice => `<label class="answer-option"><input type="${question.multi ? 'checkbox' : 'radio'}" name="answer" value="${choice.originalIndex}"><span>${choice.text}</span></label>`).join('') : '<div class="special-note">Tato otázka je v dodaném zdroji uvedena jako obrazová/řadicí otázka bez ABCD variant.</div>';
  form.querySelectorAll('input').forEach(input => input.onchange = () => {
    if (question.multi) input.checked ? state.selected.add(Number(input.value)) : state.selected.delete(Number(input.value));
    else state.selected = new Set([Number(input.value)]);
    input.closest('label').classList.toggle('selected', input.checked);
  });
  form.querySelectorAll('select').forEach(select => select.onchange = () => select.closest('label').classList.remove('selected'));
  el('feedback').textContent = ''; el('feedback').className = 'feedback';
  el('explanation').textContent = ''; el('explanation').hidden = true;
  el('check-button').textContent = 'Zkontrolovat';
  el('correct-count').textContent = state.correct; el('retry-count').textContent = state.retry; updateProgress();
}

function updateProgress() {
  const total = state.queue.length;
  el('stage-label').textContent = `Blok ${state.stageIndex + 1} z ${state.stages.length}`;
  el('progress-label').textContent = `${state.current} / ${total}`;
  el('progress-bar').style.width = `${state.current / total * 100}%`;
}

function checkAnswer() {
  if (state.checked) return nextQuestion();
  const question = currentQuestion();
  if (question.special) return markRetry(false);
  const correct = state.selected.size === question.correct.length && question.correct.every(answer => state.selected.has(answer));
  if (question.ordering) return checkOrderingAnswer(question);
  if (question.matching) return checkMatchingAnswer(question);
  el('answer-form').querySelectorAll('.answer-option').forEach(label => {
    const index = Number(label.querySelector('input').value);
    if (question.correct.includes(index)) label.classList.add('correct');
    else if (state.selected.has(index)) label.classList.add('incorrect');
  });
  if (correct) {
    state.checked = true; state.correct++; state.status.set(String(question.number), 'done');
    state.failedByStage[state.stageIndex] = (state.failedByStage[state.stageIndex] || []).filter(index => index !== state.queue[state.current]);
    el('feedback').textContent = 'Správně.'; el('feedback').className = 'feedback success';
    showExplanation(question);
    el('check-button').textContent = 'Další otázka';
  } else markRetry(false);
  el('correct-count').textContent = state.correct; el('retry-count').textContent = state.retry; saveState();
}

function checkOrderingAnswer(question) {
  const labels = [...el('answer-form').querySelectorAll('.ordering-option')];
  const values = labels.map(label => Number(label.querySelector('select').value) - 1);
  const complete = values.every(value => value >= 0) && new Set(values).size === question.options.length;
  const correct = complete && labels.every(label => Number(label.querySelector('select').value) - 1 === Number(label.dataset.index));
  labels.forEach(label => label.classList.add(correct || Number(label.querySelector('select').value) - 1 === Number(label.dataset.index) ? 'correct' : 'incorrect'));
  if (correct) {
    state.checked = true;
    state.correct++;
    state.status.set(String(question.number), 'done');
    el('feedback').textContent = 'Správně. Pořadí kroků sedí.';
    el('feedback').className = 'feedback success';
    showExplanation(question);
    el('check-button').textContent = 'Další otázka';
  } else {
    markRetry(false);
    el('feedback').textContent = complete ? 'Špatně. Správné pořadí je označeno zeleně.' : 'Vyberte každé pořadí právě jednou. Správné pořadí je označeno zeleně.';
  }
  el('correct-count').textContent = state.correct;
  el('retry-count').textContent = state.retry;
  saveState();
}

function checkMatchingAnswer(question) {
  const labels = [...el('answer-form').querySelectorAll('.matching-option')];
  const values = labels.map(label => Number(label.querySelector('select').value));
  const complete = values.every(value => Number.isInteger(value)) && new Set(values).size === question.options.length;
  const correct = complete && labels.every(label => Number(label.querySelector('select').value) === Number(label.dataset.index));
  labels.forEach(label => label.classList.add(correct || Number(label.querySelector('select').value) === Number(label.dataset.index) ? 'correct' : 'incorrect'));
  if (correct) {
    state.checked = true;
    state.correct++;
    state.status.set(String(question.number), 'done');
    el('feedback').textContent = 'Správně. Všechny dvojice jsou přiřazené.';
    el('feedback').className = 'feedback success';
    showExplanation(question);
    el('check-button').textContent = 'Další otázka';
  } else {
    markRetry(false);
    el('feedback').textContent = complete ? 'Špatně. Správné přiřazení je označeno zeleně.' : 'Vyberte každou odpověď právě jednou. Správné přiřazení je označeno zeleně.';
  }
  el('correct-count').textContent = state.correct;
  el('retry-count').textContent = state.retry;
  saveState();
}

function markRetry(skipped) {
  if (state.checked) return;
  const question = currentQuestion(); state.retry++; state.status.set(String(question.number), 'retry');
  const failures = new Set(state.failedByStage[state.stageIndex] || []);
  failures.add(state.queue[state.current]); state.failedByStage[state.stageIndex] = [...failures];
  state.queue.push(state.queue[state.current]);
  el('feedback').textContent = skipped ? 'Otázka se vrátí později.' : 'Špatně. Správná odpověď je označena zeleně.';
  el('feedback').className = 'feedback warning'; el('check-button').textContent = 'Další otázka';
  if (!skipped) showExplanation(question);
  el('retry-count').textContent = state.retry; state.checked = true; saveState();
  if (skipped) setTimeout(nextQuestion, 650);
}

function showExplanation(question) {
  if (!question.explanation) return;
  el('explanation').textContent = question.explanation;
  el('explanation').hidden = false;
}

function nextQuestion() { if (state.current < state.queue.length - 1) { state.current++; saveState(); renderQuestion(); } else finishStage(); }
function finishStage() {
  el('quiz-view').hidden = true; el('complete-view').hidden = false;
  el('complete-summary').textContent = `Správně bez opakování: ${state.correct}. Opakování: ${state.retry}.`;
  el('next-stage-button').textContent = state.stageIndex === state.stages.length - 1 ? 'Začít znovu' : 'Pokračovat na další blok';
  el('retry-errors-button').hidden = !(state.failedByStage[state.stageIndex] || []).length; saveState();
}
function retryErrors() { const failed = state.failedByStage[state.stageIndex] || []; if (failed.length) loadStage(state.stageIndex, failed); }
function showOverview() { el('quiz-view').hidden = true; el('complete-view').hidden = true; el('overview-view').hidden = false; el('overview-grid').innerHTML = state.queue.map(index => { const question = state.questions[index]; return `<button class="overview-item ${state.status.get(String(question.number)) || ''}" type="button">${question.number}</button>`; }).join(''); }
function closeOverview() { el('overview-view').hidden = true; el('quiz-view').hidden = false; }
start().catch(error => { document.body.innerHTML = `<main class="app-shell"><h1>Data se nepodařilo načíst.</h1><p>${error.message}</p></main>`; });
