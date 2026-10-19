/**
 * LYANN 6.35 — Independent milestone allocation.
 * Editing one jalon never silently recalculates the others.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_MILESTONE_EDITOR = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const MAX_MILESTONES = 12;
    const CENT = 100;

    function roundCents(value) {
        return Math.round((Number(value) || 0) * CENT);
    }

    function fromCents(cents) {
        return Math.round(Number(cents) || 0) / CENT;
    }

    function parseDecimal(raw) {
        if (raw == null) return { ok: false, empty: true, value: 0, incomplete: false };
        const trimmed = String(raw).trim().replace(/\u00a0/g, ' ').replace(/\s/g, '');
        if (!trimmed) return { ok: true, empty: true, value: 0, incomplete: false };
        const normalized = trimmed.replace(',', '.');
        if (normalized === '-' || normalized === '.' || /^-?\d+\.$/.test(normalized)) {
            return { ok: true, empty: false, value: Number(normalized.replace('.', '')) || 0, incomplete: true };
        }
        if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { ok: false, empty: false, value: 0, incomplete: false };
        const value = Number(normalized);
        if (!Number.isFinite(value)) return { ok: false, empty: false, value: 0, incomplete: false };
        return { ok: true, empty: false, value, incomplete: false };
    }

    function formatMoney(euros) {
        return fromCents(roundCents(euros)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPercent(value) {
        const n = Math.round((Number(value) || 0) * CENT) / CENT;
        return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }

    function createState(options) {
        const defaults = (options && options.defaults) || [
            { title: '', percent: 30, amount: 0 },
            { title: '', percent: 30, amount: 0 },
            { title: '', percent: 40, amount: 0 }
        ];
        let seq = 0;
        const rows = defaults.map((row) => {
            seq += 1;
            return {
                id: 'm-' + seq,
                title: row.title || '',
                percent: Number(row.percent) || 0,
                amountCents: roundCents(row.amount || 0)
            };
        });
        return { seq, rows };
    }

    function amountCentsFromPercent(totalCents, percent) {
        if (!(totalCents > 0)) return 0;
        return Math.round(totalCents * (Number(percent) || 0) / 100);
    }

    function percentFromAmountCents(totalCents, amountCents) {
        if (!(totalCents > 0)) return 0;
        return Math.round((Number(amountCents) || 0) / totalCents * 10000) / 100;
    }

    function applyPercent(state, id, percent, totalEuros) {
        const totalCents = roundCents(totalEuros);
        const row = state.rows.find((item) => item.id === id);
        if (!row) return null;
        const nextPercent = Math.max(0, Number(percent) || 0);
        row.percent = Math.round(nextPercent * CENT) / CENT;
        row.amountCents = amountCentsFromPercent(totalCents, row.percent);
        return row;
    }

    function applyAmount(state, id, amountEuros, totalEuros) {
        const totalCents = roundCents(totalEuros);
        const row = state.rows.find((item) => item.id === id);
        if (!row) return null;
        row.amountCents = Math.max(0, roundCents(amountEuros));
        row.percent = percentFromAmountCents(totalCents, row.amountCents);
        return row;
    }

    function applyTotal(state, totalEuros) {
        const totalCents = roundCents(totalEuros);
        state.rows.forEach((row) => {
            row.amountCents = amountCentsFromPercent(totalCents, row.percent);
        });
        return state.rows;
    }

    function addRow(state) {
        if (state.rows.length >= MAX_MILESTONES) return null;
        state.seq += 1;
        const row = { id: 'm-' + state.seq, title: '', percent: 0, amountCents: 0 };
        state.rows.push(row);
        return row;
    }

    function removeRow(state, id) {
        if (state.rows.length <= 1) return false;
        const next = state.rows.filter((row) => row.id !== id);
        if (next.length === state.rows.length) return false;
        state.rows = next;
        return true;
    }

    function snapshot(state) {
        return state.rows.map((row) => ({
            id: row.id,
            title: row.title,
            percent: row.percent,
            amount: fromCents(row.amountCents),
            amountCents: row.amountCents
        }));
    }

    function summary(state, totalEuros) {
        const totalCents = roundCents(totalEuros);
        const allocatedCents = state.rows.reduce((sum, row) => sum + row.amountCents, 0);
        const percentSum = Math.round(state.rows.reduce((sum, row) => sum + row.percent, 0) * CENT) / CENT;
        const remainingCents = totalCents - allocatedCents;
        return {
            total: fromCents(totalCents),
            allocated: fromCents(allocatedCents),
            remaining: fromCents(remainingCents),
            percentSum,
            remainingCents,
            balanced: totalCents > 0 && remainingCents === 0
        };
    }

    function assignRemainder(state, id, totalEuros) {
        const totalCents = roundCents(totalEuros);
        const row = state.rows.find((item) => item.id === id);
        if (!row || !(totalCents > 0)) return null;
        const others = state.rows.reduce((sum, item) => item.id === id ? sum : sum + item.amountCents, 0);
        row.amountCents = Math.max(0, totalCents - others);
        row.percent = percentFromAmountCents(totalCents, row.amountCents);
        return row;
    }

    function rowHasData(row) {
        return !!(String(row.title || '').trim() || row.percent || row.amountCents);
    }

    function validate(state, totalEuros) {
        const totalCents = roundCents(totalEuros);
        if (!(totalCents > 0)) return { ok: false, message: 'Indiquez un montant total.' };
        if (!state.rows.length) return { ok: false, message: 'Ajoutez au moins un jalon.' };
        for (let i = 0; i < state.rows.length; i += 1) {
            const row = state.rows[i];
            if (!String(row.title || '').trim()) {
                return { ok: false, message: 'Chaque jalon doit avoir un nom.' };
            }
            if (row.amountCents < 0 || row.percent < 0) {
                return { ok: false, message: 'Les montants et pourcentages ne peuvent pas être négatifs.' };
            }
        }
        const allocated = state.rows.reduce((sum, row) => sum + row.amountCents, 0);
        if (allocated !== totalCents) {
            const view = summary(state, totalEuros);
            return {
                ok: false,
                message: 'La somme des jalons doit égaler le total du devis (' + formatMoney(view.total) + ' €). Réparti : ' + formatMoney(view.allocated) + ' €.'
            };
        }
        return {
            ok: true,
            milestones: state.rows.map((row, index) => ({
                key: row.id,
                title: String(row.title).trim(),
                description: 'Phase ' + (index + 1),
                amount: fromCents(row.amountCents),
                percentage: row.percent
            }))
        };
    }

    return {
        MAX_MILESTONES,
        parseDecimal,
        roundCents,
        fromCents,
        formatMoney,
        formatPercent,
        createState,
        applyPercent,
        applyAmount,
        applyTotal,
        addRow,
        removeRow,
        snapshot,
        summary,
        assignRemainder,
        rowHasData,
        validate
    };
});
