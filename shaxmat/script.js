/* =============================================
   SHAXMAT O'YINI — script.js
   Full Chess Engine with all legal moves,
   check/checkmate/stalemate detection,
   promotion, undo, timer, move history,
   AI Bot (Easy / Medium / Hard Minimax)
   ============================================= */

// ─── PIECE UNICODE MAPS ───────────────────────
const PIECES = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

const PIECE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

// ─── INITIAL BOARD STATE ──────────────────────
function createInitialBoard() {
  return [
    ['bR','bN','bB','bQ','bK','bB','bN','bR'],
    ['bP','bP','bP','bP','bP','bP','bP','bP'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['wP','wP','wP','wP','wP','wP','wP','wP'],
    ['wR','wN','wB','wQ','wK','wB','wN','wR'],
  ];
}

// ─── GAME STATE ───────────────────────────────
let board = createInitialBoard();
let currentTurn = 'w';
let selectedSquare = null;
let legalMoves = [];
let moveHistoryLog = [];
let capturedByWhite = [];
let capturedByBlack = [];
let enPassantTarget = null;
let castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
let whiteKingPos = [7, 4];
let blackKingPos = [0, 4];
let gameOver = false;
let lastMove = null;
let scores = { w: 0, b: 0, draw: 0 };
let promotionCallback = null;

// Timer
let selectedTime = 300; // default 5 minutes in seconds
let timers = { w: selectedTime, b: selectedTime };
let timerInterval = null;

// ─── BOT STATE ────────────────────────────────
let isBotGame      = false;
let botColor       = 'b';       // which color bot plays
let botDifficulty  = 'medium';
let playerColorChoice = 'w';    // player's chosen color
let isBotThinking  = false;

// ─── BOARD RENDERING ─────────────────────────
function renderBoard() {
  const boardEl = document.getElementById('chessBoard');
  boardEl.innerHTML = '';

  // Rank labels
  const rankLabels = document.getElementById('rankLabels');
  rankLabels.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    const span = document.createElement('span');
    span.textContent = 8 - r;
    rankLabels.appendChild(span);
  }

  // File labels
  const fileLabels = document.getElementById('fileLabels');
  fileLabels.innerHTML = '';
  ['a','b','c','d','e','f','g','h'].forEach(f => {
    const span = document.createElement('span');
    span.textContent = f;
    fileLabels.appendChild(span);
  });

  const inCheck = isInCheck(currentTurn, board);
  const kingPos  = currentTurn === 'w' ? whiteKingPos : blackKingPos;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.classList.add('square', (r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;

      // Last move highlight
      if (lastMove) {
        if (r === lastMove.from[0] && c === lastMove.from[1]) sq.classList.add('last-move-from');
        if (r === lastMove.to[0]   && c === lastMove.to[1])   sq.classList.add('last-move-to');
      }

      // Selected
      if (selectedSquare && selectedSquare[0] === r && selectedSquare[1] === c) {
        sq.classList.add('selected');
      }

      // Legal moves
      const isLegal = legalMoves.some(m => m[0] === r && m[1] === c);
      if (isLegal) {
        if (board[r][c] && board[r][c][0] !== currentTurn) {
          sq.classList.add('legal-capture');
        } else if (enPassantTarget && r === enPassantTarget[0] && c === enPassantTarget[1]) {
          sq.classList.add('legal-capture');
        } else {
          sq.classList.add('legal-move');
        }
      }

      // King in check
      if (inCheck && r === kingPos[0] && c === kingPos[1]) {
        sq.classList.add('in-check');
      }

      // Piece
      const piece = board[r][c];
      if (piece) {
        const pieceEl = document.createElement('span');
        pieceEl.classList.add('piece');
        pieceEl.classList.add(piece[0] === 'w' ? 'white-piece' : 'black-piece');
        pieceEl.textContent = PIECES[piece];
        sq.appendChild(pieceEl);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }

  updateTurnIndicator();
  updatePlayerCards();
}

// ─── CLICK HANDLER ────────────────────────────
function onSquareClick(r, c) {
  if (gameOver) return;
  if (isBotThinking) return;
  // In bot game, only allow clicks when it's the player's turn
  if (isBotGame && currentTurn === botColor) return;

  const piece = board[r][c];

  if (selectedSquare) {
    const [sr, sc] = selectedSquare;
    const isLegal = legalMoves.some(m => m[0] === r && m[1] === c);

    if (isLegal) {
      executeMove(sr, sc, r, c);
      return;
    }

    // Re-select own piece
    if (piece && piece[0] === currentTurn) {
      selectedSquare = [r, c];
      legalMoves = getLegalMoves(r, c);
      renderBoard();
      return;
    }

    // Deselect
    selectedSquare = null;
    legalMoves = [];
    renderBoard();
    return;
  }

  if (piece && piece[0] === currentTurn) {
    selectedSquare = [r, c];
    legalMoves = getLegalMoves(r, c);
    renderBoard();
  }
}

// ─── EXECUTE MOVE ─────────────────────────────
function executeMove(fr, fc, tr, tc, promoteTo) {
  const piece  = board[fr][fc];
  const target = board[tr][tc];
  const color  = piece[0];
  const type   = piece[1];

  // Save state for undo
  const snapshot = {
    board: board.map(row => [...row]),
    currentTurn, enPassantTarget,
    castlingRights: { ...castlingRights },
    whiteKingPos: [...whiteKingPos],
    blackKingPos: [...blackKingPos],
    capturedByWhite: [...capturedByWhite],
    capturedByBlack: [...capturedByBlack],
    lastMove: lastMove ? { ...lastMove, from: [...lastMove.from], to: [...lastMove.to] } : null,
    timers: { ...timers },
  };
  moveHistoryLog.push(snapshot);

  let notation = '';
  let captured = null;
  let specialNote = '';

  // ── En Passant ──
  let enPassantCapture = false;
  if (type === 'P' && fc !== tc && !board[tr][tc]) {
    captured = board[fr][tc];
    board[fr][tc] = null;
    enPassantCapture = true;
  }

  // ── Castling ──
  let isCastle = false;
  if (type === 'K' && Math.abs(tc - fc) === 2) {
    isCastle = true;
    if (tc > fc) {
      // Kingside
      board[fr][tc - 1] = board[fr][7];
      board[fr][7] = null;
      specialNote = 'O-O';
    } else {
      // Queenside
      board[fr][tc + 1] = board[fr][0];
      board[fr][0] = null;
      specialNote = 'O-O-O';
    }
  }

  // Update castling rights
  if (type === 'K') {
    if (color === 'w') { castlingRights.wK = false; castlingRights.wQ = false; whiteKingPos = [tr, tc]; }
    else               { castlingRights.bK = false; castlingRights.bQ = false; blackKingPos = [tr, tc]; }
  }
  if (type === 'R') {
    if (color === 'w') { if (fc === 7) castlingRights.wK = false; if (fc === 0) castlingRights.wQ = false; }
    else               { if (fc === 7) castlingRights.bK = false; if (fc === 0) castlingRights.bQ = false; }
  }

  // Update en passant target
  const prevEP = enPassantTarget;
  enPassantTarget = null;
  if (type === 'P' && Math.abs(tr - fr) === 2) {
    enPassantTarget = [Math.floor((fr + tr) / 2), fc];
  }

  // ── Capture ──
  if (!enPassantCapture && target) {
    captured = target;
  }

  if (captured) {
    if (color === 'w') capturedByWhite.push(captured);
    else               capturedByBlack.push(captured);
  }

  // Move piece
  board[tr][tc] = piece;
  board[fr][fc] = null;

  // Update king position
  if (type === 'K') {
    if (color === 'w') whiteKingPos = [tr, tc];
    else               blackKingPos = [tr, tc];
  }

  // ── Pawn Promotion ──
  if (type === 'P' && (tr === 0 || tr === 7)) {
    if (promoteTo) {
      board[tr][tc] = color + promoteTo;
      finishMove(fr, fc, tr, tc, specialNote || notation, captured, color);
    } else if (isBotGame && color === botColor) {
      // Bot always promotes to Queen
      board[tr][tc] = color + 'Q';
      finishMove(fr, fc, tr, tc, specialNote || notation, captured, color);
    } else {
      // Show promotion modal for human
      showPromotion(color, tr, tc, () => {
        finishMove(fr, fc, tr, tc, specialNote || notation, captured, color);
      });
      return;
    }
  } else {
    finishMove(fr, fc, tr, tc, specialNote || notation, captured, color);
  }
}

function finishMove(fr, fc, tr, tc, specialNote, captured, color) {
  lastMove = { from: [fr, fc], to: [tr, tc] };
  selectedSquare = null;
  legalMoves = [];
  currentTurn = currentTurn === 'w' ? 'b' : 'w';

  // Notation
  const colNames = 'abcdefgh';
  const piece = board[tr][tc];
  const type  = piece[1];
  let notation = specialNote || '';
  if (!notation) {
    notation = (type !== 'P' ? type : '') +
               colNames[fc] + (8 - fr) +
               (captured ? 'x' : '-') +
               colNames[tc] + (8 - tr);
  }
  addMoveToHistory(notation, color);
  updateCapturedPieces();
  renderBoard();
  checkGameEnd();

  // Trigger bot move if it's the bot's turn
  if (!gameOver && isBotGame && currentTurn === botColor) {
    scheduleBotMove();
  }
}

// ─── PROMOTION MODAL ─────────────────────────
function showPromotion(color, row, col, callback) {
  const modal = document.getElementById('promotionModal');
  const choices = document.getElementById('promotionChoices');
  choices.innerHTML = '';
  promotionCallback = callback;

  const options = ['Q', 'R', 'B', 'N'];
  options.forEach(type => {
    const btn = document.createElement('button');
    btn.className = 'promo-btn';
    btn.textContent = PIECES[color + type];
    btn.addEventListener('click', () => {
      board[row][col] = color + type;
      modal.classList.remove('show');
      callback();
    });
    choices.appendChild(btn);
  });

  modal.classList.add('show');
}

// ─── CHECK DETECTION ─────────────────────────
function isInCheck(color, b) {
  const kingPos = color === 'w' ? whiteKingPos : blackKingPos;
  // After move, king pos might have updated — find it
  let kp = findKing(color, b);
  if (!kp) return false;
  return isSquareAttacked(kp[0], kp[1], color === 'w' ? 'b' : 'w', b);
}

function findKing(color, b) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (b[r][c] === color + 'K') return [r, c];
  return null;
}

function isSquareAttacked(r, c, byColor, b) {
  const enemy = byColor;

  // Knight attacks
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightMoves) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && b[nr][nc] === enemy + 'N') return true;
  }

  // Diagonal (Bishop/Queen)
  const diags = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr, dc] of diags) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = b[nr][nc];
      if (p) {
        if (p[0] === enemy && (p[1] === 'B' || p[1] === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  // Straight (Rook/Queen)
  const straights = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of straights) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = b[nr][nc];
      if (p) {
        if (p[0] === enemy && (p[1] === 'R' || p[1] === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  // Pawn attacks
  const pDir = enemy === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const nr = r + pDir, nc = c + dc;
    if (inBounds(nr, nc) && b[nr][nc] === enemy + 'P') return true;
  }

  // King attacks
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && b[nr][nc] === enemy + 'K') return true;
  }

  return false;
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

// ─── LEGAL MOVES ─────────────────────────────
function getLegalMoves(r, c) {
  const pseudoMoves = getPseudoMoves(r, c, board);
  const legal = [];
  for (const [tr, tc] of pseudoMoves) {
    const simBoard = simulateMove(r, c, tr, tc, board);
    const simKingPos = findKing(currentTurn, simBoard);
    if (simKingPos && !isSquareAttacked(simKingPos[0], simKingPos[1],
        currentTurn === 'w' ? 'b' : 'w', simBoard)) {
      legal.push([tr, tc]);
    }
  }
  return legal;
}

function simulateMove(fr, fc, tr, tc, b) {
  const newBoard = b.map(row => [...row]);
  const piece = newBoard[fr][fc];
  const type  = piece[1];
  const color = piece[0];

  // En passant
  if (type === 'P' && fc !== tc && !newBoard[tr][tc]) {
    newBoard[fr][tc] = null;
  }

  // Castling rook
  if (type === 'K' && Math.abs(tc - fc) === 2) {
    if (tc > fc) { newBoard[fr][tc - 1] = newBoard[fr][7]; newBoard[fr][7] = null; }
    else         { newBoard[fr][tc + 1] = newBoard[fr][0]; newBoard[fr][0] = null; }
  }

  newBoard[tr][tc] = piece;
  newBoard[fr][fc] = null;
  return newBoard;
}

function getPseudoMoves(r, c, b) {
  const piece = b[r][c];
  if (!piece) return [];
  const color = piece[0];
  const type  = piece[1];
  const moves = [];

  const add = (nr, nc) => { if (inBounds(nr, nc)) moves.push([nr, nc]); };
  const addSlide = (dr, dc) => {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      if (b[nr][nc]) {
        if (b[nr][nc][0] !== color) moves.push([nr, nc]);
        break;
      }
      moves.push([nr, nc]);
      nr += dr; nc += dc;
    }
  };

  switch (type) {
    case 'P': {
      const dir   = color === 'w' ? -1 : 1;
      const start = color === 'w' ?  6 :  1;
      // Forward
      if (inBounds(r + dir, c) && !b[r + dir][c]) {
        moves.push([r + dir, c]);
        if (r === start && !b[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
      }
      // Captures
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inBounds(nr, nc)) {
          if (b[nr][nc] && b[nr][nc][0] !== color) moves.push([nr, nc]);
          if (enPassantTarget && enPassantTarget[0] === nr && enPassantTarget[1] === nc)
            moves.push([nr, nc]);
        }
      }
      break;
    }
    case 'N': {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && (!b[nr][nc] || b[nr][nc][0] !== color)) moves.push([nr, nc]);
      });
      break;
    }
    case 'B': { [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr, dc]) => addSlide(dr, dc)); break; }
    case 'R': { [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => addSlide(dr, dc)); break; }
    case 'Q': {
      [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => addSlide(dr, dc));
      break;
    }
    case 'K': {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && (!b[nr][nc] || b[nr][nc][0] !== color)) moves.push([nr, nc]);
      });
      // Castling
      addCastlingMoves(r, c, color, moves, b);
      break;
    }
  }
  return moves;
}

function addCastlingMoves(r, c, color, moves, b) {
  const enemy = color === 'w' ? 'b' : 'w';
  if (isSquareAttacked(r, c, enemy, b)) return;

  if (color === 'w') {
    // Kingside
    if (castlingRights.wK && !b[7][5] && !b[7][6] &&
        !isSquareAttacked(7, 5, 'b', b) && !isSquareAttacked(7, 6, 'b', b))
      moves.push([7, 6]);
    // Queenside
    if (castlingRights.wQ && !b[7][3] && !b[7][2] && !b[7][1] &&
        !isSquareAttacked(7, 3, 'b', b) && !isSquareAttacked(7, 2, 'b', b))
      moves.push([7, 2]);
  } else {
    // Kingside
    if (castlingRights.bK && !b[0][5] && !b[0][6] &&
        !isSquareAttacked(0, 5, 'w', b) && !isSquareAttacked(0, 6, 'w', b))
      moves.push([0, 6]);
    // Queenside
    if (castlingRights.bQ && !b[0][3] && !b[0][2] && !b[0][1] &&
        !isSquareAttacked(0, 3, 'w', b) && !isSquareAttacked(0, 2, 'w', b))
      moves.push([0, 2]);
  }
}

// ─── GAME END CHECK ───────────────────────────
function checkGameEnd() {
  const allMoves = getAllLegalMoves(currentTurn);
  const inCheck  = isInCheck(currentTurn, board);

  if (allMoves.length === 0) {
    gameOver = true;
    stopTimer();
    if (inCheck) {
      // Checkmate
      const winner = currentTurn === 'w' ? 'Qora' : 'Oq';
      scores[currentTurn === 'w' ? 'b' : 'w']++;
      updateScores();
      setTimeout(() => showGameOver(`${winner} g'alaba qozondi! 🏆`, 'Shoh mat!'), 300);
    } else {
      // Stalemate
      scores.draw++;
      updateScores();
      setTimeout(() => showGameOver('Durang!', 'Qoqilib qolish (stalemate)'), 300);
    }
    return;
  }

  if (inCheck) {
    document.getElementById('gameStatus').textContent = '⚠️ Shoh ostida!';
  } else {
    document.getElementById('gameStatus').textContent = '';
  }
}

function getAllLegalMoves(color) {
  const moves = [];
  // We need a temp override of currentTurn for getLegalMoves to work correctly
  const savedTurn = currentTurn;
  currentTurn = color;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c][0] === color) {
        const lm = getLegalMoves(r, c);
        lm.forEach(m => moves.push({ from: [r, c], to: m }));
      }
    }
  }
  currentTurn = savedTurn;
  return moves;
}

function showGameOver(title, msg) {
  document.getElementById('gameOverTitle').textContent = title;
  document.getElementById('gameOverMsg').textContent  = msg;
  document.getElementById('gameOverModal').classList.add('show');
}

// ─── MOVE HISTORY UI ─────────────────────────
let moveCount = 0;
let currentHistoryRow = null;

function addMoveToHistory(notation, color) {
  const list = document.getElementById('moveHistory');

  if (color === 'w') {
    moveCount++;
    currentHistoryRow = document.createElement('div');
    currentHistoryRow.className = 'history-item';
    currentHistoryRow.innerHTML = `
      <span class="history-num">${moveCount}.</span>
      <span class="history-white">${notation}</span>
      <span class="history-black"></span>`;
    list.appendChild(currentHistoryRow);
  } else if (currentHistoryRow) {
    currentHistoryRow.querySelector('.history-black').textContent = notation;
  }

  list.scrollTop = list.scrollHeight;
}

// ─── CAPTURED PIECES UI ──────────────────────
function updateCapturedPieces() {
  const wList = document.getElementById('capturedWhiteList');
  const bList = document.getElementById('capturedBlackList');
  wList.innerHTML = capturedByWhite.map(p => PIECES[p]).join('');
  bList.innerHTML = capturedByBlack.map(p => PIECES[p]).join('');
}

// ─── TURN INDICATOR ───────────────────────────
function updateTurnIndicator() {
  const dot  = document.querySelector('.turn-dot');
  const text = document.getElementById('turnText');
  dot.className = 'turn-dot ' + (currentTurn === 'w' ? 'white-dot' : 'black-dot');

  if (isBotThinking) {
    text.innerHTML = `<span class="bot-thinking-text">🤖 Bot o'ylamoqda<span class="dot-flash"><span></span><span></span><span></span></span></span>`;
  } else if (isBotGame && currentTurn === botColor) {
    text.innerHTML = `<span class="bot-thinking-text">🤖 Bot navbatini kutmoqda...</span>`;
  } else {
    text.textContent = currentTurn === 'w'
      ? "Oq o'yinchi yurishini kutmoqda"
      : "Qora o'yinchi yurishini kutmoqda";
  }
}

// ─── PLAYER CARDS ────────────────────────────
function updatePlayerCards() {
  const wCard = document.getElementById('whitePlayer');
  const bCard = document.getElementById('blackPlayer');
  if (currentTurn === 'w') {
    wCard.classList.add('active-card');
    bCard.classList.remove('active-card');
  } else {
    bCard.classList.add('active-card');
    wCard.classList.remove('active-card');
  }
}

function updatePlayerLabels() {
  const wName = document.getElementById('whitePlayerName');
  const wTag  = document.getElementById('whitePlayerTag');
  const bName = document.getElementById('blackPlayerName');
  const bTag  = document.getElementById('blackPlayerTag');

  if (isBotGame) {
    const diffLabels = { easy: 'Oson', medium: "O'rta", hard: 'Qiyin' };
    const diffLabel = diffLabels[botDifficulty] || '';
    if (botColor === 'b') {
      wName.textContent = 'Oq';
      wTag.textContent  = "Siz";
      bName.innerHTML   = `Qora <span class="bot-badge">BOT</span>`;
      bTag.textContent  = diffLabel;
    } else {
      bName.textContent = 'Qora';
      bTag.textContent  = "Siz";
      wName.innerHTML   = `Oq <span class="bot-badge">BOT</span>`;
      wTag.textContent  = diffLabel;
    }
  } else {
    wName.textContent = 'Oq';
    wTag.textContent  = "O'yinchi 1";
    bName.textContent = 'Qora';
    bTag.textContent  = "O'yinchi 2";
  }
}

// ─── TIMER ────────────────────────────────────
function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    timers[currentTurn]--;
    updateTimerDisplay();
    if (timers[currentTurn] <= 0) {
      stopTimer();
      gameOver = true;
      const winner = currentTurn === 'w' ? 'Qora' : 'Oq';
      scores[currentTurn === 'w' ? 'b' : 'w']++;
      updateScores();
      showGameOver(`${winner} g'alaba qozondi! ⏱`, 'Vaqt tugadi!');
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  ['w', 'b'].forEach(c => {
    const el  = document.getElementById(c === 'w' ? 'whiteTimer' : 'blackTimer');
    const sec = timers[c];
    const m   = Math.floor(sec / 60);
    const s   = sec % 60;
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (sec <= 30) el.classList.add('danger');
    else           el.classList.remove('danger');
  });
}

// ─── SCORES ───────────────────────────────────
function updateScores() {
  document.getElementById('whiteWins').textContent = scores.w;
  document.getElementById('blackWins').textContent = scores.b;
  document.getElementById('draws').textContent     = scores.draw;
}

// ─── NEW GAME ─────────────────────────────────
function newGame() {
  stopTimer();
  board           = createInitialBoard();
  currentTurn     = 'w';
  selectedSquare  = null;
  legalMoves      = [];
  moveHistoryLog  = [];
  capturedByWhite = [];
  capturedByBlack = [];
  enPassantTarget = null;
  castlingRights  = { wK: true, wQ: true, bK: true, bQ: true };
  whiteKingPos    = [7, 4];
  blackKingPos    = [0, 4];
  gameOver        = false;
  lastMove        = null;
  timers          = { w: selectedTime, b: selectedTime };
  moveCount       = 0;
  currentHistoryRow = null;
  isBotThinking   = false;

  document.getElementById('moveHistory').innerHTML = '';
  document.getElementById('capturedWhiteList').innerHTML = '';
  document.getElementById('capturedBlackList').innerHTML = '';
  document.getElementById('gameStatus').textContent = '';
  document.getElementById('gameOverModal').classList.remove('show');
  document.getElementById('promotionModal').classList.remove('show');
  updateTimerDisplay();
  updatePlayerLabels();
  renderBoard();
  startTimer();

  // If bot plays white, trigger its first move
  if (isBotGame && botColor === 'w') {
    scheduleBotMove();
  }
}

// ─── UNDO ─────────────────────────────────────
function undoMove() {
  if (gameOver) return;
  if (isBotThinking) return;

  // In bot game, undo 2 moves (bot + player)
  const stepsToUndo = (isBotGame && moveHistoryLog.length >= 2) ? 2 : 1;

  for (let i = 0; i < stepsToUndo; i++) {
    if (moveHistoryLog.length === 0) break;
    const snapshot = moveHistoryLog.pop();
    board            = snapshot.board;
    currentTurn      = snapshot.currentTurn;
    enPassantTarget  = snapshot.enPassantTarget;
    castlingRights   = snapshot.castlingRights;
    whiteKingPos     = snapshot.whiteKingPos;
    blackKingPos     = snapshot.blackKingPos;
    capturedByWhite  = snapshot.capturedByWhite;
    capturedByBlack  = snapshot.capturedByBlack;
    lastMove         = snapshot.lastMove;
    timers           = snapshot.timers;

    // Remove last move from history UI
    const list = document.getElementById('moveHistory');
    if (currentTurn === 'b' && list.lastChild) {
      const lastRow = list.lastChild;
      const blackCell = lastRow.querySelector('.history-black');
      if (blackCell) blackCell.textContent = '';
      currentHistoryRow = lastRow;
    } else {
      if (list.lastChild) list.removeChild(list.lastChild);
      moveCount = Math.max(0, moveCount - 1);
      currentHistoryRow = list.lastChild;
    }
  }

  selectedSquare = null;
  legalMoves     = [];
  updateCapturedPieces();
  updateTimerDisplay();
  renderBoard();
  document.getElementById('gameStatus').textContent = '';
}

// ═══════════════════════════════════════════════
//  BOT AI ENGINE
// ═══════════════════════════════════════════════

// Piece values for evaluation (in centipawns x10)
const BOT_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// Piece-Square Tables (from white's perspective, row 0 = rank 8)
const PST = {
  P: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 27, 27, 10,  5,  5],
    [ 0,  0,  0, 25, 25,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-25,-25, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  R: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 0,  0,  0,  5,  5,  0,  0,  0],
  ],
  Q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
};

function getPSTValue(type, color, r, c) {
  const table = PST[type];
  if (!table) return 0;
  // White reads table top-to-bottom (row 0 = rank 8)
  // Black reads table mirrored (row 7 = rank 8)
  const row = color === 'w' ? r : 7 - r;
  return table[row][c];
}

// Static board evaluation (positive = good for white)
function evaluateBoard(b) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const color = p[0];
      const type  = p[1];
      const val   = BOT_VALUES[type] + getPSTValue(type, color, r, c);
      score += color === 'w' ? val : -val;
    }
  }
  return score;
}

// Get all pseudo legal moves for a color on a given board (for minimax)
function getAllMovesForColor(color, b, ep, cr) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!b[r][c] || b[r][c][0] !== color) continue;
      const pseudo = getPseudoMovesForBoard(r, c, b, color, ep, cr);
      for (const [tr, tc] of pseudo) {
        const simB = simulateMoveOnBoard(r, c, tr, tc, b);
        const kp = findKing(color, simB);
        if (kp && !isSquareAttacked(kp[0], kp[1], color === 'w' ? 'b' : 'w', simB)) {
          moves.push({ fr: r, fc: c, tr, tc });
        }
      }
    }
  }
  return moves;
}

function getPseudoMovesForBoard(r, c, b, color, ep, cr) {
  const type  = b[r][c][1];
  const moves = [];

  const addSlide = (dr, dc) => {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      if (b[nr][nc]) {
        if (b[nr][nc][0] !== color) moves.push([nr, nc]);
        break;
      }
      moves.push([nr, nc]);
      nr += dr; nc += dc;
    }
  };

  switch (type) {
    case 'P': {
      const dir   = color === 'w' ? -1 : 1;
      const start = color === 'w' ?  6 :  1;
      if (inBounds(r + dir, c) && !b[r + dir][c]) {
        moves.push([r + dir, c]);
        if (r === start && !b[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inBounds(nr, nc)) {
          if (b[nr][nc] && b[nr][nc][0] !== color) moves.push([nr, nc]);
          if (ep && ep[0] === nr && ep[1] === nc) moves.push([nr, nc]);
        }
      }
      break;
    }
    case 'N':
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && (!b[nr][nc] || b[nr][nc][0] !== color)) moves.push([nr, nc]);
      });
      break;
    case 'B': [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr, dc]) => addSlide(dr, dc)); break;
    case 'R': [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => addSlide(dr, dc)); break;
    case 'Q': [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => addSlide(dr, dc)); break;
    case 'K': {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && (!b[nr][nc] || b[nr][nc][0] !== color)) moves.push([nr, nc]);
      });
      // Castling (simplified using passed rights)
      const enemy = color === 'w' ? 'b' : 'w';
      if (!isSquareAttacked(r, c, enemy, b)) {
        if (color === 'w') {
          if (cr.wK && !b[7][5] && !b[7][6] &&
              !isSquareAttacked(7,5,'b',b) && !isSquareAttacked(7,6,'b',b)) moves.push([7,6]);
          if (cr.wQ && !b[7][3] && !b[7][2] && !b[7][1] &&
              !isSquareAttacked(7,3,'b',b) && !isSquareAttacked(7,2,'b',b)) moves.push([7,2]);
        } else {
          if (cr.bK && !b[0][5] && !b[0][6] &&
              !isSquareAttacked(0,5,'w',b) && !isSquareAttacked(0,6,'w',b)) moves.push([0,6]);
          if (cr.bQ && !b[0][3] && !b[0][2] && !b[0][1] &&
              !isSquareAttacked(0,3,'w',b) && !isSquareAttacked(0,2,'w',b)) moves.push([0,2]);
        }
      }
      break;
    }
  }
  return moves;
}

function simulateMoveOnBoard(fr, fc, tr, tc, b) {
  const newBoard = b.map(row => [...row]);
  const piece = newBoard[fr][fc];
  const type  = piece[1];

  // En passant capture
  if (type === 'P' && fc !== tc && !newBoard[tr][tc]) {
    newBoard[fr][tc] = null;
  }
  // Castling rook
  if (type === 'K' && Math.abs(tc - fc) === 2) {
    if (tc > fc) { newBoard[fr][tc - 1] = newBoard[fr][7]; newBoard[fr][7] = null; }
    else         { newBoard[fr][tc + 1] = newBoard[fr][0]; newBoard[fr][0] = null; }
  }
  // Promotion to Queen automatically
  if (type === 'P' && (tr === 0 || tr === 7)) {
    newBoard[tr][tc] = piece[0] + 'Q';
  } else {
    newBoard[tr][tc] = piece;
  }
  newBoard[fr][fc] = null;
  return newBoard;
}

// ─── MINIMAX with Alpha-Beta ───────────────────
function minimax(b, depth, alpha, beta, isMaximizing, ep, cr) {
  if (depth === 0) return evaluateBoard(b);

  const color = isMaximizing ? 'w' : 'b';
  const moves = getAllMovesForColor(color, b, ep, cr);

  if (moves.length === 0) {
    const kp = findKing(color, b);
    if (kp && isSquareAttacked(kp[0], kp[1], color === 'w' ? 'b' : 'w', b)) {
      // Checkmate — worst result for the current side
      return isMaximizing ? -100000 - depth : 100000 + depth;
    }
    return 0; // Stalemate
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (const mv of moves) {
      const newBoard = simulateMoveOnBoard(mv.fr, mv.fc, mv.tr, mv.tc, b);
      // Compute new EP target
      let newEP = null;
      if (b[mv.fr][mv.fc] && b[mv.fr][mv.fc][1] === 'P' && Math.abs(mv.tr - mv.fr) === 2)
        newEP = [Math.floor((mv.fr + mv.tr) / 2), mv.fc];
      const newCR = updateCastlingRightsForMove(b[mv.fr][mv.fc], mv.fr, mv.fc, cr);
      const val = minimax(newBoard, depth - 1, alpha, beta, false, newEP, newCR);
      best = Math.max(best, val);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const newBoard = simulateMoveOnBoard(mv.fr, mv.fc, mv.tr, mv.tc, b);
      let newEP = null;
      if (b[mv.fr][mv.fc] && b[mv.fr][mv.fc][1] === 'P' && Math.abs(mv.tr - mv.fr) === 2)
        newEP = [Math.floor((mv.fr + mv.tr) / 2), mv.fc];
      const newCR = updateCastlingRightsForMove(b[mv.fr][mv.fc], mv.fr, mv.fc, cr);
      const val = minimax(newBoard, depth - 1, alpha, beta, true, newEP, newCR);
      best = Math.min(best, val);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function updateCastlingRightsForMove(piece, fr, fc, cr) {
  if (!piece) return cr;
  const newCR = { ...cr };
  if (piece === 'wK') { newCR.wK = false; newCR.wQ = false; }
  if (piece === 'bK') { newCR.bK = false; newCR.bQ = false; }
  if (piece === 'wR') { if (fc === 7) newCR.wK = false; if (fc === 0) newCR.wQ = false; }
  if (piece === 'bR') { if (fc === 7) newCR.bK = false; if (fc === 0) newCR.bQ = false; }
  return newCR;
}

// ─── GREEDY / MEDIUM evaluation ───────────────
function greedyEval(b, fr, fc, tr, tc) {
  const captured = b[tr][tc];
  let score = captured ? BOT_VALUES[captured[1]] : 0;
  // Add positional bonus
  const piece = b[fr][fc];
  if (piece) score += getPSTValue(piece[1], piece[0], tr, tc) - getPSTValue(piece[1], piece[0], fr, fc);
  return score;
}

// ─── BOT MOVE SELECTION ───────────────────────
function getBotMove() {
  const moves = getAllMovesForColor(botColor, board, enPassantTarget, castlingRights);
  if (moves.length === 0) return null;

  if (botDifficulty === 'easy') {
    // Random
    return moves[Math.floor(Math.random() * moves.length)];
  }

  if (botDifficulty === 'medium') {
    // Greedy: pick move with highest immediate material/positional gain
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const mv of moves) {
      const score = greedyEval(board, mv.fr, mv.fc, mv.tr, mv.tc);
      if (score > bestScore) { bestScore = score; bestMoves = [mv]; }
      else if (score === bestScore) bestMoves.push(mv);
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // Hard: Minimax depth=3
  const isMaximizing = botColor === 'w';
  let bestScore = isMaximizing ? -Infinity : Infinity;
  let bestMove  = moves[0];

  // Shuffle for variety at equal scores
  moves.sort(() => Math.random() - 0.5);

  for (const mv of moves) {
    const newBoard = simulateMoveOnBoard(mv.fr, mv.fc, mv.tr, mv.tc, board);
    let newEP = null;
    if (board[mv.fr][mv.fc] && board[mv.fr][mv.fc][1] === 'P' && Math.abs(mv.tr - mv.fr) === 2)
      newEP = [Math.floor((mv.fr + mv.tr) / 2), mv.fc];
    const newCR = updateCastlingRightsForMove(board[mv.fr][mv.fc], mv.fr, mv.fc, castlingRights);
    const score = minimax(newBoard, 2, -Infinity, Infinity, !isMaximizing, newEP, newCR);

    if (isMaximizing && score > bestScore) { bestScore = score; bestMove = mv; }
    if (!isMaximizing && score < bestScore) { bestScore = score; bestMove = mv; }
  }

  return bestMove;
}

function scheduleBotMove() {
  const delay = botDifficulty === 'hard' ? 700 : 500;
  isBotThinking = true;
  updateTurnIndicator();

  setTimeout(() => {
    if (gameOver) { isBotThinking = false; return; }
    const mv = getBotMove();
    isBotThinking = false;
    if (mv) {
      executeMove(mv.fr, mv.fc, mv.tr, mv.tc);
    }
  }, delay);
}

// ═══════════════════════════════════════════════
//  MODAL UI LOGIC
// ═══════════════════════════════════════════════

// Current selections (modal state)
let modalMode = 'pvp';
let modalDiff = 'medium';
let modalColor = 'w';

function selectMode(mode) {
  modalMode = mode;
  document.getElementById('modePvP').classList.toggle('selected', mode === 'pvp');
  document.getElementById('modeBot').classList.toggle('selected', mode === 'bot');
  document.getElementById('botSettings').style.display = mode === 'bot' ? 'block' : 'none';
}

function selectDiff(diff) {
  modalDiff = diff;
  ['Easy','Medium','Hard'].forEach(d =>
    document.getElementById('diff' + d).classList.remove('selected')
  );
  document.getElementById('diff' + diff.charAt(0).toUpperCase() + diff.slice(1)).classList.add('selected');
}

function selectColor(col) {
  modalColor = col;
  ['colorWhite','colorRandom','colorBlack'].forEach(id =>
    document.getElementById(id).classList.remove('selected')
  );
  const idMap = { w: 'colorWhite', random: 'colorRandom', b: 'colorBlack' };
  document.getElementById(idMap[col]).classList.add('selected');
}

// ─── EVENT LISTENERS ─────────────────────────
document.getElementById('newGameBtn').addEventListener('click', openTimeModal);
document.getElementById('undoBtn').addEventListener('click', undoMove);
document.getElementById('playAgainBtn').addEventListener('click', openTimeModal);
document.getElementById('closeModalBtn').addEventListener('click', () => {
  document.getElementById('gameOverModal').classList.remove('show');
});

// ─── TIME MODAL LOGIC ────────────────────────
function openTimeModal() {
  stopTimer();
  document.getElementById('gameOverModal').classList.remove('show');
  document.getElementById('timeModal').classList.add('show');
  setSelectedTime(selectedTime);
  // Reset modal selections to current state
  selectMode(modalMode);
  selectDiff(modalDiff);
  selectColor(modalColor);
}

function setSelectedTime(seconds) {
  selectedTime = seconds;
  // Highlight selected preset
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.seconds) === seconds);
  });
  // Update info text
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const label = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  document.getElementById('selectedTimeInfo').innerHTML =
    `Tanlandi: <strong>${label}</strong> (har bir o'yinchi uchun)`;
}

// Preset button clicks
document.querySelectorAll('.time-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setSelectedTime(parseInt(btn.dataset.seconds));
    document.getElementById('customMinutes').value = '';
  });
});

// Custom time set button
document.getElementById('customSetBtn').addEventListener('click', () => {
  const val = parseInt(document.getElementById('customMinutes').value);
  if (!val || val < 1 || val > 120) {
    document.getElementById('customMinutes').style.borderColor = '#f87171';
    setTimeout(() => {
      document.getElementById('customMinutes').style.borderColor = '';
    }, 1200);
    return;
  }
  // Deselect all presets
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
  setSelectedTime(val * 60);
});

// Enter key on custom input
document.getElementById('customMinutes').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('customSetBtn').click();
});

// Start game button
document.getElementById('startGameBtn').addEventListener('click', () => {
  // Apply modal selections to game state
  isBotGame = (modalMode === 'bot');

  if (isBotGame) {
    botDifficulty = modalDiff;
    let chosenPlayerColor = modalColor;
    if (chosenPlayerColor === 'random') {
      chosenPlayerColor = Math.random() < 0.5 ? 'w' : 'b';
    }
    playerColorChoice = chosenPlayerColor;
    botColor = chosenPlayerColor === 'w' ? 'b' : 'w';
  }

  document.getElementById('timeModal').classList.remove('show');
  newGame();
});

// ─── INIT ─────────────────────────────────────
openTimeModal();
