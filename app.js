import * as pdfjsLib from './vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_PAGES = 40;
const MAX_TEXT_CHARS = 80_000;
const emptyState = document.querySelector('#emptyState');
const workspace = document.querySelector('#workspace');
const dropZone = document.querySelector('#dropZone');
const fileInput = document.querySelector('#fileInput');
const loadStatus = document.querySelector('#loadStatus');
const studyContent = document.querySelector('#studyContent');
const resultArea = document.querySelector('#resultArea');
const pageList = document.querySelector('#pageList');
const toast = document.querySelector('#toast');
let pages = [];
let activeMode = 'ask';
let flashcards = [];
let cardIndex = 0;
let quizQuestions = [];
let toastTimer;

function setStatus(message, isError = false) {
  loadStatus.hidden = !message;
  loadStatus.textContent = message;
  loadStatus.classList.toggle('error', isError);
}
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function resetResult() { resultArea.replaceChildren(); }

async function loadPdf(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Pilih file PDF yang valid.', true); return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus('Ukuran file melebihi batas 12 MB.', true); return;
  }
  setStatus('Membaca teks PDF di browser…');
  document.querySelector('#chooseFileButton').disabled = true;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    if (pdf.numPages > MAX_PAGES) throw new Error(`PDF ini memiliki ${pdf.numPages} halaman. Batas sesi adalah ${MAX_PAGES} halaman.`);
    const extracted = [];
    let total = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setStatus(`Membaca halaman ${pageNumber} dari ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = '';
      const lines = [];
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        line += item.str;
        if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; }
        else if (item.str.endsWith(' ')) { line += ' '; }
      }
      if (line.trim()) lines.push(line.trim());
      const text = lines.join('\n').replace(/[\t\u00a0]+/g, ' ').trim();
      if (text) { extracted.push({ page:pageNumber, text }); total += text.length; }
      if (total > MAX_TEXT_CHARS) throw new Error('Teks PDF melebihi batas 80.000 karakter untuk satu sesi.');
    }
    if (!extracted.length || total < 30) throw new Error('Teks tidak ditemukan. PDF hasil pindai/foto belum didukung; gunakan PDF yang teksnya dapat dipilih.');
    pages = extracted;
    document.querySelector('#documentName').textContent = file.name;
    document.querySelector('#documentMeta').textContent = `${pdf.numPages} halaman · ${total.toLocaleString('id-ID')} karakter`;
    document.querySelector('#sourcePageCount').textContent = String(pdf.numPages);
    renderPages();
    emptyState.hidden = true;
    workspace.hidden = false;
    setStatus('');
    setMode('ask');
    showToast('PDF siap. Teks hanya berada di sesi browser ini.');
  } catch (error) {
    setStatus(error?.message?.includes('Invalid PDF') ? 'File tidak dapat dibaca sebagai PDF. Pastikan file tidak rusak.' : (error?.message || 'PDF gagal dibaca.'), true);
  } finally {
    document.querySelector('#chooseFileButton').disabled = false;
    fileInput.value = '';
  }
}

function renderPages() {
  pageList.replaceChildren();
  pages.forEach(({ page, text }, index) => {
    const card = make('article','page-card');
    const head = make('div','page-card-head');
    head.append(make('span','page-label',`HALAMAN ${page}`));
    const preview = make('p','page-preview',text.slice(0,220).replace(/\s+/g,' '));
    if (text.length > 220) preview.textContent += '…';
    card.append(head,preview);
    if (text.length > 220) {
      const more = make('button','page-more','Lihat teks');
      more.type = 'button';
      more.addEventListener('click',() => {
        const open = more.getAttribute('aria-expanded') === 'true';
        preview.textContent = open ? `${text.slice(0,220).replace(/\s+/g,' ')}${text.length > 220 ? '…' : ''}` : text;
        more.textContent = open ? 'Lihat teks' : 'Ringkas kembali';
        more.setAttribute('aria-expanded',String(!open));
      });
      card.append(more);
    }
    pageList.append(card);
  });
}

function setMode(mode) {
  activeMode = mode;
  resetResult();
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-selected',String(selected));
  });
  studyContent.replaceChildren();
  if (mode === 'ask') renderAskForm();
  else renderGeneratePrompt(mode);
}

function renderAskForm() {
  const form = make('form','question-form');
  const label = make('label','field-label','Tulis pertanyaanmu');
  label.htmlFor = 'questionInput';
  const textarea = document.createElement('textarea');
  textarea.id = 'questionInput';
  textarea.name = 'question';
  textarea.maxLength = 600;
  textarea.rows = 4;
  textarea.placeholder = 'Contoh: Apa tiga konsep utama dalam materi ini?';
  textarea.required = true;
  const bottom = make('div','form-bottom');
  const hint = make('span','input-hint','Coba tanyakan konsep, contoh, atau hubungan antarbagian.');
  const button = make('button','button button-primary send-button','Tanyakan AI');
  button.type = 'submit';
  button.insertAdjacentHTML('beforeend',' <span aria-hidden="true">↗</span>');
  bottom.append(hint,button);
  form.append(label,textarea,bottom);
  form.addEventListener('submit',(event) => {
    event.preventDefault();
    runStudy('ask',{ question:textarea.value.trim() },button);
  });
  studyContent.append(form);
}

function renderGeneratePrompt(mode) {
  const panel = make('div','generator-card');
  const art = make('div','generator-art',mode === 'flashcards' ? '▤' : '✳');
  const text = make('div','generator-copy');
  text.append(make('h3','',mode === 'flashcards' ? 'Ingat poin-poin penting' : 'Uji pemahamanmu'));
  text.append(make('p','',mode === 'flashcards' ? 'Buat kartu hafalan dari konsep utama dalam PDF. Tiap kartu punya rujukan halaman.' : 'Latihan pilihan ganda singkat berdasarkan isi PDF, lengkap dengan penjelasan jawaban.'));
  const button = make('button','button button-primary',mode === 'flashcards' ? 'Buat kartu hafalan' : 'Buat kuis');
  button.type = 'button';
  button.insertAdjacentHTML('beforeend',' <span aria-hidden="true">↗</span>');
  button.addEventListener('click',() => runStudy(mode,{},button));
  panel.append(art,text,button);
  studyContent.append(panel);
}

async function runStudy(mode,extra,button) {
  resetResult();
  button.disabled = true;
  const oldText = button.firstChild?.textContent?.trim() || button.textContent;
  button.textContent = 'Sedang menyiapkan…';
  const loading = make('div','loading-state');
  loading.append(make('span','spinner'),make('span','',mode === 'ask' ? 'Mencari jawaban di materi…' : 'Menyusun latihan dari materi…'));
  resultArea.append(loading);
  try {
    const response = await fetch('/api/study',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mode,pages,question:extra.question || ''}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
    resetResult();
    if (mode === 'ask') renderAnswer(data);
    if (mode === 'flashcards') { flashcards = data.cards || []; cardIndex = 0; renderFlashcard(); }
    if (mode === 'quiz') { quizQuestions = data.questions || []; renderQuiz(); }
  } catch (error) {
    resetResult();
    const errorCard = make('div','error-card');
    errorCard.append(make('strong','', 'Belum berhasil'),make('p','',error.message || 'Coba lagi sebentar lagi.'));
    resultArea.append(errorCard);
  } finally {
    button.disabled = false;
    button.replaceChildren(document.createTextNode(oldText));
    const span = document.createElement('span'); span.setAttribute('aria-hidden','true'); span.textContent = ' ↗'; button.append(span);
  }
}

function addCitation(container,citation) {
  if (!citation || !Number.isInteger(citation.page)) return;
  const line = make('div','citation');
  line.append(make('span','citation-badge',`HAL. ${citation.page}`));
  if (citation.quote) line.append(make('span','citation-quote',`“${citation.quote}”`));
  container.append(line);
}

function renderAnswer(data) {
  const card = make('article','answer-card');
  const head = make('div','answer-head');
  head.append(make('span','answer-mark','✳'),make('span','eyebrow','JAWABAN DARI MATERI'));
  const answer = make('div','answer-text');
  String(data.answer || '').split(/\n+/).filter(Boolean).forEach((line) => answer.append(make('p','',line)));
  card.append(head,answer);
  if (Array.isArray(data.citations) && data.citations.length) {
    const citeWrap = make('div','citations-wrap');
    data.citations.forEach((citation) => addCitation(citeWrap,citation));
    card.append(citeWrap);
  } else card.append(make('p','no-citation','Belum ada kutipan halaman yang bisa dipastikan; periksa langsung PDF sebelum mengandalkan jawaban ini.'));
  card.append(make('p','ai-caveat','Jawaban AI bisa keliru. Cocokkan dengan isi materi asli.'));
  resultArea.append(card);
}

function renderFlashcard() {
  resetResult();
  if (!flashcards.length) return;
  const wrapper = make('div','flashcard-result');
  wrapper.append(make('div','result-kicker',`KARTU ${cardIndex + 1} DARI ${flashcards.length}`));
  const card = make('button',`flashcard${flashcards[cardIndex].flipped ? ' is-flipped' : ''}`);
  card.type = 'button';
  card.setAttribute('aria-label','Balik kartu hafalan');
  const current = flashcards[cardIndex];
  card.append(make('span','card-side-label',current.flipped ? 'JAWABAN' : 'KONSEP'),make('span','flashcard-text',current.flipped ? current.back : current.front),make('span','flip-hint','Klik kartu untuk membalik'));
  card.addEventListener('click',() => { current.flipped = !current.flipped; renderFlashcard(); });
  wrapper.append(card);
  const controls = make('div','card-controls');
  const prev = make('button','button button-quiet','← Sebelumnya'); prev.type = 'button'; prev.disabled = cardIndex === 0;
  const next = make('button','button button-primary','Berikutnya →'); next.type = 'button'; next.disabled = cardIndex === flashcards.length - 1;
  prev.addEventListener('click',() => { cardIndex -= 1; renderFlashcard(); });
  next.addEventListener('click',() => { cardIndex += 1; renderFlashcard(); });
  controls.append(prev,next); wrapper.append(controls);
  addCitation(wrapper,{page:current.page,quote:current.quote});
  resultArea.append(wrapper);
}

function renderQuiz() {
  resetResult();
  const form = make('form','quiz-form');
  quizQuestions.forEach((item,index) => {
    const question = make('fieldset','quiz-question');
    question.append(make('legend','quiz-legend',`${index + 1}. ${item.question}`));
    item.choices.forEach((choice,choiceIndex) => {
      const label = make('label','quiz-choice');
      const input = document.createElement('input');
      input.type = 'radio'; input.name = `question-${index}`; input.value = String(choiceIndex); input.required = true;
      label.append(input,make('span','',choice));
      question.append(label);
    });
    addCitation(question,{page:item.page,quote:item.quote});
    form.append(question);
  });
  const submit = make('button','button button-primary','Periksa jawaban'); submit.type = 'submit'; form.append(submit);
  form.addEventListener('submit',(event) => {
    event.preventDefault();
    const results = [];
    quizQuestions.forEach((item,index) => {
      const selected = form.querySelector(`input[name="question-${index}"]:checked`);
      const correct = Number(selected?.value) === item.answer_index;
      const box = make('div',`quiz-feedback ${correct ? 'correct' : 'incorrect'}`);
      box.append(make('strong','',correct ? 'Tepat!' : `Belum tepat — jawaban: ${item.choices[item.answer_index]}`),make('p','',item.explanation));
      results.push(box);
    });
    form.querySelectorAll('.quiz-feedback').forEach((node) => node.remove());
    form.querySelectorAll('.quiz-question').forEach((node,index) => node.append(results[index]));
    submit.textContent = `Skor: ${quizQuestions.filter((item,index) => Number(form.querySelector(`input[name="question-${index}"]:checked`)?.value) === item.answer_index).length} / ${quizQuestions.length}`;
    submit.disabled = true;
  });
  resultArea.append(form);
}

function closeDocument() {
  pages = []; flashcards = []; quizQuestions = [];
  workspace.hidden = true; emptyState.hidden = false; resetResult(); setStatus(''); setMode('ask');
}

document.querySelector('#chooseFileButton').addEventListener('click',() => fileInput.click());
fileInput.addEventListener('change',(event) => loadPdf(event.target.files?.[0]));
dropZone.addEventListener('click',(event) => { if (event.target.closest('button')) return; fileInput.click(); });
for (const eventName of ['dragenter','dragover']) dropZone.addEventListener(eventName,(event) => { event.preventDefault(); dropZone.classList.add('dragging'); });
for (const eventName of ['dragleave','drop']) dropZone.addEventListener(eventName,(event) => { event.preventDefault(); dropZone.classList.remove('dragging'); });
dropZone.addEventListener('drop',(event) => loadPdf(event.dataTransfer.files?.[0]));
document.querySelector('#removeDocument').addEventListener('click',closeDocument);
document.querySelectorAll('.mode-tab').forEach((tab) => tab.addEventListener('click',() => setMode(tab.dataset.mode)));
setMode('ask');
