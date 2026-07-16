const PAGE_SIZE = 100;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const elements = {
  counter: document.querySelector("#counter"),
  counterCopy: document.querySelector("#counter-copy"),
  todayCard: document.querySelector("#today-card"),
  archiveList: document.querySelector("#archive-list"),
  archiveCount: document.querySelector("#archive-count"),
  archiveSearch: document.querySelector("#archive-search"),
  loadMore: document.querySelector("#load-more"),
  emptyState: document.querySelector("#empty-state"),
  shareButton: document.querySelector("#share-button"),
};

let allAnswers = [];
let visibleAnswers = [];
let visibleLimit = PAGE_SIZE;
let latest = null;

function formatDate(date) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function answerTiles(answer) {
  const wrapper = document.createElement("div");
  wrapper.className = "answer-cell";
  wrapper.setAttribute("aria-label", answer);

  for (const letter of answer) {
    const tile = document.createElement("span");
    tile.setAttribute("aria-hidden", "true");
    tile.textContent = letter;
    wrapper.append(tile);
  }

  return wrapper;
}

function archiveRow(record) {
  const row = document.createElement("div");
  row.className = "archive-row";
  row.setAttribute("role", "row");

  const days = document.createElement("div");
  days.className = "days-cell";
  days.setAttribute("role", "cell");
  days.innerHTML = `<span class="days-number">${record.daysSinceTarget}</span><span class="days-word">days</span>`;

  const answer = answerTiles(record.answer);
  answer.setAttribute("role", "cell");

  const date = document.createElement("span");
  date.className = "date-cell";
  date.setAttribute("role", "cell");
  date.textContent = formatDate(record.date);

  const puzzle = document.createElement("span");
  puzzle.className = "puzzle-cell";
  puzzle.setAttribute("role", "cell");
  puzzle.textContent = `#${record.puzzle}`;

  row.append(days, answer, date, puzzle);
  return row;
}

function renderArchive() {
  const fragment = document.createDocumentFragment();
  const records = visibleAnswers.slice(0, visibleLimit);
  for (const record of records) fragment.append(archiveRow(record));
  elements.archiveList.replaceChildren(fragment);

  elements.archiveCount.textContent = `${visibleAnswers.length.toLocaleString()} ${visibleAnswers.length === 1 ? "day" : "days"} on file`;
  elements.emptyState.hidden = visibleAnswers.length !== 0;
  elements.loadMore.hidden = visibleLimit >= visibleAnswers.length;
}

function filterArchive() {
  const query = elements.archiveSearch.value.trim().toLowerCase();
  visibleLimit = PAGE_SIZE;

  if (!query) {
    visibleAnswers = allAnswers;
  } else {
    const cleanPuzzle = query.replace(/^#/, "");
    visibleAnswers = allAnswers.filter((record) => {
      const longDate = formatDate(record.date).toLowerCase();
      return record.answer.toLowerCase().includes(query)
        || record.date.includes(query)
        || longDate.includes(query)
        || String(record.puzzle) === cleanPuzzle;
    });
  }

  renderArchive();
}

function renderHero(record, target) {
  const hitToday = record.answer === target;
  elements.counter.textContent = record.daysSinceTarget.toLocaleString();
  elements.counter.classList.remove("skeleton");

  if (hitToday) {
    document.body.classList.add("target-hit");
    elements.counterCopy.innerHTML = `since <strong>${target}</strong> was the Wordle answer. It happened today. Everybody remain calm.`;
    elements.todayCard.innerHTML = `<span class="today-label"><strong>AT LAST:</strong> #${record.puzzle} · ${formatDate(record.date)} · ${record.answer}</span>`;
  } else {
    elements.todayCard.innerHTML = `<span class="today-label"><strong>Today’s not the day:</strong> #${record.puzzle} · ${formatDate(record.date)} · ${record.answer}</span>`;
  }
}

async function share() {
  const message = `${latest.daysSinceTarget.toLocaleString()} days since CUNTS was the Wordle answer. The vigil continues.`;

  if (navigator.share) {
    await navigator.share({ title: document.title, text: message, url: location.href });
    return;
  }

  await navigator.clipboard.writeText(`${message} ${location.href}`);
  const original = elements.shareButton.textContent;
  elements.shareButton.textContent = "Copied. Go spread the word.";
  setTimeout(() => { elements.shareButton.textContent = original; }, 2200);
}

async function initialize() {
  try {
    const response = await fetch("/data/wordle.json");
    if (!response.ok) throw new Error(`Data request failed with ${response.status}`);
    const data = await response.json();

    latest = data.latest;
    allAnswers = [...data.answers].reverse();
    visibleAnswers = allAnswers;
    renderHero(latest, data.target);
    renderArchive();
  } catch (error) {
    console.error(error);
    elements.counter.textContent = "?";
    elements.counter.classList.remove("skeleton");
    elements.todayCard.textContent = "The tally is temporarily indisposed. A scandal.";
    elements.archiveCount.textContent = "Archive unavailable";
  }
}

elements.archiveSearch.addEventListener("input", filterArchive);
elements.loadMore.addEventListener("click", () => {
  visibleLimit += PAGE_SIZE;
  renderArchive();
});
elements.shareButton.addEventListener("click", () => share().catch(console.error));

initialize();
