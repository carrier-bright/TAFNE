// js/classes/tableHistory.js
// ===================================================================================
// 2. TABLE HISTORY MANAGER
// ===================================================================================
class TableHistoryManager {
    constructor(maxHistory = 100) {
        this.histories = {};
        this.maxHistory = maxHistory;
        this.isRestoring = false; // Flag to prevent saving during undo/redo
    }

    _getHistory(id) {
        if (!id) return null;
        if (!this.histories[id]) {
            this.histories[id] = {
                history: [],
                currentIndex: -1
            };
        }
        return this.histories[id];
    }

    saveState(tableHtml, id) {
        if (!id) return;

        // Don't save if we're restoring a state
        if (this.isRestoring) return;

        // Don't save empty states
        if (!tableHtml || tableHtml.trim() === '') return;

        const historyState = this._getHistory(id);
        if (!historyState) return;

        // Don't save if it's the same as the current state
        if (historyState.currentIndex >= 0 && historyState.history[historyState.currentIndex] === tableHtml) {
            return;
        }

        // Remove future states if we're not at the end
        historyState.history = historyState.history.slice(0, historyState.currentIndex + 1);
        historyState.history.push(tableHtml);

        // Limit history size
        if (historyState.history.length > this.maxHistory) {
            historyState.history.shift();
        }

        historyState.currentIndex = historyState.history.length - 1;

        console.log(`History saved for ${id}. Current index: ${historyState.currentIndex}, Total states: ${historyState.history.length}`);
        this.updateHistoryButtons(id);
    }

    undo(id) {
        const historyState = this._getHistory(id);
        if (!historyState || !this.canUndo(id)) {
            console.log(`Cannot undo - at beginning of history for ${id}`);
            return null;
        }

        historyState.currentIndex--;
        console.log(`Undo to index: ${historyState.currentIndex} for ${id}`);
        this.updateHistoryButtons(id);
        return historyState.history[historyState.currentIndex];
    }

    redo(id) {
        const historyState = this._getHistory(id);
        if (!historyState || !this.canRedo(id)) {
            console.log(`Cannot redo - at end of history for ${id}`);
            return null;
        }

        historyState.currentIndex++;
        console.log(`Redo to index: ${historyState.currentIndex} for ${id}`);
        this.updateHistoryButtons(id);
        return historyState.history[historyState.currentIndex];
    }

    canUndo(id) {
        const historyState = this.histories[id];
        return !!historyState && historyState.currentIndex > 0;
    }

    canRedo(id) {
        const historyState = this.histories[id];
        return !!historyState && historyState.currentIndex < historyState.history.length - 1;
    }

    clear(id) {
        if (id) {
            delete this.histories[id];
        } else {
            this.histories = {};
        }
        this.updateHistoryButtons(id);
        console.log(`History cleared for ${id || 'all sheets'}`);
    }

    updateHistoryButtons(id) {
        const historyState = this.histories[id] || null;
        const undoCount = historyState ? historyState.currentIndex : 0;
        const redoCount = historyState ? historyState.history.length - historyState.currentIndex - 1 : 0;

        $('.undoState').text(`${undoCount}`);
        $('.redoState').text(`${redoCount}`);

        // Enable/disable buttons
        $('.undoHistory').prop('disabled', !this.canUndo(id));
        $('.redoHistory').prop('disabled', !this.canRedo(id));

        // Update button appearance
        $('.undoHistory').css('opacity', this.canUndo(id) ? '1' : '0.5');
        $('.redoHistory').css('opacity', this.canRedo(id) ? '1' : '0.5');
    }
}

// Initialize global history manager
window.historyManager = new TableHistoryManager();

// ===================================================================================
// 3. HISTORY FUNCTIONS
// ===================================================================================

function getActiveHistoryId() {
    return window.currentTable ? $(window.currentTable).attr('data-tifany-id') : $('#tableContainer table').first().attr('data-tifany-id');
}

function refreshHistoryUI() {
    const activeId = getActiveHistoryId();
    if (activeId && window.historyManager) {
        window.historyManager.updateHistoryButtons(activeId);
    }
}

function restoreActiveTable(activeId) {
    // Try to restore the previously active table by data-tifany-id
    if (activeId) {
        const found = $(`#tableContainer table[data-tifany-id="${activeId}"]`)[0];
        window.currentTable = found || $('#tableContainer table')[0];
    } else {
        window.currentTable = $('#tableContainer table')[0];
    }
    refreshHistoryUI();
}

function performUndo() {
    const activeId = window.currentTable ? $(window.currentTable).attr('data-tifany-id') : $('#tableContainer table').first().attr('data-tifany-id');
    const state = window.historyManager.undo(activeId);
    if (state) {
        window.historyManager.isRestoring = true;

        $('#tableContainer').html(state);
        restoreActiveTable(activeId);

        if (typeof window.initializeAllFeatures === 'function') {
            window.initializeAllFeatures();
        }
        if (typeof window.setupTableInteraction === 'function') {
            window.setupTableInteraction();
        }

        window.historyManager.isRestoring = false;

        $.toast({
            heading: 'Undo',
            text: 'Action undone',
            icon: 'info',
            loader: false,
            stack: false,
            position: 'top-right',
            hideAfter: 2000
        });

        console.log('Undo performed successfully');
    } else {
        $.toast({
            heading: 'Info',
            text: 'Nothing to undo',
            icon: 'info',
            loader: false,
            stack: false,
            position: 'top-right',
            hideAfter: 2000
        });
    }
}

function performRedo() {
    const activeId = window.currentTable ? $(window.currentTable).attr('data-tifany-id') : $('#tableContainer table').first().attr('data-tifany-id');
    const state = window.historyManager.redo(activeId);
    if (state) {
        window.historyManager.isRestoring = true;

        $('#tableContainer').html(state);
        restoreActiveTable(activeId);

        if (typeof window.initializeAllFeatures === 'function') {
            window.initializeAllFeatures();
        }
        if (typeof window.setupTableInteraction === 'function') {
            window.setupTableInteraction();
        }

        window.historyManager.isRestoring = false;

        $.toast({
            heading: 'Redo',
            text: 'Action redone',
            icon: 'info',
            loader: false,
            stack: false,
            position: 'top-right',
            hideAfter: 2000
        });

        console.log('Redo performed successfully');
    } else {
        $.toast({
            heading: 'Info',
            text: 'Nothing to redo',
            icon: 'info',
            loader: false,
            stack: false,
            position: 'top-right',
            hideAfter: 2000
        });
    }
}

function saveCurrentState() {
    if (!window.historyManager.isRestoring) {
        const activeId = window.currentTable ? $(window.currentTable).attr('data-tifany-id') : $('#tableContainer table').first().attr('data-tifany-id');
        if (!activeId) return;

        const state = $('#tableContainer').html();
        window.historyManager.saveState(state, activeId);
        console.log(`Current state saved for ${activeId}`);
    }
}

// Make functions globally accessible
window.performUndo = performUndo;
window.performRedo = performRedo;
window.saveCurrentState = saveCurrentState;
window.refreshHistoryUI = refreshHistoryUI;
window.getActiveHistoryId = getActiveHistoryId;