(function () {
    'use strict';

    // Single owner of the annonce presentation strings, shared by the explorer cards
    // and the annonce detail surface so both always read the same record the same way.
    //
    // Every helper returns null when the underlying record has nothing real to show.
    // Callers must omit the line rather than substitute a default, an estimate or a
    // placeholder value.

    // numeric 'always' keeps a countable age: "il y a 2 j" rather than "avant-hier",
    // which is what tells a reader how stale an annonce is.
    const RELATIVE = typeof Intl.RelativeTimeFormat === 'function'
        ? new Intl.RelativeTimeFormat('fr', { numeric: 'always', style: 'short' })
        : null;

    const DATE_PARTS = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

    const DATE_MODE_LABELS = {
        ASAP: 'Dès que possible',
        FLEXIBLE: 'Date flexible',
        TO_AGREE: 'Date à convenir',
        EXACT: 'Date précise'
    };

    // Legacy rows predate date_mode and only carry the free-text urgency field.
    const LEGACY_URGENCY_MODES = {
        urgent: 'ASAP',
        asap: 'ASAP',
        today: 'ASAP',
        flexible: 'FLEXIBLE',
        week: 'FLEXIBLE',
        normale: 'FLEXIBLE',
        date: 'TO_AGREE',
        specific: 'TO_AGREE'
    };

    function capitalize(value) {
        return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
    }

    // A zero or negative budget is not a price: such legacy rows read as "on quote"
    // rather than as a free job. Migration 37 nulls them out at the source.
    function amount(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return null;
        return number.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }

    // "il y a 23 min", "il y a 6 h", "il y a 2 j" — the age of the annonce tells a
    // reader whether it is still worth answering.
    function relativeAge(createdAt) {
        const created = new Date(createdAt);
        if (!createdAt || Number.isNaN(created.getTime())) return null;
        const seconds = (Date.now() - created.getTime()) / 1000;
        if (seconds < 0) return null;
        if (!RELATIVE) return null;
        const scale = [
            ['minute', 60, 60],
            ['hour', 3600, 24],
            ['day', 86400, 7],
            ['week', 604800, 4.4],
            ['month', 2629800, 12],
            ['year', 31557600, Infinity]
        ];
        if (seconds < 60) return "à l'instant";
        for (const [unit, unitSeconds, limit] of scale) {
            const count = Math.floor(seconds / unitSeconds);
            if (count < limit) return RELATIVE.format(-count, unit);
        }
        return null;
    }

    // "PHOTOGRAPHIE · ÉVÉNEMENT & PORTRAIT". The subcategory lives in the taxonomy,
    // referenced by taxonomy_id, so it is resolved rather than duplicated on the row.
    function categoryLine(record, taxonomyLeaves) {
        const leaf = record?.taxonomy_id && Array.isArray(taxonomyLeaves)
            ? taxonomyLeaves.find(candidate => candidate.id === record.taxonomy_id)
            : null;
        const category = (leaf?.category || record?.category || '').trim();
        const subcategory = (leaf?.subcategory || '').trim();
        if (!category && !subcategory) return null;
        return [category, subcategory].filter(Boolean).join(' · ');
    }

    function dateMode(record) {
        const declared = String(record?.date_mode || '').toUpperCase();
        if (['ASAP', 'FLEXIBLE', 'EXACT', 'TO_AGREE'].includes(declared)) return declared;
        return LEGACY_URGENCY_MODES[String(record?.urgency || '').toLowerCase()] || null;
    }

    function exactDateLabel(value) {
        const date = new Date(value);
        if (!value || Number.isNaN(date.getTime())) return null;
        const day = capitalize(DATE_PARTS.format(date));
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const time = minutes ? `${hours}h${String(minutes).padStart(2, '0')}` : `${hours}h`;
        return `${day} · ${time}`;
    }

    function dateLabel(record) {
        const mode = dateMode(record);
        if (mode === 'EXACT') return exactDateLabel(record?.scheduled_at) || DATE_MODE_LABELS.TO_AGREE;
        return mode ? DATE_MODE_LABELS[mode] || null : null;
    }

    // Reads the declared price mode, and infers it for rows written before the mode
    // existed: a stored amount was always a fixed budget back then.
    function priceLabel(record) {
        const declared = String(record?.price_mode || '').toUpperCase();
        const low = amount(record?.budget);
        const high = amount(record?.budget_max);
        const mode = ['QUOTE', 'FIXED', 'RANGE'].includes(declared)
            ? declared
            : (low ? 'FIXED' : 'QUOTE');
        if (mode === 'RANGE' && low && high) return `${low} – ${high} €`;
        if (mode === 'FIXED' && low) return `${low} €`;
        if (mode === 'QUOTE') return 'Sur devis';
        return low ? `${low} €` : 'Sur devis';
    }

    // Real review aggregate only. average_rating is NULL until a member has been
    // rated, and no score is shown in that case.
    function ratingLabel(profile) {
        const average = Number(profile?.average_rating);
        const count = Number(profile?.reviews_count);
        if (!Number.isFinite(average) || average <= 0) return null;
        const score = average.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        return Number.isFinite(count) && count > 0 ? `${score} (${count})` : score;
    }

    function verifiedLabel(profile) {
        if (profile?.is_pro_verified) return 'Pro vérifié';
        if (profile?.is_verified) return 'Vérifié';
        return null;
    }

    function dateModeLabel(mode) {
        return DATE_MODE_LABELS[String(mode || '').toUpperCase()] || null;
    }

    function shortTitle(value) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text) return null;
        if (text.length <= 60) return text;
        const cut = text.slice(0, 61);
        const lastSpace = cut.lastIndexOf(' ');
        return (lastSpace > 20 ? cut.slice(0, lastSpace) : text.slice(0, 60)).trim();
    }

    window.LYANN_ANNONCE_FORMAT = {
        relativeAge, categoryLine, dateMode, dateLabel, dateModeLabel, exactDateLabel,
        priceLabel, ratingLabel, verifiedLabel, shortTitle
    };
})();
