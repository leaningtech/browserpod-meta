export const TRAINING_FILE_PATH = "/vimamp/vim-training.txt";

export const TRAINING_FILE_TEXT = [
  "Vim training pad",
  "",
  "Use this file while completing lessons.",
  "Try moving with h/j/k/l, word jumps with w/b, and edits like x, dd, dw.",
  "",
  "alpha bravo charlie",
  "delta echo foxtrot",
  "one two three four",
  "",
].join("\n");

const LEARN_LESSONS = [
  {
    id: "move-right",
    title: "Navigate Right",
    shortcut: "l",
    tokens: ["l"],
    mission: "Use only l and pass both checkpoints.",
    explain: "l moves the cursor one character to the right.",
    mode: "grid",
    grid: {
      width: 11,
      height: 7,
      checkpoints: [
        [3, 0],
        [5, 0],
      ],
    },
  },
  {
    id: "move-down",
    title: "Navigate Down",
    shortcut: "j",
    tokens: ["j"],
    mission: "Use only j and pass both checkpoints.",
    explain: "j moves the cursor one line down.",
    mode: "grid",
    grid: {
      width: 11,
      height: 7,
      checkpoints: [
        [0, 2],
        [0, 3],
      ],
    },
  },
  {
    id: "move-left",
    title: "Navigate Left",
    shortcut: "h",
    tokens: ["h"],
    mission: "Use only h and pass both checkpoints.",
    explain: "h moves the cursor one character to the left.",
    mode: "grid",
    grid: {
      width: 11,
      height: 7,
      checkpoints: [
        [-3, 0],
        [-5, 0],
      ],
    },
  },
  {
    id: "move-up",
    title: "Navigate Up",
    shortcut: "k",
    tokens: ["k"],
    mission: "Use only k and pass both checkpoints.",
    explain: "k moves the cursor one line up.",
    mode: "grid",
    grid: {
      width: 11,
      height: 7,
      checkpoints: [
        [0, -2],
        [0, -3],
      ],
    },
  },
  {
    id: "jump-word-forward",
    title: "Word Motion Forward",
    shortcut: "w",
    tokens: ["w", "w", "w", "w"],
    mission: "Move to the start of the next word 4 times.",
    explain: "w jumps to the start of the next word.",
  },
  {
    id: "jump-word-backward",
    title: "Word Motion Backward",
    shortcut: "b",
    tokens: ["b", "b", "b", "b"],
    mission: "Move to the start of the previous word 4 times.",
    explain: "b jumps to the start of the previous word.",
  },
  {
    id: "insert-then-escape",
    title: "Insert And Return",
    shortcut: "i ... Esc",
    tokens: ["i", "v", "i", "m", "<Esc>"],
    mission: "Enter Insert mode, type vim, then return to Normal mode.",
    explain: "i enters Insert mode, and Esc returns to Normal mode.",
  },
  {
    id: "delete-char",
    title: "Delete Character",
    shortcut: "x",
    tokens: ["x", "x", "x", "x", "x", "x"],
    mission: "Delete 6 characters using x.",
    explain: "x deletes the character under the cursor.",
  },
  {
    id: "delete-word",
    title: "Delete Word",
    shortcut: "dw",
    tokens: ["d", "w", "d", "w", "d", "w"],
    mission: "Delete 3 words using dw.",
    explain: "dw deletes from the cursor to the end of the word.",
  },
  {
    id: "delete-line",
    title: "Delete Line",
    shortcut: "dd",
    tokens: ["d", "d", "d", "d", "d", "d"],
    mission: "Delete 3 lines using dd.",
    explain: "dd deletes the current line.",
  },
  {
    id: "undo",
    title: "Undo",
    shortcut: "u",
    tokens: ["u", "u", "u"],
    mission: "Undo 3 changes using u.",
    explain: "u undoes the last change.",
  },
  {
    id: "redo",
    title: "Redo",
    shortcut: "Ctrl + R",
    tokens: ["<C-r>", "<C-r>", "<C-r>"],
    mission: "Redo 3 changes using Ctrl + R.",
    explain: "Ctrl + R redoes the last undone change.",
  },
  {
    id: "copy-line",
    title: "Copy Line",
    shortcut: "yy",
    tokens: ["y", "y", "y", "y", "y", "y"],
    mission: "Copy 3 lines using yy.",
    explain: "yy copies the current line.",
  },
  {
    id: "paste-after",
    title: "Paste After",
    shortcut: "p",
    tokens: ["p", "p", "p", "p"],
    mission: "Paste 4 times using p.",
    explain: "p pastes after the cursor or below the current line.",
  },
  {
    id: "word-end-forward",
    title: "Word End Forward",
    shortcut: "e",
    tokens: ["e", "e", "e", "e"],
    mission: "Jump to word ends 4 times using e.",
    explain: "e jumps to the end of the current or next word.",
  },
  {
    id: "word-end-backward",
    title: "Word End Backward",
    shortcut: "ge",
    tokens: ["g", "e", "g", "e", "g", "e"],
    mission: "Jump to previous word ends 3 times using ge.",
    explain: "ge jumps backward to the end of the previous word.",
  },
  {
    id: "line-start",
    title: "Line Start",
    shortcut: "0",
    tokens: ["0", "0", "0", "0"],
    mission: "Go to the start of the line 4 times using 0.",
    explain: "0 moves the cursor to the start of the current line.",
  },
  {
    id: "line-end",
    title: "Line End",
    shortcut: "$",
    tokens: ["$", "$", "$", "$"],
    mission: "Go to the end of the line 4 times using $.",
    explain: "$ moves the cursor to the end of the current line.",
  },
  {
    id: "append-and-return",
    title: "Append And Return",
    shortcut: "a ... Esc",
    tokens: ["a", "!", "<Esc>", "a", "!", "<Esc>"],
    mission: "Append text twice with a, then return using Esc.",
    explain: "a enters Insert mode after the cursor, then Esc returns to Normal mode.",
  },
  {
    id: "open-line-below",
    title: "Open Line Below",
    shortcut: "o ... Esc",
    tokens: ["o", "n", "e", "w", "<Esc>", "o", "l", "i", "n", "e", "<Esc>"],
    mission: "Open a line below twice, type text, then hit Esc each time.",
    explain: "o opens a new line below and enters Insert mode.",
  },
  {
    id: "replace-character",
    title: "Replace Character",
    shortcut: "r<char>",
    tokens: ["r", "x", "r", "y", "r", "z"],
    mission: "Replace 3 characters using r<char>.",
    explain: "r replaces the character under the cursor with the next key you press.",
  },
  {
    id: "search-forward",
    title: "Search Forward",
    shortcut: "/text Enter",
    tokens: ["/", "a", "l", "p", "h", "a", "<Enter>"],
    mission: "Search forward for alpha using /alpha and Enter.",
    explain: "/ starts a forward search; Enter executes it.",
  },
  {
    id: "search-next-match",
    title: "Search Next Match",
    shortcut: "n",
    tokens: ["n", "n", "n"],
    mission: "Jump to the next search result 3 times using n.",
    explain: "n repeats the last search in the same direction.",
  },
  {
    id: "set-number",
    title: "Enable Line Numbers",
    shortcut: ":set number Enter",
    tokens: [
      ":",
      "s",
      "e",
      "t",
      "<Space>",
      "n",
      "u",
      "m",
      "b",
      "e",
      "r",
      "<Enter>",
    ],
    mission: "Enable line numbers with :set number and Enter.",
    explain: ":set number turns on absolute line numbers.",
  },
  {
    id: "set-nonumber",
    title: "Disable Line Numbers",
    shortcut: ":set nonumber Enter",
    tokens: [
      ":",
      "s",
      "e",
      "t",
      "<Space>",
      "n",
      "o",
      "n",
      "u",
      "m",
      "b",
      "e",
      "r",
      "<Enter>",
    ],
    mission: "Disable line numbers with :set nonumber and Enter.",
    explain: ":set nonumber turns off line numbers.",
  },
  {
    id: "write-file",
    title: "Write File",
    shortcut: ":w Enter",
    tokens: [":", "w", "<Enter>", ":", "w", "<Enter>"],
    mission: "Save the file twice using :w and Enter.",
    explain: ":w writes (saves) the current file.",
  },
];

export function createLessonSession(lessons = LEARN_LESSONS) {
  let lessonIndex = 0;
  let recentTokens = [];
  let missionProgress = 0;
  let completed = false;
  let mistakes = 0;
  let lastToken = null;
  let lastCorrect = false;
  let lessonAttempts = 0;
  let lessonCorrect = 0;
  let sessionAttempts = 0;
  let sessionCorrect = 0;

  function current() {
    return lessons[lessonIndex] ?? null;
  }

  function percent(correct, attempts) {
    if (attempts <= 0) {
      return 100;
    }
    return Math.round((correct / attempts) * 100);
  }

  function missionTotal(lesson) {
    if (!lesson) {
      return 0;
    }
    if (lesson.mode === "grid") {
      return 1;
    }
    return lesson.tokens.length;
  }

  function resetCurrentLessonState() {
    recentTokens = [];
    missionProgress = 0;
    completed = false;
    mistakes = 0;
    lastToken = null;
    lastCorrect = false;
    lessonAttempts = 0;
    lessonCorrect = 0;
  }

  return {
    getSnapshot() {
      const lesson = current();
      const total = missionTotal(lesson);
      const expectedToken =
        lesson && !completed
          ? lesson.tokens[Math.min(missionProgress, lesson.tokens.length - 1)]
          : null;
      return {
        lesson,
        index: lessonIndex,
        total: lessons.length,
        recentTokens: [...recentTokens],
        missionProgress,
        missionTotal: total,
        completedCurrent: completed,
        mistakes,
        lastToken,
        lastCorrect,
        expectedToken,
        lessonAttempts,
        lessonCorrect,
        lessonErrors: Math.max(lessonAttempts - lessonCorrect, 0),
        lessonAccuracy: percent(lessonCorrect, lessonAttempts),
        sessionAttempts,
        sessionCorrect,
        sessionErrors: Math.max(sessionAttempts - sessionCorrect, 0),
        sessionAccuracy: percent(sessionCorrect, sessionAttempts),
        isFirst: lessonIndex === 0,
        isLast: lessonIndex === lessons.length - 1,
        allCompleted: lessons.length > 0 && lessonIndex === lessons.length - 1 && completed,
      };
    },

    recordToken(token) {
      if (!token || !current()) {
        return this.getSnapshot();
      }

      recentTokens.push(token);
      lastToken = token;
      lastCorrect = false;
      if (recentTokens.length > 24) {
        recentTokens = recentTokens.slice(-24);
      }

      const lesson = current();
      let counted = false;

      if (lesson.mode === "grid" && !completed) {
        const expected = lesson.tokens?.[0] ?? null;
        if (expected && token === expected) {
          lastCorrect = true;
        } else {
          mistakes += 1;
        }
        counted = true;
      } else if (!completed) {
        const expectedToken = lesson.tokens[missionProgress];
        if (token === expectedToken) {
          missionProgress += 1;
          lastCorrect = true;
        } else if (token === lesson.tokens[0]) {
          missionProgress = 1;
          mistakes += 1;
        } else {
          missionProgress = 0;
          mistakes += 1;
        }
        counted = true;

        if (missionProgress >= lesson.tokens.length) {
          missionProgress = lesson.tokens.length;
          completed = true;
        }
      }

      if (counted) {
        lessonAttempts += 1;
        sessionAttempts += 1;
        if (lastCorrect) {
          lessonCorrect += 1;
          sessionCorrect += 1;
        }
      }

      return this.getSnapshot();
    },

    completeCurrent() {
      completed = true;
      const lesson = current();
      missionProgress = missionTotal(lesson);
      lastCorrect = true;
      return this.getSnapshot();
    },

    restartCurrent() {
      resetCurrentLessonState();
      return this.getSnapshot();
    },

    advance() {
      if (lessonIndex >= lessons.length - 1) {
        completed = true;
        return this.getSnapshot();
      }

      lessonIndex += 1;
      resetCurrentLessonState();
      return this.getSnapshot();
    },

    retreat() {
      if (lessonIndex <= 0) {
        return this.getSnapshot();
      }

      lessonIndex -= 1;
      resetCurrentLessonState();
      return this.getSnapshot();
    },
  };
}
