// ===================================================================================
// TABLE RULER — column and row index strips around .tablecoil tables
//   renderTableRulers(table) — builds/rebuilds ruler wrap around a table
//   highlightRuler(table, cells) — highlights ruler segments for selected cells
//   destroyRulers(table) — removes ruler wrap and restores table to original position
// ===================================================================================

window.tableRuler = (function () {

    const DBL_CLICK_MS = 300; // max ms between clicks to count as double-click

    // ── Measure the rendered width of each visual column ─────────────────────
    function _measureCols(mapper) {
        const widths = new Array(mapper.maxCols).fill(null);
        const seen   = new Array(mapper.maxCols).fill(false);

        mapper.cellMap.forEach((info, cell) => {
            if (info.colspan === 1 && !seen[info.startCol]) {
                const w = cell.getBoundingClientRect().width;
                if (w > 0) {
                    widths[info.startCol] = Math.round(w);
                    seen[info.startCol]   = true;
                }
            }
        });

        const nonNull = widths.filter(w => w !== null);
        const avg     = nonNull.length > 0
            ? Math.round(nonNull.reduce((s, w) => s + w, 0) / nonNull.length)
            : 80;

        return widths.map(w => w !== null ? w : avg);
    }

    // ── Measure the rendered height of each table row ─────────────────────────
    function _measureRows(table) {
        return Array.from(table.rows).map(r => {
            const h = r.getBoundingClientRect().height;
            return h > 0 ? Math.round(h) : 24;
        });
    }

    // ── Apply a ruler-driven selection (row or column) ────────────────────────
    function _applyRulerSelection(table, cells, type) {
        const filtered = cells.filter(c => !$(c).hasClass('drag-handle'));
        $(table).find('.selected-cell').removeClass('selected-cell');
        filtered.forEach(c => $(c).addClass('selected-cell'));
        window.selectedCells       = filtered;
        window.selectionAnchorCell = filtered[0]                    || null;
        window.selectionHeadCell   = filtered[filtered.length - 1]  || null;
        window.currentTable        = table;
        const $dd = $('#elementType');
        if ($dd.length) $dd.val(type);
        requestAnimationFrame(() => {
            if (typeof window.highlightRuler === 'function') {
                window.highlightRuler(table, window.selectedCells);
            }
        });
    }

    // ── Range-select multiple rows (click-drag on row ruler) ──────────────────
    function _startRulerRowSelect($wrap, table, anchorIdx, e) {
        const $segs  = $wrap.find('.tafne-row-ruler .ruler-seg');
        const mapper = new window.VisualGridMapper(table);

        function _selectRange(from, to) {
            const min = Math.min(from, to);
            const max = Math.max(from, to);
            const cells = [];
            for (let r = min; r <= max; r++) {
                mapper.getCellsInRow(r).forEach(c => {
                    if (!$(c).hasClass('drag-handle')) cells.push(c);
                });
            }
            $(table).find('.selected-cell').removeClass('selected-cell');
            cells.forEach(c => $(c).addClass('selected-cell'));
            window.selectedCells       = cells;
            window.selectionAnchorCell = cells[0]                    || null;
            window.selectionHeadCell   = cells[cells.length - 1]     || null;
            window.currentTable        = table;
            const $dd = $('#elementType');
            if ($dd.length) $dd.val('row');
            if (typeof window.highlightRuler === 'function') {
                window.highlightRuler(table, window.selectedCells);
            }
        }

        function _idxAtY(y) {
            let idx = anchorIdx;
            $segs.each(function (i) {
                const rect = this.getBoundingClientRect();
                if (y >= rect.top && y <= rect.bottom) { idx = i; return false; }
            });
            return idx;
        }

        _selectRange(anchorIdx, anchorIdx);

        $(document).on('mousemove.rulerrowsel', function (mv) {
            _selectRange(anchorIdx, _idxAtY(mv.clientY));
        });
        $(document).one('mouseup.rulerrowsel', function () {
            $(document).off('mousemove.rulerrowsel');
        });
    }

    // ── Range-select multiple columns (click-drag on col ruler) ───────────────
    function _startRulerColSelect($wrap, table, anchorIdx, e) {
        const $segs  = $wrap.find('.tafne-col-ruler .ruler-seg');
        const mapper = new window.VisualGridMapper(table);

        function _selectRange(from, to) {
            const min = Math.min(from, to);
            const max = Math.max(from, to);
            const cells = [];
            for (let c = min; c <= max; c++) {
                mapper.getCellsInColumn(c).forEach(cell => {
                    if (!$(cell).hasClass('drag-handle')) cells.push(cell);
                });
            }
            $(table).find('.selected-cell').removeClass('selected-cell');
            cells.forEach(c => $(c).addClass('selected-cell'));
            window.selectedCells       = cells;
            window.selectionAnchorCell = cells[0]                    || null;
            window.selectionHeadCell   = cells[cells.length - 1]     || null;
            window.currentTable        = table;
            const $dd = $('#elementType');
            if ($dd.length) $dd.val('column');
            if (typeof window.highlightRuler === 'function') {
                window.highlightRuler(table, window.selectedCells);
            }
        }

        function _idxAtX(x) {
            let idx = anchorIdx;
            $segs.each(function (i) {
                const rect = this.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right) { idx = i; return false; }
            });
            return idx;
        }

        _selectRange(anchorIdx, anchorIdx);

        $(document).on('mousemove.rulercolsel', function (mv) {
            _selectRange(anchorIdx, _idxAtX(mv.clientX));
        });
        $(document).one('mouseup.rulercolsel', function () {
            $(document).off('mousemove.rulercolsel');
        });
    }

    // ── Move row by visual index (insertBefore = target position 0..N) ────────
    function _moveRowByIndex(table, fromIdx, insertBefore) {
        if (insertBefore === fromIdx || insertBefore === fromIdx + 1) return;
        const $rows = $(table).find('tr').not('.tifany-drag-row').not('.drop-indicator-row');
        const $from = $rows.eq(fromIdx);
        if (!$from.length) return;
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
        if (insertBefore <= 0) {
            $rows.first().before($from);
        } else if (insertBefore >= $rows.length) {
            $rows.last().after($from);
        } else {
            $rows.eq(insertBefore).before($from);
        }
        requestAnimationFrame(() => renderTableRulers(table));
    }

    // ── Move col by mapper index — no row-handle offset (ruler context) ───────
    function _moveColByIndex(table, fromIdx, insertBefore) {
        if (fromIdx === insertBefore || fromIdx + 1 === insertBefore) return;
        const mapper  = new window.VisualGridMapper(table);
        const moved   = new Set();
        // toIdx: the mapper column before which the dragged column should land
        const toIdx   = insertBefore > fromIdx ? insertBefore - 1 : insertBefore;
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();

        for (let r = 0; r < mapper.maxRows; r++) {
            const row = mapper.grid[r];
            if (!row) continue;
            const src = row[fromIdx];
            if (!src || !src.isOrigin || moved.has(src.element)) continue;
            moved.add(src.element);
            const $el = $(src.element);
            if ($el.hasClass('drag-handle')) continue;
            const dst = row[toIdx];
            if (dst && dst.isOrigin && dst.element !== src.element) {
                // Insert before (toIdx < fromIdx) or after (toIdx > fromIdx) the destination
                if (insertBefore > fromIdx) {
                    $(dst.element).after($el);
                } else {
                    $(dst.element).before($el);
                }
            } else if (!dst) {
                $el.closest('tr').append($el);
            } else {
                // Target is inside a colspan span — find next origin to the right
                let found = null;
                for (let c = toIdx + 1; c < mapper.maxCols; c++) {
                    if (row[c] && row[c].isOrigin && row[c].element !== src.element) {
                        found = row[c].element;
                        break;
                    }
                }
                if (found) $(found).before($el);
                else $el.closest('tr').append($el);
            }
        }

        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
        requestAnimationFrame(() => renderTableRulers(table));
    }

    // ── Row ruler drag ────────────────────────────────────────────────────────
    function _startRulerRowDrag($wrap, table, rowIdx, e) {
        e.preventDefault();
        e.stopPropagation();
        const $segs = $wrap.find('.tafne-row-ruler .ruler-seg');
        const n     = $segs.length;
        let insertBefore = rowIdx;

        $segs.eq(rowIdx).addClass('ruler-drag-src');

        function onMove(mv) {
            let ib = 0;
            $segs.each(function (i) {
                const rect = this.getBoundingClientRect();
                if (mv.clientY > rect.top + rect.height / 2) ib = i + 1;
            });
            if (ib > n) ib = n;
            insertBefore = ib;
            $segs.removeClass('ruler-drop-before ruler-drop-after');
            if (ib !== rowIdx && ib !== rowIdx + 1) {
                if (ib < n) $segs.eq(ib).addClass('ruler-drop-before');
                else        $segs.eq(n - 1).addClass('ruler-drop-after');
            }
        }

        $(document).on('mousemove.rulerdrag', onMove);
        $(document).one('mouseup.rulerdrag', function () {
            $(document).off('mousemove.rulerdrag');
            $segs.removeClass('ruler-drag-src ruler-drop-before ruler-drop-after');
            _moveRowByIndex(table, rowIdx, insertBefore);
        });
    }

    // ── Col ruler drag ────────────────────────────────────────────────────────
    function _startRulerColDrag($wrap, table, colIdx, e) {
        e.preventDefault();
        e.stopPropagation();
        const $segs  = $wrap.find('.tafne-col-ruler .ruler-seg');
        const n      = $segs.length;
        let insertBefore = colIdx;

        $segs.eq(colIdx).addClass('ruler-drag-src');
        const mapper = new window.VisualGridMapper(table);
        $(mapper.getCellsInColumn(colIdx)).not('.drag-handle').addClass('column-dragging');

        function onMove(mv) {
            let ib = 0;
            $segs.each(function (i) {
                const rect = this.getBoundingClientRect();
                if (mv.clientX > rect.left + rect.width / 2) ib = i + 1;
            });
            if (ib > n) ib = n;
            insertBefore = ib;
            $segs.removeClass('ruler-drop-before ruler-drop-after');
            if (ib !== colIdx && ib !== colIdx + 1) {
                if (ib < n) $segs.eq(ib).addClass('ruler-drop-before');
                else        $segs.eq(n - 1).addClass('ruler-drop-after');
            }
        }

        $(document).on('mousemove.rulerdrag', onMove);
        $(document).one('mouseup.rulerdrag', function () {
            $(document).off('mousemove.rulerdrag');
            $segs.removeClass('ruler-drag-src ruler-drop-before ruler-drop-after');
            $(mapper.getCellsInColumn(colIdx)).removeClass('column-dragging');
            _moveColByIndex(table, colIdx, insertBefore);
        });
    }

    // ── Build and inject ruler strips around a table ──────────────────────────
    function renderTableRulers(table) {
        const $table = $(table);
        if (!$table.length) return;

        // Skip hidden tables (inside collapsed accordion) — will be rebuilt on open
        if ($table[0].getBoundingClientRect().width === 0) return;

        // Guard against re-entrant calls from ResizeObserver
        if (table._tafneRulerRebuilding) return;

        // Remove any existing ruler wrap for this table
        const $existing = $table.closest('.tafne-ruler-wrap');
        if ($existing.length) {
            $existing.before($table);
            $existing.remove();
        }

        const mapper = new VisualGridMapper(table);
        if (mapper.maxCols === 0 || mapper.maxRows === 0) return;

        const colWidths  = _measureCols(mapper);
        const rowHeights = _measureRows(table);

        // Column ruler segments
        const colSegs = colWidths.map((w, i) =>
            `<div class="ruler-seg" data-col="${i}" style="min-width:${w}px;max-width:${w}px" title="Col ${i + 1}">${i + 1}</div>`
        ).join('');

        // Row ruler segments
        const rowSegs = rowHeights.map((h, i) =>
            `<div class="ruler-seg" data-row="${i}" style="min-height:${h}px;max-height:${h}px" title="Row ${i + 1}">${i + 1}</div>`
        ).join('');

        // Assemble wrapper:
        //   header  = [corner | col-ruler-viewport (overflow:hidden, sync'd by JS)]
        //   body    = [row-ruler (always visible) | table-viewport (overflow-x:auto)]
        const $wrap = $(`
            <div class="tafne-ruler-wrap">
                <div class="tafne-ruler-header">
                    <div class="tafne-corner"></div>
                    <div class="tafne-col-ruler-vp">
                        <div class="tafne-col-ruler">${colSegs}</div>
                    </div>
                </div>
                <div class="tafne-ruler-body">
                    <div class="tafne-row-ruler">${rowSegs}</div>
                    <div class="tafne-table-vp"></div>
                </div>
            </div>
        `);

        // Move table into the table viewport
        $table.before($wrap);
        $wrap.find('.tafne-table-vp').append($table);

        // Sync horizontal scroll: table-vp → col-ruler-vp
        const tableVp    = $wrap.find('.tafne-table-vp')[0];
        const colRulerVp = $wrap.find('.tafne-col-ruler-vp')[0];
        tableVp.addEventListener('scroll', function () {
            colRulerVp.scrollLeft = this.scrollLeft;
        }, { passive: true });

        // Ruler highlight on cell click
        $table.off('click.ruler mousedown.ruler').on('click.ruler mousedown.ruler', 'td, th', function () {
            requestAnimationFrame(() => {
                if (typeof window.highlightRuler === 'function') {
                    window.highlightRuler(table, window.selectedCells);
                }
            });
        });

        // ── Row ruler: click-drag = range select; dbl-click-drag = reorder ──────
        // Mirrors iOS Numbers: one tap/drag selects, double-tap-drag reorders.
        let _rowLastClickTime = 0;
        let _rowLastClickIdx  = -1;

        $wrap.find('.tafne-row-ruler').on('mousedown', '.ruler-seg', function (e) {
            if (e.button !== 0) return;
            const rowIdx = parseInt($(this).attr('data-row'), 10);
            const now    = Date.now();
            const isDbl  = (now - _rowLastClickTime < DBL_CLICK_MS) && (_rowLastClickIdx === rowIdx);
            _rowLastClickTime = now;
            _rowLastClickIdx  = rowIdx;

            if (isDbl) {
                _startRulerRowDrag($wrap, table, rowIdx, e);
            } else {
                _startRulerRowSelect($wrap, table, rowIdx, e);
            }

            e.preventDefault();
            e.stopPropagation();
        });

        // ── Col ruler: click-drag = range select; dbl-click-drag = reorder ──────
        let _colLastClickTime = 0;
        let _colLastClickIdx  = -1;

        $wrap.find('.tafne-col-ruler-vp').on('mousedown', '.ruler-seg', function (e) {
            if (e.button !== 0) return;
            const colIdx = parseInt($(this).attr('data-col'), 10);
            const now    = Date.now();
            const isDbl  = (now - _colLastClickTime < DBL_CLICK_MS) && (_colLastClickIdx === colIdx);
            _colLastClickTime = now;
            _colLastClickIdx  = colIdx;

            if (isDbl) {
                _startRulerColDrag($wrap, table, colIdx, e);
            } else {
                _startRulerColSelect($wrap, table, colIdx, e);
            }

            e.preventDefault();
            e.stopPropagation();
        });

        // ── ResizeObserver + window resize: rebuild ruler if table changes size ─
        if (table._tafneRulerObs) {
            table._tafneRulerObs.disconnect();
        }
        if (table._tafneResizeHandler) {
            window.removeEventListener('resize', table._tafneResizeHandler);
        }

        function _scheduleRulerRebuild() {
            if (table._tafneRulerRebuilding) return;
            clearTimeout(table._tafneRulerTimer);
            table._tafneRulerTimer = setTimeout(() => {
                if (!$(table).closest('.tafne-ruler-wrap').length) return;
                table._tafneRulerRebuilding = true;
                renderTableRulers(table);
                table._tafneRulerRebuilding = false;
            }, 120);
        }

        if (window.ResizeObserver) {
            const ro = new ResizeObserver(_scheduleRulerRebuild);
            ro.observe(table);
            table._tafneRulerObs = ro;
        }

        // Fallback: window resize covers container reflows the ResizeObserver may miss
        table._tafneResizeHandler = _scheduleRulerRebuild;
        window.addEventListener('resize', table._tafneResizeHandler, { passive: true });
    }

    // ── Highlight ruler segments matching the current selection ───────────────
    function highlightRuler(table, cells) {
        const $wrap = $(table).closest('.tafne-ruler-wrap');
        if (!$wrap.length) return;

        $wrap.find('.ruler-seg.ruler-active').removeClass('ruler-active');
        if (!cells || cells.length === 0) return;

        const mapper     = new VisualGridMapper(table);
        const activeRows = new Set();
        const activeCols = new Set();

        cells.forEach(cell => {
            const pos = mapper.getVisualPosition(cell);
            if (!pos) return;
            for (let r = pos.startRow; r < pos.startRow + pos.rowspan; r++) activeRows.add(r);
            for (let c = pos.startCol; c < pos.startCol + pos.colspan; c++) activeCols.add(c);
        });

        activeRows.forEach(r => $wrap.find(`.ruler-seg[data-row="${r}"]`).addClass('ruler-active'));
        activeCols.forEach(c => $wrap.find(`.ruler-seg[data-col="${c}"]`).addClass('ruler-active'));
    }

    // ── Remove ruler and restore table to its original parent ─────────────────
    function destroyRulers(table) {
        if (table._tafneRulerObs) {
            table._tafneRulerObs.disconnect();
            delete table._tafneRulerObs;
        }
        if (table._tafneResizeHandler) {
            window.removeEventListener('resize', table._tafneResizeHandler);
            delete table._tafneResizeHandler;
        }
        clearTimeout(table._tafneRulerTimer);
        const $table = $(table);
        const $wrap  = $table.closest('.tafne-ruler-wrap');
        if ($wrap.length) {
            $wrap.before($table);
            $wrap.remove();
        }
    }

    return { renderTableRulers, highlightRuler, destroyRulers };
})();

window.renderTableRulers = window.tableRuler.renderTableRulers;
window.highlightRuler    = window.tableRuler.highlightRuler;
window.destroyRulers     = window.tableRuler.destroyRulers;
