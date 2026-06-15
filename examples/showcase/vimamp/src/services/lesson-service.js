const GRID_MOVES = {
  h: [-1, 0],
  j: [0, 1],
  k: [0, -1],
  l: [1, 0],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildProgressBar(current, total, width = 20) {
  const safeTotal = Math.max(total, 1);
  const ratio = current / safeTotal;
  const filled = Math.round(ratio * width);
  return `${"#".repeat(filled)}${"-".repeat(Math.max(width - filled, 0))}`;
}

function formatMissionStep(token) {
  if (!token) {
    return "-";
  }
  if (token === "<Esc>") {
    return "Esc";
  }
  if (/^<C-.>$/.test(token)) {
    return `Ctrl + ${token.slice(3, 4).toUpperCase()}`;
  }
  return token;
}

function formatLessonHeading(lesson) {
  if (!lesson) {
    return "";
  }
  return `${lesson.title} (${lesson.shortcut})`;
}

function sequenceProgressLines(snapshot) {
  const tokens = snapshot.lesson?.tokens ?? [];
  if (tokens.length === 0) {
    return [];
  }

  const formatted = tokens.map((token) => formatMissionStep(token));
  const lines = [];
  for (let index = 0; index < formatted.length; index += 1) {
    const step = formatted[index];
    if (index < snapshot.missionProgress) {
      lines.push(` ${String(index + 1).padStart(2, "0")}. [x ${step}]`);
      continue;
    }
    if (index === snapshot.missionProgress && !snapshot.completedCurrent) {
      lines.push(`>${String(index + 1).padStart(2, "0")}. [  ${step}]`);
      continue;
    }
    lines.push(` ${String(index + 1).padStart(2, "0")}. [  ${step}]`);
  }
  return lines;
}

function normalizeLessonToken(event) {
  if (event.ctrlKey && !event.altKey && !event.metaKey) {
    const key = event.key.toLowerCase();
    if (key.length === 1) {
      return `<C-${key}>`;
    }
  }

  if (event.key === "Escape") {
    return "<Esc>";
  }
  if (event.key === "Enter") {
    return "<Enter>";
  }
  if (event.key === "Tab") {
    return "<Tab>";
  }
  if (event.key === " ") {
    return "<Space>";
  }
  if (event.key.length === 1) {
    return event.key.toLowerCase();
  }
  return null;
}

export function createLessonService({
  state,
  ui,
  createLessonSession,
  setStatus,
  setLessonPanelVisible,
  restartVimForMode,
  modeEditor,
  lessonAutoAdvanceMs,
  focusEditorInput,
}) {
  function renderGridBoard() {
    if (!state.lessonGrid) {
      ui.lessonBoard.hidden = true;
      ui.lessonBoard.textContent = "";
      return;
    }

    const { width, height, playerX, playerY, checkpoints, checkpointIndex, lessonKey } =
      state.lessonGrid;
    const currentCheckpoint = checkpoints[checkpointIndex] ?? null;
    const lines = [];
    const checkpointBar = buildProgressBar(checkpointIndex, checkpoints.length, 12);
    lines.push(`PRESS KEY: ${lessonKey}`);
    lines.push(`CHECKPOINTS: ${checkpointIndex}/${checkpoints.length}`);
    lines.push(`PROGRESS: [${checkpointBar}]`);
    lines.push("");
    lines.push(`+${"-".repeat(width)}+`);
    for (let y = 0; y < height; y += 1) {
      let row = "";
      for (let x = 0; x < width; x += 1) {
        const isPlayer = x === playerX && y === playerY;
        const isCurrentTarget =
          currentCheckpoint && x === currentCheckpoint.x && y === currentCheckpoint.y;
        const isFutureTarget = checkpoints
          .slice(checkpointIndex + 1)
          .some((point) => point.x === x && point.y === y);

        if (isPlayer && isCurrentTarget) {
          row += "*";
        } else if (isPlayer) {
          row += "@";
        } else if (isCurrentTarget) {
          row += "X";
        } else if (isFutureTarget) {
          row += "o";
        } else {
          row += ".";
        }
      }
      lines.push(`|${row}|`);
    }
    lines.push(`+${"-".repeat(width)}+`);
    ui.lessonBoard.textContent = lines.join("\n");
    ui.lessonBoard.hidden = false;
  }

  function renderMissionBoard(snapshot) {
    const lesson = snapshot?.lesson;
    if (!lesson) {
      ui.lessonBoard.hidden = true;
      ui.lessonBoard.textContent = "";
      return;
    }

    const nextStep = snapshot.completedCurrent
      ? snapshot.missionTotal
      : Math.min(snapshot.missionProgress + 1, snapshot.missionTotal);
    const received = snapshot.lastToken ? formatMissionStep(snapshot.lastToken) : "-";
    const receivedState = snapshot.lastToken
      ? snapshot.lastCorrect
        ? "OK"
        : "ERR"
      : "WAIT";

    const lines = [
      "PRESS THESE KEYS IN ORDER",
      ...sequenceProgressLines(snapshot),
      "",
      `STEP ${nextStep}/${snapshot.missionTotal}   EXPECTED ${snapshot.completedCurrent ? "-" : formatMissionStep(snapshot.expectedToken)}`,
      `LAST ${received} (${receivedState})   ERRORS ${snapshot.mistakes}`,
    ];

    ui.lessonBoard.textContent = lines.join("\n");
    ui.lessonBoard.hidden = false;
  }

  function renderLessonBoard(snapshot) {
    if (!snapshot?.lesson) {
      ui.lessonBoard.hidden = true;
      ui.lessonBoard.textContent = "";
      return;
    }

    if (snapshot.lesson.mode === "grid") {
      renderGridBoard();
      return;
    }

    renderMissionBoard(snapshot);
  }

  function resetLessonGrid(lesson) {
    if (!lesson || lesson.mode !== "grid") {
      state.lessonGrid = null;
      return;
    }

    const width = lesson.grid?.width ?? 11;
    const height = lesson.grid?.height ?? 7;
    const startX = Math.floor(width / 2);
    const startY = Math.floor(height / 2);
    const checkpointOffsets =
      Array.isArray(lesson.grid?.checkpoints) && lesson.grid.checkpoints.length > 0
        ? lesson.grid.checkpoints
        : [lesson.grid?.targetOffset ?? [0, 0]];
    const checkpoints = checkpointOffsets.map(([offsetX, offsetY]) => ({
      x: clamp(startX + offsetX, 0, width - 1),
      y: clamp(startY + offsetY, 0, height - 1),
    }));

    state.lessonGrid = {
      width,
      height,
      playerX: startX,
      playerY: startY,
      checkpoints,
      checkpointIndex: 0,
      lessonKey: lesson.shortcut,
    };
    renderGridBoard();
  }

  function applyGridMove(token) {
    if (!state.lessonGrid) {
      return false;
    }

    const delta = GRID_MOVES[token];
    if (!delta) {
      return false;
    }

    const [dx, dy] = delta;
    const nextX = clamp(state.lessonGrid.playerX + dx, 0, state.lessonGrid.width - 1);
    const nextY = clamp(state.lessonGrid.playerY + dy, 0, state.lessonGrid.height - 1);
    state.lessonGrid.playerX = nextX;
    state.lessonGrid.playerY = nextY;

    const currentCheckpoint =
      state.lessonGrid.checkpoints[state.lessonGrid.checkpointIndex] ?? null;
    if (
      currentCheckpoint &&
      currentCheckpoint.x === nextX &&
      currentCheckpoint.y === nextY
    ) {
      state.lessonGrid.checkpointIndex += 1;
    }

    renderGridBoard();

    return state.lessonGrid.checkpointIndex >= state.lessonGrid.checkpoints.length;
  }

  function clearLessonAutoAdvanceTimer() {
    if (!state.lessonAutoAdvanceTimer) {
      return;
    }
    clearTimeout(state.lessonAutoAdvanceTimer);
    state.lessonAutoAdvanceTimer = null;
  }

  function renderLesson(snapshot) {
    if (!snapshot || !snapshot.lesson) {
      return;
    }

    ui.lessonProgress.textContent = `${snapshot.index + 1} / ${snapshot.total}`;
    ui.lessonTitle.textContent = formatLessonHeading(snapshot.lesson);
    ui.lessonMission.hidden = false;
    ui.lessonMission.textContent = snapshot.lesson.explain || snapshot.lesson.mission;
    ui.lessonAccuracy.textContent = `${snapshot.lessonAccuracy}%`;
    ui.sessionAccuracy.textContent = `${snapshot.sessionAccuracy}%`;
    ui.sessionKeys.textContent = String(snapshot.sessionAttempts);
    ui.sessionErrors.textContent = String(snapshot.sessionErrors);
    renderLessonBoard(snapshot);

    if (snapshot.completedCurrent) {
      if (snapshot.allCompleted) {
        ui.lessonState.textContent = "Completed. All lessons done.";
      } else {
        ui.lessonState.textContent = "Completed. Auto-advancing...";
      }
      ui.lessonState.classList.add("is-complete");
    } else {
      if (snapshot.lesson.mode === "grid") {
        if (state.lessonGrid) {
          ui.lessonState.textContent =
            `PRESS ${snapshot.lesson.shortcut} ONLY. ` +
            `CHECKPOINTS ${state.lessonGrid.checkpointIndex}/${state.lessonGrid.checkpoints.length}. ` +
            `Mistakes ${snapshot.mistakes}.`;
        } else {
          ui.lessonState.textContent = `PRESS ${snapshot.lesson.shortcut} ONLY.`;
        }
      } else {
        ui.lessonState.textContent = `Follow the key sequence above.`;
      }
      ui.lessonState.classList.remove("is-complete");
    }

    ui.lessonPrevBtn.disabled = snapshot.isFirst;
    ui.lessonNextBtn.disabled = snapshot.allCompleted;
  }

  function scheduleLessonAutoAdvance(snapshot) {
    clearLessonAutoAdvanceTimer();
    if (!snapshot.completedCurrent || snapshot.allCompleted) {
      return;
    }

    state.lessonAutoAdvanceTimer = setTimeout(() => {
      state.lessonAutoAdvanceTimer = null;
      if (!state.learnModeActive || !state.lessonSession) {
        return;
      }

      const latest = state.lessonSession.getSnapshot();
      if (!latest.completedCurrent) {
        return;
      }

      const nextSnapshot = state.lessonSession.advance();
      resetLessonGrid(nextSnapshot.lesson);
      renderLesson(nextSnapshot);
      setStatus(`Moved to lesson ${nextSnapshot.index + 1}.`);
      focusEditorInput();
    }, lessonAutoAdvanceMs);
  }

  function startLessons() {
    state.learnModeActive = true;
    if (!state.lessonSession) {
      state.lessonSession = createLessonSession();
    }

    setLessonPanelVisible(true);
    const snapshot = state.lessonSession.getSnapshot();
    resetLessonGrid(snapshot.lesson);
    renderLesson(snapshot);
  }

  function handleLessonKeydown(event) {
    if (!state.learnModeActive || !state.lessonSession) {
      return;
    }
    if (state.consoleOpen) {
      return;
    }

    const token = normalizeLessonToken(event);
    if (!token) {
      return;
    }

    const snapshot = state.lessonSession.recordToken(token);
    let nextSnapshot = snapshot;

    if (state.lessonGrid && applyGridMove(token)) {
      nextSnapshot = state.lessonSession.completeCurrent();
    }

    renderLesson(nextSnapshot);

    if (nextSnapshot.completedCurrent) {
      setStatus(`Lesson complete: ${nextSnapshot.lesson.shortcut}`);
      scheduleLessonAutoAdvance(nextSnapshot);
    }
  }

  async function exitLearnMode() {
    clearLessonAutoAdvanceTimer();
    state.learnModeActive = false;
    state.lessonSession = null;
    state.lessonGrid = null;
    setLessonPanelVisible(false);
    ui.lessonBoard.hidden = true;

    if (!state.vimEditor) {
      setStatus("Learn mode closed.");
      return;
    }

    try {
      await restartVimForMode(modeEditor);
      setLessonPanelVisible(false);
      setStatus("Learn mode closed. Editor mode active.");
    } catch (error) {
      console.error("Failed to switch back to editor mode.", error);
      setLessonPanelVisible(false);
      setStatus("Learn mode closed.");
    }
  }

  function installLessonHandlers() {
    window.addEventListener("keydown", handleLessonKeydown, { capture: true });

    ui.lessonPrevBtn.addEventListener("click", () => {
      if (!state.lessonSession) {
        state.lessonSession = createLessonSession();
      }
      clearLessonAutoAdvanceTimer();
      const snapshot = state.lessonSession.retreat();
      resetLessonGrid(snapshot.lesson);
      renderLesson(snapshot);
      setStatus(`Moved to lesson ${snapshot.index + 1}.`);
      focusEditorInput();
    });

    ui.lessonRestartBtn.addEventListener("click", () => {
      if (!state.lessonSession) {
        state.lessonSession = createLessonSession();
      }
      clearLessonAutoAdvanceTimer();
      const snapshot = state.lessonSession.restartCurrent();
      resetLessonGrid(snapshot.lesson);
      renderLesson(snapshot);
      setStatus("Lesson restarted.");
      focusEditorInput();
    });

    ui.lessonNextBtn.addEventListener("click", () => {
      if (!state.lessonSession) {
        state.lessonSession = createLessonSession();
      }
      clearLessonAutoAdvanceTimer();
      const snapshot = state.lessonSession.advance();
      resetLessonGrid(snapshot.lesson);
      renderLesson(snapshot);

      if (snapshot.allCompleted) {
        setStatus("All lessons completed.");
      } else {
        setStatus(`Moved to lesson ${snapshot.index + 1}.`);
      }
      focusEditorInput();
    });

    ui.lessonExitBtn.addEventListener("click", () => {
      void exitLearnMode();
    });
  }

  return {
    startLessons,
    installLessonHandlers,
    exitLearnMode,
    clearLessonAutoAdvanceTimer,
  };
}
