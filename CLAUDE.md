# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no build, no tests, no linter. UI text and README are in Spanish.

## Run

Open `index.html` directly, or serve statically: `python3 -m http.server 8000` then visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (layout, element IDs), `style.css`, `game.js` (all logic, one script, loaded without modules).

`game.js` structure:
- Game state is module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...), reset in `init()`. Restart button calls `init()`.
- `board` is a `ROWS x COLS` grid of ints: 0 empty, 1-7 index into `COLORS`/`PIECES` (index 0 is `null` in both). Piece shapes embed their own type index as cell value.
- Loop: `requestAnimationFrame(loop)` accumulates `dropAccum` and gravity-drops when `>= dropInterval`. Pause/game over must `cancelAnimationFrame(animId)`; unpause restarts `loop` manually.
- Piece lifecycle: `lockPiece()` = `merge()` -> `clearLines()` -> `spawn()`. `spawn()` promotes `next`, and calls `endGame()` if spawn position collides.
- `collide(shape, ox, oy)` is the single collision check (walls, floor, board); used by movement, rotation (`tryRotate` wall kicks `[0,-1,1,-2,2]`), ghost (`ghostY`), and spawn.
- Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`. Line score `LINE_SCORES[n] * level`; soft drop +1/cell, hard drop +2/cell.
- HUD updates are manual via `updateHUD()` (no reactivity); call it after any score/lines/level change.
- Keyboard handling is one `keydown` listener using `e.code`. Canvas pixel size is set in `index.html` (`300x600` = `COLS*BLOCK` x `ROWS*BLOCK`); changing `COLS`/`ROWS`/`BLOCK` requires updating the canvas attributes too.
